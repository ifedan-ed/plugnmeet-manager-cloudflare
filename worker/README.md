# PlugNMeet Manager Backend - Deployment Guide

## Overview

This Cloudflare Worker provides:
- ✅ **Persistent storage** via Cloudflare KV (data shared across all users)
- ✅ **Real email sending** via Resend or MailChannels
- ✅ **User authentication** with sessions
- ✅ **Admin/moderator roles**

## Deployment Steps

### 1. Create KV Namespaces

1. Go to Cloudflare Dashboard → Workers & Pages → KV
2. Create two namespaces:
   - `plugnmeet-data` (for meetings, users, config)
   - `plugnmeet-sessions` (for auth sessions)
3. Copy the IDs

### 2. Update wrangler.toml

Replace the placeholder IDs:

```toml
[[kv_namespaces]]
binding = "DATA"
id = "abc123..."  # Your plugnmeet-data ID

[[kv_namespaces]]
binding = "SESSIONS"
id = "def456..."  # Your plugnmeet-sessions ID
```

### 3. Deploy the Worker

```bash
cd plugnmeet-worker
npm install -g wrangler
wrangler login
wrangler deploy
```

### 4. Set Up Email (Choose One)

#### Option A: Resend (Recommended - Free tier: 3000 emails/month)

1. Sign up at https://resend.com
2. Get your API key
3. Go to Cloudflare Dashboard → Workers → plugnmeet-api → Settings → Variables
4. Add:
   - `RESEND_API_KEY` = `re_xxxxx...`
   - `EMAIL_FROM` = `PlugNMeet <noreply@yourdomain.com>`

#### Option B: MailChannels (Free with Cloudflare Workers)

MailChannels is free but requires:
1. Domain DNS setup (SPF record)
2. Add to your DNS:
   ```
   TXT @ "v=spf1 a mx include:relay.mailchannels.net ~all"
   ```

### 5. Initialize the Database

Call this once to create the default admin:

```bash
curl -X POST https://plugnmeet-api.YOUR_SUBDOMAIN.workers.dev/api/init
```

Response: `{"success":true,"message":"Admin created: admin@example.com / admin123"}`

### 6. Update Your Frontend

Change your React app to use the worker API:

```javascript
const API_URL = 'https://plugnmeet-api.YOUR_SUBDOMAIN.workers.dev';

// Login
const response = await fetch(`${API_URL}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const { token, user } = await response.json();

// Store token
localStorage.setItem('token', token);

// Authenticated requests
const meetings = await fetch(`${API_URL}/api/meetings`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login, returns token
- `POST /api/init` - Create default admin (run once)

### Meetings (requires auth)
- `GET /api/meetings` - List all meetings
- `POST /api/meetings` - Create meeting
- `DELETE /api/meetings/:id` - Delete meeting

### Invites (requires auth)
- `GET /api/invites` - List all invites
- `POST /api/invites` - Create invite
- `DELETE /api/invites/:id` - Delete invite

### Config (admin only)
- `GET /api/config` - Get server & SMTP config
- `POST /api/config/server` - Save PlugNMeet server config
- `POST /api/config/smtp` - Save SMTP config

### Email (requires auth)
- `POST /api/email/invite` - Send meeting invitation email
- `POST /api/email/reset` - Send password reset email

## Example: Send Invite Email

```javascript
await fetch(`${API_URL}/api/email/invite`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    to: 'user@example.com',
    name: 'John Doe',
    meetingTitle: 'Team Standup',
    joinLink: 'https://plugnmeet.example.com/?access_token=xxx',
    isAdmin: false
  })
});
```

## Cost

- **Cloudflare Workers**: Free tier = 100,000 requests/day
- **Cloudflare KV**: Free tier = 100,000 reads/day, 1,000 writes/day
- **Resend**: Free tier = 3,000 emails/month
- **MailChannels**: Free with Cloudflare Workers

Total: **$0/month** for small to medium usage!

## Security Notes

1. The default admin password is `admin123` - **change it immediately**
2. In production, use proper password hashing (bcrypt)
3. Set up a custom domain for your worker
4. Enable Cloudflare Access for additional protection if needed
