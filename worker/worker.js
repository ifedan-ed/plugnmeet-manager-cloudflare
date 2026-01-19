// worker.js - Cloudflare Worker Backend for PlugNMeet Manager
// Deploy via Cloudflare Dashboard: Workers & Pages → Create Worker → Edit Code
// Required KV Bindings: DATA, SESSIONS

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getCorsHeaders(env, request) {
  // If ALLOWED_ORIGIN is set, restrict CORS to that domain
  // Otherwise allow all (for development)
  const origin = request.headers.get('Origin') || '*';
  const allowedOrigin = env.ALLOWED_ORIGIN || '*';
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin === '*' ? '*' : allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

// Password hashing with salt (use bcrypt in production for better security)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'plugnmeet-salt-2024-secure');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateToken() {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL SENDING
// ═══════════════════════════════════════════════════════════════════════════

// Option 1: Resend (set RESEND_API_KEY in Worker variables)
async function sendEmailResend(env, to, subject, html) {
  if (!env.RESEND_API_KEY) return { success: false, error: 'RESEND_API_KEY not set' };
  
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'PlugNMeet <noreply@yourdomain.com>',
      to: [to],
      subject,
      html
    })
  });
  return { success: response.ok, data: await response.json() };
}

// Option 2: MailChannels (free with Cloudflare Workers, just add SPF record)
async function sendEmailMailChannels(to, subject, html, from) {
  const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from || 'noreply@yourdomain.com', name: 'PlugNMeet' },
      subject,
      content: [{ type: 'text/html', value: html }]
    })
  });
  return { success: response.ok, status: response.status };
}

