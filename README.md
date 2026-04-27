# Projectzero 🚀
Algo Trading Dashboard — NSE Options, Stocks, Crypto, Forex

## One-Time Setup (15 minutes)

### Step 1 — Push to GitHub
1. Go to **github.com** → click **"New repository"**
2. Name it `projectzero`, set to **Private**, click Create
3. Download this folder as a ZIP and upload files to the repo
   OR use GitHub Desktop app to push

### Step 2 — Set up Supabase Database
1. Go to **supabase.com** → open your project
2. Click **SQL Editor** (left sidebar)
3. Paste the entire contents of `supabase_schema.sql`
4. Click **Run** — this creates all tables
5. Go to **Settings → API** → copy:
   - `Project URL` → this is your SUPABASE_URL
   - `anon public` key → SUPABASE_ANON_KEY
   - `service_role` key → SUPABASE_SERVICE_KEY

### Step 3 — Deploy to Vercel
1. Go to **vercel.com** → click **"Add New Project"**
2. Import your `projectzero` GitHub repo
3. Before clicking Deploy, click **"Environment Variables"** and add:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key |
| `SUPABASE_SERVICE_KEY` | your Supabase service key |
| `DASHBOARD_PASSWORD` | `Pz@2026!` (or your own) |
| `JWT_SECRET` | any random long string |
| `ZERODHA_CLIENT_ID` | `FHP228` |

4. Click **Deploy** — your site goes live at `projectzero.vercel.app`

### Step 4 — Daily Trading Setup (30 seconds each morning)
1. Open **kite.zerodha.com** and log in
2. Press **F12** → Network tab → click any request
3. In Headers → find Cookie → copy the `enctoken=xxxxx` value
4. Open your Projectzero dashboard
5. Click **"Connect Zerodha"** → paste the enctoken
6. Done! All signals and trades are live for the day ✅

## Features
- 📡 Live signals: EMA, RSI+MACD, Breakout, Supertrend, VWAP
- 📊 Live market data: Nifty, BankNifty, Sensex, BTC, ETH
- ⚡ One-click trade execution via Zerodha
- 🧪 Full backtesting engine (run locally)
- 🔐 Password-protected dashboard
- 📱 Works on mobile too

## Tech Stack
- Next.js 14 (React) — Frontend + API
- Supabase — Database + Auth
- Vercel — Hosting
- Zerodha Kite — Trade execution
- Yahoo Finance — Free market data fallback
