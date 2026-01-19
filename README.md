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

> ⚠️ **Local Mode Warning**: In local mode, all data including PlugNMeet API secrets are stored in browser localStorage and visible in DevTools. Use cloud mode for production.

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

### Step 5: Configure CORS (Recommended)

To restrict API access to only your frontend:

1. Go to Worker → **Settings** → **Variables**
2. Add variable:
   - Name: `ALLOWED_ORIGIN`
   - Value: `https://your-project.pages.dev` (your actual Pages URL)

---

### Step 6: Initialize Database

```bash
curl -X POST https://YOUR_WORKER_URL/api/init
```

Response:
```json
{"success":true,"message":"Admin created: admin@example.com / admin123"}
```

> ⚠️ **Change the admin password immediately after first login!**

---

### Step 7: Connect Frontend to Backend

**Option A: Environment Variable (recommended)**

In Cloudflare Pages → Your Project → **Settings** → **Environment variables**:
- Variable: `VITE_API_URL`
- Value: `https://YOUR_WORKER_URL`

Then trigger a new deployment.

**Option B: .env file**

```bash
echo "VITE_API_URL=https://YOUR_WORKER_URL" > .env
git add .env
git commit -m "Add API URL"
git push
```

---

## Email Setup

### MailChannels (Free with Cloudflare Workers)

Add this DNS TXT record to your domain:

```
Type: TXT
Name: @
Value: v=spf1 a mx include:relay.mailchannels.net ~all
```

### Resend (Alternative)

1. Get API key from https://resend.com
2. In Worker → **Settings** → **Variables**
3. Add: `RESEND_API_KEY` = `re_xxxxx...`

---

## Security Considerations

### Passwords
- Passwords are hashed with SHA-256 + salt
- For production, consider implementing bcrypt via a library

### API Secrets
- PlugNMeet API secrets are stored in Cloudflare KV (encrypted at rest)
- Never stored in frontend code
- In local mode, secrets are in localStorage (not secure for production)

### Sessions
- Session tokens expire after 7 days
- Stored in separate KV namespace

### CORS
- By default allows all origins (`*`)
- Set `ALLOWED_ORIGIN` variable to restrict to your domain

### Recommendations for Production
1. Change default admin password immediately
2. Set `ALLOWED_ORIGIN` to your Pages domain
3. Use cloud mode (not local mode)
4. Enable Cloudflare Access for additional protection
5. Use a custom domain with SSL

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

| Problem | Solution |
|---------|----------|
| "Unauthorized" error | Check KV bindings are set; run `/api/init` |
| Worker returns error | Verify both `DATA` and `SESSIONS` bindings exist |
| Emails not sending | Add SPF record for MailChannels or set `RESEND_API_KEY` |
| "Local Mode" showing | Set `VITE_API_URL` and redeploy Pages |
| CORS errors | Set `ALLOWED_ORIGIN` variable in Worker |

---

## Cost

| Service | Free Tier |
|---------|-----------|
| Cloudflare Pages | Unlimited |
| Cloudflare Workers | 100,000 requests/day |
| Cloudflare KV | 100,000 reads/day |
| MailChannels | Unlimited with Workers |

**Total: $0/month** for typical usage

---

## License

MIT
