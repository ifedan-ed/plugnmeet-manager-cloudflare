# PlugNMeet Meeting Manager

A free, open-source web application for managing PlugNMeet video conference rooms. Built with React and Cloudflare Workers - completely serverless and runs on Cloudflare's free tier.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)

## What is this?

This is a management dashboard for [PlugNMeet](https://www.plugnmeet.org/), an open-source video conferencing solution. It allows you to:

- **Create and manage meetings** - Set up video conference rooms with custom settings
- **Generate join links** - Create personalized links for each participant
- **Send email invitations** - Invite people directly from the dashboard
- **Manage users** - Admin and moderator roles with authentication

## Features

- 🔐 **User Authentication** - Secure login with admin and moderator roles
- 📹 **Meeting Management** - Create, configure, and delete meetings
- 🔗 **Join Link Generation** - Unique links for each participant
- 📧 **Email Invitations** - Send invites via Resend, SMTP2GO, Mailjet, or SendGrid
- 💾 **Cloud Storage** - Data stored in Cloudflare KV (free)
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- 🔄 **Auto-Deploy** - Push to GitHub and everything deploys automatically

## Architecture Overview

```
┌─────────────────────┐         ┌─────────────────────┐         ┌─────────────────┐
│                     │         │                     │         │                 │
│   Your Browser      │────────▶│  Cloudflare Worker  │────────▶│  PlugNMeet      │
│   (React App)       │         │  (API Backend)      │         │  Server         │
│                     │         │                     │         │                 │
└─────────────────────┘         └──────────┬──────────┘         └─────────────────┘
                                           │
                                           ▼
                                ┌─────────────────────┐
                                │                     │
                                │   Cloudflare KV     │
                                │   (Database)        │
                                │                     │
                                └─────────────────────┘
```

**Why this architecture?**
- **Free hosting** - Cloudflare Pages and Workers have generous free tiers
- **No server needed** - Everything runs on Cloudflare's edge network
- **Fast** - Deployed globally, close to your users
- **Secure** - API secrets are stored server-side, never exposed to browsers

---

## Quick Start (5 minutes)

### Prerequisites

- A [GitHub](https://github.com) account
- A [Cloudflare](https://cloudflare.com) account (free)
- [Node.js](https://nodejs.org) installed on your computer
- A PlugNMeet server (you can use the demo server for testing)

### Step 1: Fork and Clone

1. Fork this repository on GitHub
2. Clone to your computer:
   ```bash
   git clone https://github.com/YOUR_USERNAME/plugnmeet-manager-cloudflare.git
   cd plugnmeet-manager-cloudflare
   ```

### Step 2: Create Cloudflare Resources

#### 2a. Create KV Namespaces (Database)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click **Workers & Pages** in the sidebar
3. Click **KV** tab
4. Click **Create a namespace**
5. Create two namespaces:
   - Name: `plugnmeet-data` → Click Create → **Copy the ID**
   - Name: `plugnmeet-sessions` → Click Create → **Copy the ID**

#### 2b. Update wrangler.toml

Open `worker/wrangler.toml` and update these values:

```toml
# Replace with your Cloudflare account ID
# Find it: Dashboard → Workers & Pages → right sidebar shows Account ID
account_id = "YOUR_ACCOUNT_ID"

[[kv_namespaces]]
binding = "DATA"
id = "YOUR_PLUGNMEET_DATA_ID"    # Paste the ID you copied

[[kv_namespaces]]
binding = "SESSIONS"
id = "YOUR_PLUGNMEET_SESSIONS_ID"  # Paste the ID you copied
```

### Step 3: Deploy the Frontend (Cloudflare Pages)

1. Go to **Cloudflare Dashboard** → **Workers & Pages**
2. Click **Create** → **Pages** → **Connect to Git**
3. Select your forked repository
4. Configure build settings:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Click **Save and Deploy**
6. Wait for deployment (1-2 minutes)
7. Note your URL: `https://your-project.pages.dev`

### Step 4: Deploy the Worker (Backend API)

#### 4a. Create GitHub Secret for Auto-Deploy

1. Go to **Cloudflare Dashboard** → Click your profile (top right) → **My Profile**
2. Click **API Tokens** → **Create Token**
3. Use template **"Edit Cloudflare Workers"**
4. Click **Continue to summary** → **Create Token**
5. **Copy the token** (you only see it once!)

Now add it to GitHub:

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `CF_API_TOKEN`
4. Value: paste the token
5. Click **Add secret**

#### 4b. Push to Deploy

```bash
git add -A
git commit -m "Configure for my Cloudflare account"
git push
```

The GitHub Action will automatically deploy your worker. Check the **Actions** tab to see progress.

### Step 5: Initialize the Database

After the worker deploys, create the admin user:

```bash
curl -X POST https://your-worker.workers.dev/api/init
```

Replace `your-worker.workers.dev` with your actual worker URL (shown in Cloudflare Dashboard → Workers).

You should see:
```json
{"success":true,"message":"Admin created: admin@example.com / admin123"}
```

### Step 6: Connect Frontend to Backend

1. Go to **Cloudflare Pages** → Your project → **Settings** → **Environment variables**
2. Click **Add variable**:
   - **Variable name**: `VITE_API_URL`
   - **Value**: `https://your-worker.workers.dev` (your worker URL)
3. Click **Save**
4. Go to **Deployments** → Click **Retry deployment** on the latest

### Step 7: Login and Configure

1. Open your Pages URL (e.g., `https://your-project.pages.dev`)
2. Login with:
   - Email: `admin@example.com`
   - Password: `admin123`
3. **Change your password immediately!** (Click the key icon in the sidebar)
4. Go to **Settings** and configure your PlugNMeet server:
   - **Server URL**: `https://your-plugnmeet-server.com` (or `https://demo.plugnmeet.com` for testing)
   - **API Key**: Your PlugNMeet API key
   - **API Secret**: Your PlugNMeet API secret
5. Click **Test** to verify, then **Save**

🎉 **Done!** You can now create meetings and send invitations.

---

## Email Setup

To send email invitations, you need to configure an email provider.

### Option 1: Resend (Recommended)

1. Sign up at [resend.com](https://resend.com) (free: 3,000 emails/month)
2. Go to **Domains** → Add your domain → Add the DNS records they provide
3. Go to **API Keys** → Create an API key
4. In **Cloudflare Dashboard** → **Workers** → Your worker → **Settings** → **Variables**:
   - Add: `RESEND_API_KEY` = `re_xxxxx...` (your key)
   - Add: `EMAIL_FROM` = `PlugNMeet <noreply@yourdomain.com>`

### Option 2: SMTP2GO, Mailjet, or SendGrid

1. Sign up for one of these services
2. In your app → **Settings** → **Email Settings**:
   - Select your provider
   - Enter your API key
   - Enter From address
3. Click **Save**

### Option 3: MailChannels (Free, Advanced)

MailChannels is free with Cloudflare Workers but requires DNS setup:

1. Add DNS TXT records to your domain:
   ```
   @ TXT "v=spf1 include:relay.mailchannels.net ~all"
   _mailchannels TXT "v=mc1 cfid=your-subdomain.workers.dev"
   ```
2. In app Settings, set From Address to an email on your domain
3. Don't set any provider (MailChannels is the default)

---

## Understanding Join Links

When you generate a join link, it contains:
- The participant's name
- Their role (moderator or participant)
- A unique identifier
- The meeting room ID

**Important:** Each link is for ONE person. If you share the same link with multiple people, they will all appear with the same name.

**Best practice:** Generate a separate link for each participant with their actual name.

---

## Troubleshooting

### "Invalid credentials" error after updating worker

**Why:** The password salt changed between deployments.

**Fix:**
1. Go to **Cloudflare** → **KV** → **plugnmeet-data**
2. Delete these keys:
   - `users:list`
   - `user:admin@example.com`
3. Keep `system:salt` (don't delete!)
4. Run: `curl -X POST https://your-worker.workers.dev/api/init`
5. Login with `admin@example.com` / `admin123`

### "Already initialized" error

The admin user already exists. Just login with your credentials.

### Emails not sending

1. Check your email provider is configured correctly
2. Verify your domain is verified (for Resend)
3. Check Cloudflare Worker logs for errors:
   - Workers & Pages → Your worker → Logs → Begin log stream
   - Try sending an email and watch for errors

### Frontend shows "Local Mode"

The `VITE_API_URL` environment variable isn't set:
1. Cloudflare Pages → Your project → Settings → Environment variables
2. Add `VITE_API_URL` with your worker URL
3. Redeploy the frontend

### CORS errors in browser console

Set the `ALLOWED_ORIGIN` variable in your worker:
1. Workers → Your worker → Settings → Variables
2. Add: `ALLOWED_ORIGIN` = `https://your-project.pages.dev`

### Worker not deploying from GitHub

1. Check **GitHub** → **Actions** tab for errors
2. Verify `CF_API_TOKEN` secret is set correctly
3. Make sure changes are in the `worker/` directory

---

## Project Structure

```
plugnmeet-manager-cloudflare/
├── .github/
│   └── workflows/
│       └── deploy-worker.yml   # Auto-deploys worker on push
├── src/
│   ├── App.jsx                 # Main React application
│   ├── main.jsx                # Entry point
│   └── index.css               # Tailwind CSS styles
├── worker/
│   ├── worker.js               # Cloudflare Worker (API backend)
│   ├── wrangler.toml           # Worker configuration
│   └── .dev.vars.example       # Template for local secrets
├── public/
│   └── favicon.svg
├── .env.example                # Frontend env template
├── .gitignore                  # Files not committed to Git
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## Configuration Files

### wrangler.toml (Worker Config)

This file configures the Cloudflare Worker. It's committed to Git but **should never contain secrets**.

```toml
name = "your-worker-name"
main = "worker.js"
account_id = "your-cloudflare-account-id"

[[kv_namespaces]]
binding = "DATA"
id = "your-kv-namespace-id"
```

### Secrets (Never in Git!)

Secrets are stored in **Cloudflare Dashboard** → **Worker** → **Settings** → **Variables**:

| Variable | Description | Example |
|----------|-------------|---------|
| `RESEND_API_KEY` | Resend.com API key | `re_xxxxx...` |
| `EMAIL_FROM` | Sender email address | `PlugNMeet <noreply@yourdomain.com>` |
| `ALLOWED_ORIGIN` | Frontend URL (CORS) | `https://your-app.pages.dev` |

### Local Development Secrets

For local development, create `worker/.dev.vars` (gitignored):

```
RESEND_API_KEY=re_your_key_here
EMAIL_FROM=Test <test@example.com>
ALLOWED_ORIGIN=http://localhost:5173
```

---

## Local Development

```bash
# Install dependencies
npm install

# Start frontend dev server
npm run dev

# In another terminal, start worker
cd worker
npx wrangler dev
```

The frontend runs at `http://localhost:5173` and the worker at `http://localhost:8787`.

---

## API Reference

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/init` | Initialize database (first run only) |

### Authenticated Endpoints

Include header: `Authorization: Bearer YOUR_TOKEN`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/change-password` | Change password |
| GET | `/api/meetings` | List meetings |
| POST | `/api/meetings` | Create meeting |
| DELETE | `/api/meetings/:id` | Delete meeting |
| GET | `/api/invites` | List invites |
| POST | `/api/invites` | Create invite |
| DELETE | `/api/invites/:id` | Delete invite |
| POST | `/api/email/invite` | Send invite email |
| POST | `/api/plugnmeet/*` | Proxy to PlugNMeet server |

### Admin Only Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List users |
| POST | `/api/users` | Create user |
| DELETE | `/api/users/:id` | Delete user |
| GET | `/api/config` | Get config |
| POST | `/api/config/server` | Save PlugNMeet config |
| POST | `/api/config/email` | Save email config |

---

## Cost

Everything runs on free tiers:

| Service | Free Tier |
|---------|-----------|
| Cloudflare Pages | Unlimited sites, 500 builds/month |
| Cloudflare Workers | 100,000 requests/day |
| Cloudflare KV | 100,000 reads/day, 1,000 writes/day |
| Resend | 3,000 emails/month |
| SMTP2GO | 1,000 emails/month |

**Total cost: $0/month** for typical usage.

---

## Security

- **Passwords** - Hashed with SHA-256 + salt (stored in KV)
- **API Secrets** - Stored in KV, never exposed to browser
- **Sessions** - JWT-like tokens, expire after 7 days
- **CORS** - Configurable via `ALLOWED_ORIGIN`
- **PlugNMeet API** - Proxied through worker (credentials never in browser)

### Security Best Practices

1. ✅ Change the default admin password immediately
2. ✅ Set `ALLOWED_ORIGIN` to your frontend domain
3. ✅ Use HTTPS (automatic with Cloudflare)
4. ✅ Keep secrets in Cloudflare Dashboard, not in code
5. ✅ Never delete `system:salt` from KV

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/ifedan-ed/plugnmeet-manager-cloudflare/issues)
- **PlugNMeet Docs**: [plugnmeet.org](https://www.plugnmeet.org/)
- **Cloudflare Workers**: [developers.cloudflare.com](https://developers.cloudflare.com/workers/)
