// worker.js - Cloudflare Worker Backend for PlugNMeet Manager
// Deploy this as a separate Cloudflare Worker
// Requires: KV namespace bound as "DATA" and "SESSIONS"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

// Simple password hashing (use bcrypt in production)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'plugnmeet-salt-2024');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate session token
function generateToken() {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

// Email sending via Resend (get free API key at resend.com)
async function sendEmail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) {
    console.log('RESEND_API_KEY not configured');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || 'PlugNMeet <noreply@yourdomain.com>',
        to: [to],
        subject: subject,
        html: html
      })
    });

    const result = await response.json();
    return { success: response.ok, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Alternative: Send via MailChannels (free with Cloudflare Workers)
async function sendEmailMailChannels(env, to, subject, html, from) {
  try {
    const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from || 'noreply@yourdomain.com', name: 'PlugNMeet' },
        subject: subject,
        content: [{ type: 'text/html', value: html }]
      })
    });

    return { success: response.ok, status: response.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Main request handler
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ═══════════════════════════════════════════════════════════════════
      // AUTH ROUTES
      // ═══════════════════════════════════════════════════════════════════

      // Register
      if (path === '/api/auth/register' && request.method === 'POST') {
        const { name, email, password } = await request.json();
        
        // Check if user exists
        const existingUser = await env.DATA.get(`user:${email}`);
        if (existingUser) {
          return new Response(JSON.stringify({ success: false, error: 'Email already registered' }), { status: 400, headers: CORS_HEADERS });
        }

        // Create user
        const user = {
          id: crypto.randomUUID(),
          name,
          email,
          password: await hashPassword(password),
          role: 'moderator',
          createdAt: Date.now()
        };

        await env.DATA.put(`user:${email}`, JSON.stringify(user));
        
        // Add to users list
        const usersList = JSON.parse(await env.DATA.get('users:list') || '[]');
        usersList.push({ id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt });
        await env.DATA.put('users:list', JSON.stringify(usersList));

        return new Response(JSON.stringify({ success: true, message: 'Account created' }), { headers: CORS_HEADERS });
      }

      // Login
      if (path === '/api/auth/login' && request.method === 'POST') {
        const { email, password } = await request.json();
        
        const userData = await env.DATA.get(`user:${email}`);
        if (!userData) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), { status: 401, headers: CORS_HEADERS });
        }

        const user = JSON.parse(userData);
        const hashedPassword = await hashPassword(password);
        
        if (user.password !== hashedPassword) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), { status: 401, headers: CORS_HEADERS });
        }

        // Create session
        const token = generateToken();
        await env.SESSIONS.put(token, JSON.stringify({ userId: user.id, email: user.email }), { expirationTtl: 86400 * 7 }); // 7 days

        const { password: _, ...safeUser } = user;
        return new Response(JSON.stringify({ success: true, token, user: safeUser }), { headers: CORS_HEADERS });
      }

      // Verify session middleware
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

      // Protected routes require authentication
      const protectedPaths = ['/api/meetings', '/api/invites', '/api/users', '/api/config', '/api/email'];
      if (protectedPaths.some(p => path.startsWith(p)) && !currentUser) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: CORS_HEADERS });
      }

      // ═══════════════════════════════════════════════════════════════════
      // MEETINGS ROUTES
      // ═══════════════════════════════════════════════════════════════════

      // Get all meetings
      if (path === '/api/meetings' && request.method === 'GET') {
        const meetings = JSON.parse(await env.DATA.get('meetings:list') || '[]');
        return new Response(JSON.stringify({ success: true, meetings }), { headers: CORS_HEADERS });
      }

      // Create meeting
      if (path === '/api/meetings' && request.method === 'POST') {
        const meetingData = await request.json();
        const meeting = {
          id: crypto.randomUUID(),
          roomId: `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...meetingData,
          createdBy: currentUser.id,
          createdAt: Date.now(),
          status: 'scheduled'
        };

        const meetings = JSON.parse(await env.DATA.get('meetings:list') || '[]');
        meetings.push(meeting);
        await env.DATA.put('meetings:list', JSON.stringify(meetings));

        return new Response(JSON.stringify({ success: true, meeting }), { headers: CORS_HEADERS });
      }

      // Delete meeting
      if (path.startsWith('/api/meetings/') && request.method === 'DELETE') {
        const meetingId = path.split('/')[3];
        let meetings = JSON.parse(await env.DATA.get('meetings:list') || '[]');
        meetings = meetings.filter(m => m.id !== meetingId);
        await env.DATA.put('meetings:list', JSON.stringify(meetings));

        return new Response(JSON.stringify({ success: true }), { headers: CORS_HEADERS });
      }

      // ═══════════════════════════════════════════════════════════════════
      // INVITES ROUTES
      // ═══════════════════════════════════════════════════════════════════

      // Get all invites
      if (path === '/api/invites' && request.method === 'GET') {
        const invites = JSON.parse(await env.DATA.get('invites:list') || '[]');
        return new Response(JSON.stringify({ success: true, invites }), { headers: CORS_HEADERS });
      }

      // Create invite
      if (path === '/api/invites' && request.method === 'POST') {
        const inviteData = await request.json();
        const invite = {
          id: crypto.randomUUID(),
          ...inviteData,
          createdAt: Date.now(),
          status: 'pending'
        };

        const invites = JSON.parse(await env.DATA.get('invites:list') || '[]');
        invites.push(invite);
        await env.DATA.put('invites:list', JSON.stringify(invites));

        return new Response(JSON.stringify({ success: true, invite }), { headers: CORS_HEADERS });
      }

      // Delete invite
      if (path.startsWith('/api/invites/') && request.method === 'DELETE') {
        const inviteId = path.split('/')[3];
        let invites = JSON.parse(await env.DATA.get('invites:list') || '[]');
        invites = invites.filter(i => i.id !== inviteId);
        await env.DATA.put('invites:list', JSON.stringify(invites));

        return new Response(JSON.stringify({ success: true }), { headers: CORS_HEADERS });
      }

      // ═══════════════════════════════════════════════════════════════════
      // USERS ROUTES (Admin only)
      // ═══════════════════════════════════════════════════════════════════

      if (path === '/api/users' && request.method === 'GET') {
        if (currentUser.role !== 'admin') {
          return new Response(JSON.stringify({ success: false, error: 'Admin only' }), { status: 403, headers: CORS_HEADERS });
        }
        const users = JSON.parse(await env.DATA.get('users:list') || '[]');
        return new Response(JSON.stringify({ success: true, users }), { headers: CORS_HEADERS });
      }

      // ═══════════════════════════════════════════════════════════════════
      // CONFIG ROUTES (Admin only)
      // ═══════════════════════════════════════════════════════════════════

      // Get config
      if (path === '/api/config' && request.method === 'GET') {
        if (currentUser.role !== 'admin') {
          return new Response(JSON.stringify({ success: false, error: 'Admin only' }), { status: 403, headers: CORS_HEADERS });
        }
        const serverConfig = JSON.parse(await env.DATA.get('config:server') || 'null');
        const smtpConfig = JSON.parse(await env.DATA.get('config:smtp') || 'null');
        return new Response(JSON.stringify({ success: true, serverConfig, smtpConfig }), { headers: CORS_HEADERS });
      }

      // Save server config
      if (path === '/api/config/server' && request.method === 'POST') {
        if (currentUser.role !== 'admin') {
          return new Response(JSON.stringify({ success: false, error: 'Admin only' }), { status: 403, headers: CORS_HEADERS });
        }
        const config = await request.json();
        await env.DATA.put('config:server', JSON.stringify(config));
        return new Response(JSON.stringify({ success: true }), { headers: CORS_HEADERS });
      }

      // Save SMTP config
      if (path === '/api/config/smtp' && request.method === 'POST') {
        if (currentUser.role !== 'admin') {
          return new Response(JSON.stringify({ success: false, error: 'Admin only' }), { status: 403, headers: CORS_HEADERS });
        }
        const config = await request.json();
        await env.DATA.put('config:smtp', JSON.stringify(config));
        return new Response(JSON.stringify({ success: true }), { headers: CORS_HEADERS });
      }

      // ═══════════════════════════════════════════════════════════════════
      // EMAIL ROUTES
      // ═══════════════════════════════════════════════════════════════════

      // Send invite email
      if (path === '/api/email/invite' && request.method === 'POST') {
        const { to, name, meetingTitle, joinLink, isAdmin } = await request.json();
        
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
              .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 40px; }
              .logo { text-align: center; margin-bottom: 30px; }
              .logo-icon { width: 60px; height: 60px; background: linear-gradient(135deg, #8b5cf6, #d946ef); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; }
              h1 { color: #f8fafc; font-size: 24px; margin-bottom: 20px; }
              p { color: #94a3b8; line-height: 1.6; margin-bottom: 16px; }
              .button { display: inline-block; background: linear-gradient(135deg, #8b5cf6, #d946ef); color: white; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; margin: 20px 0; }
              .role { display: inline-block; background: ${isAdmin ? '#f59e0b20' : '#8b5cf620'}; color: ${isAdmin ? '#fbbf24' : '#a78bfa'}; padding: 4px 12px; border-radius: 20px; font-size: 12px; }
              .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #334155; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo">
                <div class="logo-icon">📹</div>
              </div>
              <h1>You're Invited to a Meeting!</h1>
              <p>Hi ${name},</p>
              <p>You've been invited to join <strong>${meetingTitle}</strong> as a <span class="role">${isAdmin ? 'Moderator' : 'Participant'}</span>.</p>
              ${joinLink ? `<a href="${joinLink}" class="button">Join Meeting</a>` : '<p><em>Join link will be provided separately.</em></p>'}
              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #8b5cf6;">${joinLink || 'Link pending'}</p>
              <div class="footer">
                <p>This invitation was sent via PlugNMeet Meeting Manager.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        // Try Resend first, fall back to MailChannels
        let result;
        if (env.RESEND_API_KEY) {
          result = await sendEmail(env, to, `You're invited to: ${meetingTitle}`, html);
        } else {
          const smtpConfig = JSON.parse(await env.DATA.get('config:smtp') || '{}');
          result = await sendEmailMailChannels(env, to, `You're invited to: ${meetingTitle}`, html, smtpConfig.from);
        }

        return new Response(JSON.stringify({ success: result.success, ...result }), { headers: CORS_HEADERS });
      }

      // Send password reset email
      if (path === '/api/email/reset' && request.method === 'POST') {
        const { email } = await request.json();
        
        const userData = await env.DATA.get(`user:${email}`);
        if (!userData) {
          // Don't reveal if email exists
          return new Response(JSON.stringify({ success: true, message: 'If email exists, reset link sent' }), { headers: CORS_HEADERS });
        }

        // Generate reset token
        const resetToken = generateToken();
        await env.DATA.put(`reset:${resetToken}`, email, { expirationTtl: 3600 }); // 1 hour

        const resetLink = `${url.origin}/reset-password?token=${resetToken}`;
        
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
              .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 40px; }
              h1 { color: #f8fafc; font-size: 24px; margin-bottom: 20px; }
              p { color: #94a3b8; line-height: 1.6; margin-bottom: 16px; }
              .button { display: inline-block; background: linear-gradient(135deg, #8b5cf6, #d946ef); color: white; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Reset Your Password</h1>
              <p>We received a request to reset your password. Click the button below to create a new password:</p>
              <a href="${resetLink}" class="button">Reset Password</a>
              <p>This link expires in 1 hour.</p>
              <p>If you didn't request this, you can safely ignore this email.</p>
            </div>
          </body>
          </html>
        `;

        if (env.RESEND_API_KEY) {
          await sendEmail(env, email, 'Reset Your Password - PlugNMeet', html);
        } else {
          const smtpConfig = JSON.parse(await env.DATA.get('config:smtp') || '{}');
          await sendEmailMailChannels(env, email, 'Reset Your Password - PlugNMeet', html, smtpConfig.from);
        }

        return new Response(JSON.stringify({ success: true, message: 'Reset link sent' }), { headers: CORS_HEADERS });
      }

      // ═══════════════════════════════════════════════════════════════════
      // INIT - Create default admin if no users
      // ═══════════════════════════════════════════════════════════════════

      if (path === '/api/init' && request.method === 'POST') {
        const usersList = await env.DATA.get('users:list');
        if (usersList && JSON.parse(usersList).length > 0) {
          return new Response(JSON.stringify({ success: false, error: 'Already initialized' }), { headers: CORS_HEADERS });
        }

        const adminUser = {
          id: crypto.randomUUID(),
          name: 'Admin User',
          email: 'admin@example.com',
          password: await hashPassword('admin123'),
          role: 'admin',
          createdAt: Date.now()
        };

        await env.DATA.put(`user:${adminUser.email}`, JSON.stringify(adminUser));
        await env.DATA.put('users:list', JSON.stringify([{
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
          createdAt: adminUser.createdAt
        }]));

        return new Response(JSON.stringify({ success: true, message: 'Admin created: admin@example.com / admin123' }), { headers: CORS_HEADERS });
      }

      // 404
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: CORS_HEADERS });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: CORS_HEADERS });
    }
  }
};
