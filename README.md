# PlugNMeet Meeting Manager

A modern web interface for managing PlugNMeet video conference rooms with user authentication, meeting management, and email invitations.

## Features

- 🔐 **User Authentication** - Admin and moderator roles
- 📹 **Meeting Management** - Create, configure, and delete meetings
- 🔗 **Join Link Generation** - Generate unique join links for participants
- 📧 **Email Invitations** - Send meeting invites via email (requires backend)
- 💾 **Persistent Storage** - Data stored in Cloudflare KV (cloud) or localStorage (local)
- 📱 **Responsive Design** - Works on desktop and mobile

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                         │
│                   (Frontend - React)                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Cloudflare Worker                          │
│                    (Backend API)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Auth      │  │   CRUD      │  │   Email Sending     │ │
│  │  Sessions   │  │  Meetings   │  │  (MailChannels)     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Cloudflare KV                             │
│              (Persistent Data Storage)                      │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start (Local Mode)

Without the backend, the app runs in **Local Mode** - data is stored in your browser's localStorage.

```bash
# Clone and install
git clone https://github.com/YOUR_USERNAME/plugnmeet-manager.git
cd plugnmeet-manager
npm install

# Run locally
npm run dev

# Build for production
npm run build
```

Default login: `admin@example.com` / `admin123`

## Full Setup (With Backend)

### 1. Deploy the Frontend to Cloudflare Pages

```bash
# Push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:YOUR_USERNAME/plugnmeet-manager.git
git push -u origin main
```

Then in Cloudflare Dashboard:
1. Workers & Pages → Create → Pages → Connect to Git
2. Select your repo
3. Build settings:
   - Framework: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy

### 2. Create KV Namespaces

In Cloudflare Dashboard → Workers & Pages → KV:

1. Create `plugnmeet-data` → Copy the ID
2. Create `plugnmeet-sessions` → Copy the ID

### 3. Deploy the Worker Backend

```bash
cd worker

# Update wrangler.toml with your KV IDs
nano wrangler.toml

# Deploy
npm install -g wrangler
wrangler login
wrangler deploy
```

Your worker will be at: `https://plugnmeet-api.YOUR_SUBDOMAIN.workers.dev`

### 4. Initialize the Database

```bash
curl -X POST https://plugnmeet-api.YOUR_SUBDOMAIN.workers.dev/api/init
```

### 5. Connect Frontend to Backend

Create `.env` in your project root:

```env
VITE_API_URL=https://plugnmeet-api.YOUR_SUBDOMAIN.workers.dev
```

Rebuild and redeploy:

```bash
npm run build
git add .
git commit -m "Add API URL"
git push
```

## Email Setup (MailChannels - FREE)

MailChannels is free for Cloudflare Workers. Just add a DNS record:

1. Go to your domain's DNS settings
2. Add a TXT record:
   ```
   Type: TXT
   Name: @ (or _mailchannels)
   Value: v=spf1 a mx include:relay.mailchannels.net ~all
   ```

That's it! The worker will automatically use MailChannels to send emails.

### Alternative: Resend

If you prefer Resend (also has free tier):

1. Sign up at https://resend.com
2. Get your API key
3. In Cloudflare Worker settings, add environment variable:
   - `RESEND_API_KEY` = `re_xxxxx...`

## PlugNMeet Server Configuration

After logging in as admin:

1. Go to Settings
2. Enter your PlugNMeet server details:
   - **Server URL**: `https://demo.plugnmeet.com` (or your own server)
   - **API Key**: `plugnmeet`
   - **API Secret**: `zumyyYWqv7KR2kUqvYdq4z4sXg7XTBD2ljT6`
3. Click Test to verify connection
4. Click Save

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, returns token |
| POST | `/api/init` | Create default admin (run once) |

### Meetings (requires auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/meetings` | List all meetings |
| POST | `/api/meetings` | Create meeting |
| DELETE | `/api/meetings/:id` | Delete meeting |

### Invites (requires auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invites` | List all invites |
| POST | `/api/invites` | Create invite |
| DELETE | `/api/invites/:id` | Delete invite |

### Config (admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get server & SMTP config |
| POST | `/api/config/server` | Save PlugNMeet config |
| POST | `/api/config/smtp` | Save SMTP config |

### Email (requires auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/email/invite` | Send meeting invitation |
| POST | `/api/email/reset` | Send password reset |

## Project Structure

```
plugnmeet-manager/
├── src/
│   ├── App.jsx          # Main React application
│   ├── main.jsx         # React entry point
│   └── index.css        # Tailwind CSS
├── worker/
│   ├── worker.js        # Cloudflare Worker backend
│   ├── wrangler.toml    # Worker configuration
│   └── README.md        # Worker deployment guide
├── public/
│   ├── _headers         # Cloudflare security headers
│   ├── _redirects       # SPA routing
│   └── favicon.svg      # App icon
├── index.html           # HTML template
├── package.json         # Dependencies
├── vite.config.js       # Vite configuration
├── tailwind.config.js   # Tailwind configuration
└── README.md            # This file
```

## Environment Variables

### Frontend (.env)
```env
VITE_API_URL=https://your-worker.workers.dev  # Leave empty for local mode
```

### Worker (Cloudflare Dashboard)
```
RESEND_API_KEY=re_xxxxx    # Optional: for Resend email
EMAIL_FROM=noreply@domain  # Optional: sender address
```

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons
- **Backend**: Cloudflare Workers
- **Storage**: Cloudflare KV
- **Email**: MailChannels or Resend
- **Hosting**: Cloudflare Pages

## Cost

| Service | Free Tier |
|---------|-----------|
| Cloudflare Pages | Unlimited sites, 500 builds/month |
| Cloudflare Workers | 100,000 requests/day |
| Cloudflare KV | 100,000 reads/day, 1,000 writes/day |
| MailChannels | Unlimited (with Workers) |
| Resend | 3,000 emails/month |

**Total: $0/month** for typical usage!

## License

MIT
