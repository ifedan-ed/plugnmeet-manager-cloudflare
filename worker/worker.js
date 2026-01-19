// worker.js - Cloudflare Worker Backend for PlugNMeet Manager
// Auto-deployed via GitHub Actions
// Required KV Bindings: DATA, SESSIONS

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getCorsHeaders(env) {
  const allowedOrigin = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

async function hashPassword(password, env) {
  // Use stored salt for consistency across deployments
  let salt = await env.DATA.get('system:salt');
  if (!salt) {
    salt = crypto.randomUUID() + '-' + Date.now().toString(36);
    await env.DATA.put('system:salt', salt);
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateToken() {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

// Generate HMAC signature for PlugNMeet API
async function generateSignature(body, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(body);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL
// ═══════════════════════════════════════════════════════════════════════════

// Option 1: SMTP via API relay (smtp2go, mailjet, sendgrid, etc.)
async function sendEmailSMTP(smtpConfig, to, subject, html) {
  // Using smtp2go API as example - works with most SMTP relay services
  // You can also use: Mailjet, SendGrid, Postmark, etc.
  
  if (smtpConfig.provider === 'smtp2go') {
    const response = await fetch('https://api.smtp2go.com/v3/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: smtpConfig.apiKey,
        to: [to],
        sender: smtpConfig.from,
        subject: subject,
        html_body: html
      })
    });
    const data = await response.json();
    return { success: response.ok, data };
  }
  
  if (smtpConfig.provider === 'mailjet') {
    const auth = btoa(`${smtpConfig.apiKey}:${smtpConfig.apiSecret}`);
    const response = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify({
        Messages: [{
          From: { Email: smtpConfig.from, Name: 'PlugNMeet' },
          To: [{ Email: to }],
          Subject: subject,
          HTMLPart: html
        }]
      })
    });
    const data = await response.json();
    return { success: response.ok, data };
  }

  if (smtpConfig.provider === 'sendgrid') {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${smtpConfig.apiKey}`
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: smtpConfig.from },
        subject: subject,
        content: [{ type: 'text/html', value: html }]
      })
    });
    return { success: response.ok, status: response.status };
  }

  return { success: false, error: 'Unknown SMTP provider' };
}

// Option 2: Resend
async function sendEmailResend(env, to, subject, html) {
  if (!env.RESEND_API_KEY) return { success: false, error: 'RESEND_API_KEY not set' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'PlugNMeet <noreply@yourdomain.com>',
      to: [to], subject, html
    })
  });
  return { success: response.ok, data: await response.json() };
}

// Option 3: MailChannels (free with Cloudflare Workers)
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
    const CORS = getCorsHeaders(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ─────────────────────────────────────────────────────────────────────
      // PUBLIC ROUTES
      // ─────────────────────────────────────────────────────────────────────

      if (path === '/api/health') {
        return new Response(JSON.stringify({ status: 'ok', time: Date.now() }), { headers: CORS });
      }

      // Register - DISABLED for public, only admin can create users via /api/users
      if (path === '/api/auth/register' && request.method === 'POST') {
        return new Response(JSON.stringify({ success: false, error: 'Public registration is disabled. Contact admin for an account.' }), { status: 403, headers: CORS });
      }

      // Login
      if (path === '/api/auth/login' && request.method === 'POST') {
        const { email, password } = await request.json();
        const userData = await env.DATA.get(`user:${email.toLowerCase()}`);
        if (!userData) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), { status: 401, headers: CORS });
        }
        const user = JSON.parse(userData);
        if (user.password !== await hashPassword(password, env)) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), { status: 401, headers: CORS });
        }
        const token = generateToken();
        await env.SESSIONS.put(token, JSON.stringify({ userId: user.id, email: user.email }), { expirationTtl: 604800 });
        const { password: _, ...safeUser } = user;
        return new Response(JSON.stringify({ success: true, token, user: safeUser }), { headers: CORS });
      }

      // Initialize
      if (path === '/api/init' && request.method === 'POST') {
        const usersList = await env.DATA.get('users:list');
        if (usersList && JSON.parse(usersList).length > 0) {
          return new Response(JSON.stringify({ success: false, error: 'Already initialized' }), { status: 400, headers: CORS });
        }
        const admin = {
          id: crypto.randomUUID(),
          name: 'Admin User',
          email: 'admin@example.com',
          password: await hashPassword('admin123', env),
          role: 'admin',
          createdAt: Date.now()
        };
        await env.DATA.put(`user:${admin.email}`, JSON.stringify(admin));
        await env.DATA.put('users:list', JSON.stringify([{ id: admin.id, email: admin.email, name: admin.name, role: admin.role, createdAt: admin.createdAt }]));
        return new Response(JSON.stringify({ success: true, message: 'Admin created: admin@example.com / admin123' }), { headers: CORS });
      }

      // ─────────────────────────────────────────────────────────────────────
      // AUTH MIDDLEWARE
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
      // PLUGNMEET PROXY - Solves CORS and hides API secret
      // ─────────────────────────────────────────────────────────────────────

      if (path.startsWith('/api/plugnmeet/') && request.method === 'POST') {
        const serverConfig = JSON.parse(await env.DATA.get('config:server') || 'null');
        if (!serverConfig) {
          return new Response(JSON.stringify({ success: false, error: 'PlugNMeet server not configured' }), { status: 400, headers: CORS });
        }

        // Extract the PlugNMeet endpoint from the path
        // /api/plugnmeet/room/create -> /auth/room/create
        const plugnmeetEndpoint = path.replace('/api/plugnmeet', '/auth');
        
        const body = await request.text();
        const signature = await generateSignature(body, serverConfig.apiSecret);

        try {
          const response = await fetch(`${serverConfig.url}${plugnmeetEndpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'API-KEY': serverConfig.apiKey,
              'HASH-SIGNATURE': signature
            },
            body: body
          });

          const data = await response.json();
          return new Response(JSON.stringify(data), { headers: CORS });
        } catch (err) {
          return new Response(JSON.stringify({ success: false, error: 'PlugNMeet request failed: ' + err.message }), { status: 500, headers: CORS });
        }
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
        if (user.password !== await hashPassword(currentPassword, env)) {
          return new Response(JSON.stringify({ success: false, error: 'Current password is incorrect' }), { status: 400, headers: CORS });
        }
        user.password = await hashPassword(newPassword, env);
        await env.DATA.put(`user:${currentUser.email}`, JSON.stringify(user));
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
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
        const meeting = { id: crypto.randomUUID(), ...data, createdBy: currentUser.id, createdAt: Date.now() };
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
        const invite = { id: crypto.randomUUID(), ...data, createdBy: currentUser.id, createdAt: Date.now(), status: 'pending' };
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
          password: await hashPassword(password, env),
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
        // Mask secrets
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
        const emailConfig = JSON.parse(await env.DATA.get('config:email') || '{}');
        const html = inviteEmailTemplate(name, meetingTitle, joinLink, isAdmin);
        const subject = `You're invited: ${meetingTitle}`;

        let result;
        
        // Priority: 1) SMTP config in app, 2) Resend env var, 3) MailChannels
        if (emailConfig.provider && emailConfig.provider !== 'mailchannels') {
          result = await sendEmailSMTP(emailConfig, to, subject, html);
        } else if (env.RESEND_API_KEY) {
          result = await sendEmailResend(env, to, subject, html);
        } else {
          result = await sendEmailMailChannels(to, subject, html, emailConfig.fromAddress);
        }
        
        return new Response(JSON.stringify(result), { headers: CORS });
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