// Email template
function inviteEmailTemplate(name, meetingTitle, joinLink, isAdmin) {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; margin: 0; }
    .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 40px; }
    h1 { color: #f8fafc; font-size: 24px; margin-bottom: 20px; }
    p { color: #94a3b8; line-height: 1.6; margin-bottom: 16px; }
    .button { display: inline-block; background: linear-gradient(135deg, #8b5cf6, #d946ef); color: white !important; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; margin: 20px 0; }
    .role { display: inline-block; background: ${isAdmin ? '#f59e0b20' : '#8b5cf620'}; color: ${isAdmin ? '#fbbf24' : '#a78bfa'}; padding: 4px 12px; border-radius: 20px; font-size: 12px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #334155; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div style="text-align:center;font-size:48px;margin-bottom:20px;">📹</div>
    <h1>You're Invited!</h1>
    <p>Hi ${name},</p>
    <p>You've been invited to <strong>${meetingTitle}</strong> as a <span class="role">${isAdmin ? 'Moderator' : 'Participant'}</span>.</p>
    ${joinLink ? `<p><a href="${joinLink}" class="button">Join Meeting</a></p>` : '<p><em>Join link will be sent separately.</em></p>'}
    <div class="footer">Sent via PlugNMeet Manager</div>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    const CORS = getCorsHeaders(env, request);
    
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ─────────────────────────────────────────────────────────────────────
      // PUBLIC AUTH ROUTES
      // ─────────────────────────────────────────────────────────────────────

      // Register
      if (path === '/api/auth/register' && request.method === 'POST') {
        const { name, email, password } = await request.json();
        
        if (!name || !email || !password) {
          return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), { status: 400, headers: CORS });
        }
        
        if (password.length < 6) {
          return new Response(JSON.stringify({ success: false, error: 'Password must be at least 6 characters' }), { status: 400, headers: CORS });
        }

        const existing = await env.DATA.get(`user:${email.toLowerCase()}`);
        if (existing) {
          return new Response(JSON.stringify({ success: false, error: 'Email already registered' }), { status: 400, headers: CORS });
        }

        const user = {
          id: crypto.randomUUID(),
          name: name.trim(),
          email: email.toLowerCase().trim(),
          password: await hashPassword(password),
          role: 'moderator',
          createdAt: Date.now()
        };

        await env.DATA.put(`user:${user.email}`, JSON.stringify(user));

        const usersList = JSON.parse(await env.DATA.get('users:list') || '[]');
        usersList.push({ id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt });
        await env.DATA.put('users:list', JSON.stringify(usersList));

        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      // Login
      if (path === '/api/auth/login' && request.method === 'POST') {
        const { email, password } = await request.json();

        const userData = await env.DATA.get(`user:${email.toLowerCase()}`);
        if (!userData) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), { status: 401, headers: CORS });
        }

        const user = JSON.parse(userData);
        if (user.password !== await hashPassword(password)) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), { status: 401, headers: CORS });
        }

        const token = generateToken();
        await env.SESSIONS.put(token, JSON.stringify({ userId: user.id, email: user.email }), { expirationTtl: 604800 }); // 7 days

        const { password: _, ...safeUser } = user;
        return new Response(JSON.stringify({ success: true, token, user: safeUser }), { headers: CORS });
      }

      // Initialize (create default admin - run once)
      if (path === '/api/init' && request.method === 'POST') {
        const usersList = await env.DATA.get('users:list');
        if (usersList && JSON.parse(usersList).length > 0) {
          return new Response(JSON.stringify({ success: false, error: 'Already initialized' }), { status: 400, headers: CORS });
        }

        const admin = {
          id: crypto.randomUUID(),
          name: 'Admin User',
          email: 'admin@example.com',
          password: await hashPassword('admin123'),
          role: 'admin',
          createdAt: Date.now()
        };

        await env.DATA.put(`user:${admin.email}`, JSON.stringify(admin));
        await env.DATA.put('users:list', JSON.stringify([{ id: admin.id, email: admin.email, name: admin.name, role: admin.role, createdAt: admin.createdAt }]));

        return new Response(JSON.stringify({ success: true, message: 'Admin created: admin@example.com / admin123 - CHANGE THIS PASSWORD!' }), { headers: CORS });
      }

      // ─────────────────────────────────────────────────────────────────────
      // AUTH MIDDLEWARE - All routes below require authentication
      // ─────────────────────────────────────────────────────────────────────

      const authHeader = request.headers.get('Authorization');
      const token = authHeader?.replace('Bearer ', '');
      let currentUser = null;

      if (token) {
        const session = await env.SESSIONS.get(token);
        if (session) {
          const { email } = JSON.parse(session);
          const userData = await env.DATA.get(`user:${email}`);
          if (userData) {
            const { password: _, ...user } = JSON.parse(userData);
            currentUser = user;
          }
        }
      }

      if (!currentUser) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: CORS });
      }

      // ─────────────────────────────────────────────────────────────────────
      // MEETINGS
      // ─────────────────────────────────────────────────────────────────────

      if (path === '/api/meetings' && request.method === 'GET') {
        const meetings = JSON.parse(await env.DATA.get('meetings:list') || '[]');
        return new Response(JSON.stringify({ success: true, meetings }), { headers: CORS });
      }

      if (path === '/api/meetings' && request.method === 'POST') {
        const data = await request.json();
        const meeting = {
          id: crypto.randomUUID(),
          ...data,
          createdBy: currentUser.id,
          createdAt: Date.now()
        };

        const meetings = JSON.parse(await env.DATA.get('meetings:list') || '[]');
        meetings.push(meeting);
        await env.DATA.put('meetings:list', JSON.stringify(meetings));

        return new Response(JSON.stringify({ success: true, meeting }), { headers: CORS });
      }

      if (path.startsWith('/api/meetings/') && request.method === 'DELETE') {
        const id = path.split('/')[3];
        let meetings = JSON.parse(await env.DATA.get('meetings:list') || '[]');
        meetings = meetings.filter(m => m.id !== id);
        await env.DATA.put('meetings:list', JSON.stringify(meetings));
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      // ─────────────────────────────────────────────────────────────────────
      // INVITES
      // ─────────────────────────────────────────────────────────────────────

      if (path === '/api/invites' && request.method === 'GET') {
        const invites = JSON.parse(await env.DATA.get('invites:list') || '[]');
        return new Response(JSON.stringify({ success: true, invites }), { headers: CORS });
      }

      if (path === '/api/invites' && request.method === 'POST') {
        const data = await request.json();
        const invite = {
          id: crypto.randomUUID(),
          ...data,
          createdBy: currentUser.id,
          createdAt: Date.now(),
          status: 'pending'
        };

        const invites = JSON.parse(await env.DATA.get('invites:list') || '[]');
        invites.push(invite);
        await env.DATA.put('invites:list', JSON.stringify(invites));

        return new Response(JSON.stringify({ success: true, invite }), { headers: CORS });
      }

      if (path.startsWith('/api/invites/') && request.method === 'DELETE') {
        const id = path.split('/')[3];
        let invites = JSON.parse(await env.DATA.get('invites:list') || '[]');
        invites = invites.filter(i => i.id !== id);
        await env.DATA.put('invites:list', JSON.stringify(invites));
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      // ─────────────────────────────────────────────────────────────────────
      // CHANGE PASSWORD
      // ─────────────────────────────────────────────────────────────────────

      if (path === '/api/auth/change-password' && request.method === 'POST') {
        const { currentPassword, newPassword } = await request.json();
        
        if (!newPassword || newPassword.length < 6) {
          return new Response(JSON.stringify({ success: false, error: 'Password must be at least 6 characters' }), { status: 400, headers: CORS });
        }

        const userData = await env.DATA.get(`user:${currentUser.email}`);
        const user = JSON.parse(userData);
        
        if (user.password !== await hashPassword(currentPassword)) {
          return new Response(JSON.stringify({ success: false, error: 'Current password is incorrect' }), { status: 400, headers: CORS });
        }

        user.password = await hashPassword(newPassword);
        await env.DATA.put(`user:${currentUser.email}`, JSON.stringify(user));

        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      // ─────────────────────────────────────────────────────────────────────
      // USERS (Admin only)
      // ─────────────────────────────────────────────────────────────────────

      if (path === '/api/users' && request.method === 'GET') {
        if (currentUser.role !== 'admin') {
          return new Response(JSON.stringify({ success: false, error: 'Admin only' }), { status: 403, headers: CORS });
        }
        const users = JSON.parse(await env.DATA.get('users:list') || '[]');
        return new Response(JSON.stringify({ success: true, users }), { headers: CORS });
      }

      if (path === '/api/users' && request.method === 'POST') {
        if (currentUser.role !== 'admin') {
          return new Response(JSON.stringify({ success: false, error: 'Admin only' }), { status: 403, headers: CORS });
        }
        
        const { name, email, password, role } = await request.json();
        
        if (!name || !email || !password) {
          return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), { status: 400, headers: CORS });
        }
        
        const existing = await env.DATA.get(`user:${email.toLowerCase()}`);
        if (existing) {
          return new Response(JSON.stringify({ success: false, error: 'Email already exists' }), { status: 400, headers: CORS });
        }

        const newUser = {
          id: crypto.randomUUID(),
          name: name.trim(),
          email: email.toLowerCase().trim(),
          password: await hashPassword(password),
          role: role || 'moderator',
          createdAt: Date.now()
        };

        await env.DATA.put(`user:${newUser.email}`, JSON.stringify(newUser));

        const usersList = JSON.parse(await env.DATA.get('users:list') || '[]');
        usersList.push({ id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role, createdAt: newUser.createdAt });
        await env.DATA.put('users:list', JSON.stringify(usersList));

        return new Response(JSON.stringify({ success: true, user: { ...newUser, password: undefined } }), { headers: CORS });
      }

      if (path.startsWith('/api/users/') && request.method === 'DELETE') {
        if (currentUser.role !== 'admin') {
          return new Response(JSON.stringify({ success: false, error: 'Admin only' }), { status: 403, headers: CORS });
        }
        
        const userId = path.split('/')[3];
        
        // Can't delete yourself
        if (userId === currentUser.id) {
          return new Response(JSON.stringify({ success: false, error: 'Cannot delete yourself' }), { status: 400, headers: CORS });
        }

        let usersList = JSON.parse(await env.DATA.get('users:list') || '[]');
        const userToDelete = usersList.find(u => u.id === userId);
        
        if (userToDelete) {
          await env.DATA.delete(`user:${userToDelete.email}`);
          usersList = usersList.filter(u => u.id !== userId);
          await env.DATA.put('users:list', JSON.stringify(usersList));
        }

        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      // ─────────────────────────────────────────────────────────────────────
      // CONFIG (Admin only)
      // ─────────────────────────────────────────────────────────────────────

      if (path === '/api/config' && request.method === 'GET') {
        if (currentUser.role !== 'admin') {
          return new Response(JSON.stringify({ success: false, error: 'Admin only' }), { status: 403, headers: CORS });
        }
        const serverConfig = JSON.parse(await env.DATA.get('config:server') || 'null');
        const emailConfig = JSON.parse(await env.DATA.get('config:email') || '{"fromAddress":""}');
        
        // Don't expose full secrets - mask them
        if (serverConfig?.apiSecret) {
          serverConfig.apiSecret = '••••••••' + serverConfig.apiSecret.slice(-4);
        }
        
        return new Response(JSON.stringify({ success: true, serverConfig, emailConfig }), { headers: CORS });
      }

      if (path === '/api/config/server' && request.method === 'POST') {
        if (currentUser.role !== 'admin') {
          return new Response(JSON.stringify({ success: false, error: 'Admin only' }), { status: 403, headers: CORS });
        }
        const config = await request.json();
        
        // If secret is masked, keep the old one
        if (config.apiSecret?.startsWith('••••')) {
          const existing = JSON.parse(await env.DATA.get('config:server') || '{}');
          config.apiSecret = existing.apiSecret;
        }
        
        await env.DATA.put('config:server', JSON.stringify(config));
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      if (path === '/api/config/smtp' && request.method === 'POST') {
        if (currentUser.role !== 'admin') {
          return new Response(JSON.stringify({ success: false, error: 'Admin only' }), { status: 403, headers: CORS });
        }
        const config = await request.json();
        
        // If password is masked, keep the old one
        if (config.password === '••••••••') {
          const existing = JSON.parse(await env.DATA.get('config:smtp') || '{}');
          config.password = existing.password;
        }
        
        await env.DATA.put('config:smtp', JSON.stringify(config));
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      if (path === '/api/config/email' && request.method === 'POST') {
        if (currentUser.role !== 'admin') {
          return new Response(JSON.stringify({ success: false, error: 'Admin only' }), { status: 403, headers: CORS });
        }
        const config = await request.json();
        await env.DATA.put('config:email', JSON.stringify(config));
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }

      // ─────────────────────────────────────────────────────────────────────
      // EMAIL
      // ─────────────────────────────────────────────────────────────────────

      if (path === '/api/email/invite' && request.method === 'POST') {
        const { to, name, meetingTitle, joinLink, isAdmin } = await request.json();
        const html = inviteEmailTemplate(name, meetingTitle, joinLink, isAdmin);
        
        let result;
        if (env.RESEND_API_KEY) {
          result = await sendEmailResend(env, to, `You're invited: ${meetingTitle}`, html);
        } else {
          const smtpConfig = JSON.parse(await env.DATA.get('config:smtp') || '{}');
          result = await sendEmailMailChannels(to, `You're invited: ${meetingTitle}`, html, smtpConfig.from);
        }

        return new Response(JSON.stringify(result), { headers: CORS });
      }

      if (path === '/api/email/reset' && request.method === 'POST') {
        const { email } = await request.json();
        
        // Don't reveal if email exists
        const userData = await env.DATA.get(`user:${email.toLowerCase()}`);
        if (userData) {
          const resetToken = generateToken();
          await env.DATA.put(`reset:${resetToken}`, email.toLowerCase(), { expirationTtl: 3600 });
          
          const html = `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:40px;background:#1e293b;color:#f8fafc;border-radius:16px;">
              <h1>Reset Password</h1>
              <p>Click below to reset your password (expires in 1 hour):</p>
              <p><a href="${url.origin}/reset?token=${resetToken}" style="display:inline-block;background:#8b5cf6;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;">Reset Password</a></p>
            </div>
          `;
          
          if (env.RESEND_API_KEY) {
            await sendEmailResend(env, email, 'Reset Your Password', html);
          } else {
            const smtpConfig = JSON.parse(await env.DATA.get('config:smtp') || '{}');
            await sendEmailMailChannels(email, 'Reset Your Password', html, smtpConfig.from);
          }
        }
        
        return new Response(JSON.stringify({ success: true, message: 'If email exists, reset link sent' }), { headers: CORS });
      }

      // ─────────────────────────────────────────────────────────────────────
      // 404
      // ─────────────────────────────────────────────────────────────────────

      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: CORS });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 500, headers: CORS });
    }
  }
};
// Updated Mon Jan 19 12:49:32 PM EST 2026
