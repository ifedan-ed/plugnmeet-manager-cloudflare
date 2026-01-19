# PlugNMeet Meeting Manager

A modern web interface for managing PlugNMeet video conference rooms with user authentication, meeting management, and email invitations.

## Features

- 🔐 **User Authentication** - Admin and moderator roles
- 📹 **Meeting Management** - Create, configure, and delete meetings
- 🔗 **Join Link Generation** - Generate unique join links for participants
- 📧 **Email Invitations** - Send meeting invites via MailChannels (free)
- 💾 **Persistent Storage** - Cloudflare KV (cloud) or localStorage (local fallback)
- 📱 **Responsive Design** - Works on desktop and mobile

---

## Quick Start (Local Mode)

Without the backend, the app runs in **Local Mode** - data is stored in your browser only.

```bash
git clone https://github.com/ifedan-ed/plugnmeet-manager-cloudflare.git
cd plugnmeet-manager-cloudflare
npm install
npm run dev
```

Default login: `admin@example.com` / `admin123`

> ⚠️ **Local Mode Warning**: In local mode, all data including PlugNMeet API secrets are stored in browser localStorage. Use cloud mode for production.

---

## Full Deployment Guide

### Step 1: Deploy Frontend to Cloudflare Pages

1. Push code to GitHub
2. In **Cloudflare Dashboard** → **Workers & Pages** → **Create** → **Pages**
3. Connect to your GitHub repository
4. Build settings:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Click **Save and Deploy**

**Your frontend URL** will be something like:
- `https://plugnmeet-manager-cloudflare.pages.dev`
- `https://your-project-name.pages.dev`
- Or a custom domain if you configure one

---

### Step 2: Create KV Namespaces

1. Go to **Workers & Pages** → **KV**
2. Create two namespaces:
   - `plugnmeet-data`
   - `plugnmeet-sessions`

---

### Step 3: Deploy Worker Backend

1. Go to **Workers & Pages** → **Create** → **Create Worker**
2. Name it (e.g., `plugnmeet-api`) and click **Deploy**
3. Click **Edit code**
4. Delete all default code
5. Paste the contents of `worker/worker.js`
6. Click **Save and Deploy**

**Your worker URL** will be something like:
- `https://plugnmeet-api.your-subdomain.workers.dev`
- `https://random-name-1234.your-subdomain.workers.dev`

---

### Step 4: Add KV Bindings (REQUIRED)

1. Go to your Worker → **Settings** → **Bindings**
2. Add **KV Namespace**:
   - Variable name: `DATA`
   - Select: `plugnmeet-data`
3. Add **KV Namespace**:
   - Variable name: `SESSIONS`
   - Select: `plugnmeet-sessions`
4. Click **Save**

> ⚠️ **The worker will not function without these bindings!**

---

### Step 5: Initialize Database

```bash
curl -X POST https://YOUR_WORKER_URL/api/init
```

Response:
```json
{"success":true,"message":"Admin created: admin@example.com / admin123 - CHANGE THIS PASSWORD!"}
```

> ⚠️ **Change the admin password immediately after first login!**

---

### Step 6: Connect Frontend to Backend

**Option A: Cloudflare Pages Dashboard (Recommended)**

1. Go to your Pages project → **Settings** → **Environment variables**
2. Add variable:
   - Name: `VITE_API_URL`
   - Value: `https://YOUR_WORKER_URL`
3. Go to **Deployments** → Trigger a new deployment

**Option B: .env file**

```bash
echo "VITE_API_URL=https://YOUR_WORKER_URL" > .env
git add .env
git commit -m "Add API URL"
git push
```

---

## Email Setup (SMTP)

The app supports two email providers. Choose one:

### Option 1: MailChannels (Free - Recommended)

MailChannels is **free** for Cloudflare Workers. Setup:

1. Add a DNS TXT record to your domain:
   ```
   Type: TXT
   Name: @
   Value: v=spf1 a mx include:relay.mailchannels.net ~all
   ```

