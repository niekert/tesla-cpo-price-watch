# Tesla CPO Watcher

Monitor Tesla's used/CPO inventory for price changes, new arrivals, and removed vehicles. Get instant Telegram notifications when prices drop.

## Features

- Scrapes Tesla inventory pages every 30 minutes
- Detects price drops, price increases, new vehicles, and removed vehicles
- Sends Telegram notifications with vehicle details
- Filters by model year (e.g., 2024+ for Model 3 Highland)
- Stores price history in Redis

## Tech Stack

- **Runtime**: Bun + TypeScript
- **Framework**: Next.js 16 (App Router)
- **Workflow**: Vercel Workflow SDK (durable execution)
- **Browser**: Kernel SDK (stealth browser automation)
- **Database**: Upstash Redis
- **Notifications**: Telegram Bot API
- **Hosting**: Vercel

## Setup

### 1. Clone and install

```bash
git clone <repo>
cd cpo-watcher
bun install
```

### 2. Configure Tesla URLs

Edit `src/config.ts` with your desired search URLs:

```typescript
export const watchConfigs: WatchConfig[] = [
  {
    name: "Model 3 Highland",
    url: "https://www.tesla.com/nl_NL/inventory/used/m3?INTERIOR=PREMIUM_BLACK&arrangeby=plh&zip=5708&range=0",
    minYear: 2024,
  },
  {
    name: "Model Y 2023+",
    url: "https://www.tesla.com/nl_NL/inventory/used/my?TRIM=MYRWD&arrangeby=plh&zip=5708&range=0",
    minYear: 2023,
  },
];
```

### 3. Create Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the bot token
4. Message your bot and send any message
5. Get your chat ID: `https://api.telegram.org/bot<TOKEN>/getUpdates`

### 4. Environment Variables

Create `.env.local` for local development:

```env
# Kernel (browser automation)
KERNEL_API_KEY=

# Upstash Redis
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Security
CRON_SECRET=
ADMIN_SECRET=
```

## Deployment

### 1. Push to GitHub

```bash
git add -A
git commit -m "Initial commit"
git push
```

### 2. Import to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Add integrations from Vercel Marketplace:
   - **Kernel** - for browser automation
   - **Upstash Redis** - for storage

### 3. Set Environment Variables

In Vercel dashboard → Project → Settings → Environment Variables:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `TELEGRAM_CHAT_ID` | Your chat ID (just the number) |
| `CRON_SECRET` | Random string to secure cron endpoint |
| `ADMIN_SECRET` | Random string to secure admin endpoints |

Generate secrets with: `openssl rand -hex 32`

### 4. Deploy

Vercel auto-deploys on push. The cron job starts automatically.

## Scripts

```bash
# Development
bun run dev

# Build
bun run build

# Debug scraper locally (opens Firefox)
bun scripts/debug-firefox.ts

# Clear stored data
ADMIN_SECRET=xxx BASE_URL=https://your-app.vercel.app bun run db:clear
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cron` | GET | Trigger price check (protected by CRON_SECRET) |
| `/api/clear-storage` | POST | Clear all stored vehicles (protected by ADMIN_SECRET) |

## Telegram Notifications

### New Vehicle
```
🆕 New Vehicle Available!

Model 3 Highland
Long Range AWD (2024)
📍 Amsterdam
💰 € 41.990
🛣️ 12.500 km

View on Tesla
```

### Price Drop
```
📉 Price Drop Alert!

Model 3 Highland
Long Range AWD (2024)
📍 Amsterdam
🛣️ 12.500 km
💰 € 43.990 → € 41.990 (-€ 2.000)

View on Tesla
```

### Vehicle Removed
```
❌ Vehicle No Longer Available

Model 3 Highland
Long Range AWD (2024)
📍 Amsterdam
💰 € 41.990
🛣️ 12.500 km

This vehicle was removed from inventory
```

## Architecture

```
Vercel Cron (every 30 min)
    ↓
/api/cron → starts workflow
    ↓
Vercel Workflow (durable, retryable)
    ├── Step 1: Kernel browser → Scrape Tesla pages
    ├── Step 2: Redis → Compare with stored prices
    ├── Step 3: Telegram → Send notifications
    └── Step 4: Redis → Update stored prices
```

## Cost

- **Vercel**: Free tier (hobby) supports cron jobs
- **Kernel**: ~$0.01-0.05 per browser session
- **Upstash Redis**: Free tier (10k requests/day)
- **Telegram**: Free

Estimated: **€1-5/month** for typical usage

## License

MIT