2. In the app, go to **Settings** → **SMTP Settings**:
   - **From Address**: `noreply@yourdomain.com` (must be your domain)
   - Other fields can be left empty (MailChannels doesn't need them)

3. That's it! The worker automatically uses MailChannels when no Resend key is set.

### Option 2: Resend

1. Sign up at https://resend.com (free: 3000 emails/month)
2. Get your API key
3. In Cloudflare Worker → **Settings** → **Variables**:
   - Add: `RESEND_API_KEY` = `re_xxxxx...`
   - Add: `EMAIL_FROM` = `PlugNMeet <noreply@yourdomain.com>`

### SMTP Settings in App

The SMTP settings page in the app stores configuration for the "From" address. The actual email sending is handled by MailChannels or Resend - you don't need a traditional SMTP server.

| Field | MailChannels | Resend |
|-------|--------------|--------|
| Host | Not needed | Not needed |
| Port | Not needed | Not needed |
| Username | Not needed | Not needed |
| Password | Not needed | Not needed |
| From Address | Required (your domain) | Set in Worker vars |
| Encryption | Not needed | Not needed |

---

## PlugNMeet Server Configuration

After logging in as admin:

1. Go to **Settings**
2. Enter your PlugNMeet server details:
   - **Server URL**: `https://demo.plugnmeet.com` (or your own)
   - **API Key**: `plugnmeet`
   - **API Secret**: `zumyyYWqv7KR2kUqvYdq4z4sXg7XTBD2ljT6`
3. Click **Test** to verify
4. Click **Save**

---

## Understanding Join Links

### How Join Links Work

When you generate a join link, the app:
1. Calls PlugNMeet API `/room/getJoinToken`
2. Gets a JWT token containing: user name, user ID, role, room ID
3. Creates URL: `https://plugnmeet-server/?access_token=JWT_TOKEN`

### One Link = One Identity

Each join link contains a **specific user identity**:
- The name you entered when generating
- Whether they're a moderator or participant
- A unique user ID

**Important behaviors:**

| Scenario | What Happens |
|----------|--------------|
| Same link, same browser | Rejoins as same user |
| Same link, different browser | Creates duplicate user with same name |
| Same link, used simultaneously | Both join as same identity (can cause issues) |

### Best Practices

1. **Generate unique links for each participant** - Enter their actual name
2. **Don't share links publicly** - Anyone with the link can join
3. **For large meetings** - Use the invite feature to email individual links
4. **Links expire** - When the meeting ends or based on PlugNMeet server settings

### Example Flow

```
1. Create meeting "Team Standup"
2. Generate link for "Alice" (Moderator) → Send to Alice
3. Generate link for "Bob" (Participant) → Send to Bob
4. Generate link for "Charlie" (Participant) → Send to Charlie
```

Each person gets their own personalized link with their name embedded.

---

## Project Structure

```
plugnmeet-manager-cloudflare/
├── src/
│   ├── App.jsx          # Main React application
│   ├── main.jsx         # Entry point
│   └── index.css        # Styles
├── worker/
│   ├── worker.js        # Cloudflare Worker backend
│   └── wrangler.toml    # Worker config (optional, for CLI)
├── public/
│   └── favicon.svg
├── .env.example         # Environment template
├── index.html
├── package.json
└── README.md
```

---

## Environment Variables

### Frontend (Cloudflare Pages)
| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_URL` | Your Worker URL | Yes (for cloud mode) |

### Backend (Cloudflare Worker)
| Variable | Description | Required |
|----------|-------------|----------|
| `ALLOWED_ORIGIN` | Frontend URL for CORS | Recommended |
| `RESEND_API_KEY` | Resend API key | Optional |
| `EMAIL_FROM` | Sender email address | Optional |

### KV Bindings (Worker)
| Binding | KV Namespace | Required |
|---------|--------------|----------|
| `DATA` | plugnmeet-data | Yes |
| `SESSIONS` | plugnmeet-sessions | Yes |

---

## Troubleshooting

### "Invalid credentials" after setup

**Cause**: Password hash mismatch due to different salt values between worker versions.

**Solution**:
1. Go to **Cloudflare Dashboard** → **KV** → **plugnmeet-data**
2. Delete these keys:
   - `users:list`
   - `user:admin@example.com`
3. Reinitialize:
   ```bash
   curl -X POST https://YOUR_WORKER_URL/api/init
   ```
4. Login with `admin@example.com` / `admin123`

> ⚠️ **Why this happens**: The worker uses a salt for password hashing. If you initialized the database with one version of the worker, then updated to a new version with a different salt, the password hashes won't match. Always reinitialize after updating the worker code.

### "Already initialized" error

The admin user already exists. Either:
- Login with `admin@example.com` / `admin123`
- Or clear KV data and reinitialize (see above)

### "Unauthorized" error

- Check KV bindings are set (Step 4)
- Run `/api/init` to create admin user (Step 5)
- Clear browser cache/cookies and try again

### Worker returns error

- Verify both `DATA` and `SESSIONS` bindings exist in Worker settings
- Check Worker logs: Worker → **Logs** → **Begin log stream**

### Emails not sending

**For MailChannels:**
- Add SPF record to your domain DNS
- Use a From address on your domain
- Check Worker logs for errors

**For Resend:**
- Verify `RESEND_API_KEY` is set in Worker variables
- Check Resend dashboard for delivery status

### Frontend shows "Local Mode"

- Set `VITE_API_URL` environment variable in Cloudflare Pages
- Trigger a new deployment after setting the variable

### CORS errors

Set `ALLOWED_ORIGIN` variable in Worker to your Pages URL:
```
ALLOWED_ORIGIN=https://your-project.pages.dev
```

### Join links not working

- Verify PlugNMeet server is configured in Settings
- Test the server connection with the "Test" button
- Check that the meeting exists and is active on the PlugNMeet server

---

## Security Considerations

### Passwords
- Hashed with SHA-256 + salt
- Salt is hardcoded in worker (change for production)
- Consider bcrypt for higher security

### API Secrets
- Stored in Cloudflare KV (encrypted at rest)
- Masked in API responses
- Never exposed to frontend

### Sessions
- 7-day expiration
- Stored in separate KV namespace
- Invalidated on logout

### Recommendations for Production
1. Change default admin password immediately
2. Set `ALLOWED_ORIGIN` to restrict CORS
3. Use cloud mode (not local mode)
4. Enable Cloudflare Access for additional protection
5. Use a custom domain with SSL
6. Change the password salt in worker.js

---

## Cost

| Service | Free Tier |
|---------|-----------|
| Cloudflare Pages | Unlimited |
| Cloudflare Workers | 100,000 requests/day |
| Cloudflare KV | 100,000 reads/day |
| MailChannels | Unlimited with Workers |
| Resend | 3,000 emails/month |

**Total: $0/month** for typical usage

---

## License

MIT
