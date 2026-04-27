# PROJECTZERO — Master Reference
> Last updated: April 27, 2026
> Read this file at the start of any new Claude conversation to get caught up instantly.

## Owner
- Name: Jay Malamdi | Zerodha ID: FHP228 | Location: Ahmedabad, Gujarat
- Capital: Rs 10,000-25,000 starting | Goal: Fully automated 24/7 trading

## Live Site
- URL: https://projectzero-psi.vercel.app
- Dashboard Password: stored in Vercel env vars (DASHBOARD_PASSWORD)

## Tech Stack
- Frontend: Next.js 14 on Vercel (free tier)
- Database: Supabase (free tier) - URL: https://vqcfrioritjtfvpjgnih.supabase.co
- Trading: Zerodha Kite Connect (paid Connect plan, Rs 500/month)
- Code: GitHub repo JayMalmadi/projectzero (private)
- All keys stored in Vercel environment variables (not in code)

## Sensitive Keys Location
- All API keys are in Vercel Project Settings > Environment Variables
- GitHub token: stored in Claude memory only
- Vercel token: stored in Claude memory only
- Kite API Key/Secret: in Vercel env (KITE_API_KEY, KITE_API_SECRET)
- Supabase keys: in Vercel env (NEXT_PUBLIC_SUPABASE_URL etc.)

## Features Built (April 2026)
- Zerodha OAuth one-click login
- Live market ticker (Kite + Yahoo Finance fallback)
- 4 custom PZ strategies from 3-month NSE data analysis
- Candlestick charts: 9 timeframes (1m to 1W), 2-5 second refresh
- One-click execution: BUY/SELL + auto Stop Loss + auto Target
- Trade history with P&L tracking in Supabase
- Live portfolio from Zerodha (positions, margins, orders)
- Dark/light mode, fullscreen chart page (/chart)
- Backtesting engine (Python, run locally from trading_system folder)
- Auto-deploy: GitHub push -> live in 30 seconds

## The 4 PZ Strategies (built from Jan-Apr 2026 NSE data)
Market was bearish -5%. Tuesday was best day (+0.97% BankNifty avg).
Thursday/Friday worst. 76% ORB success rate. 39% false signals on big gaps.

1. PZ-ORB Filter - ORB break with gap<0.3% and volume>1.2x avg
2. Tuesday Momentum - only trades Tue/Wed in trend direction
3. Gap & Fade - fades gaps >0.35% back to prev close
4. Weak Stock Swing - shorts IT sector bounces to 21-EMA (3-5 days)

## API Routes
- /api/kite-login - OAuth URL
- /api/kite-callback - OAuth handler
- /api/kite-pro - Kite proxy (quotes, positions, orders, place_order with auto-SL)
- /api/kite-chart - Historical OHLCV for charts (9 timeframes)
- /api/pz-strategies - 4 custom strategy signals
- /api/trades - Trade history CRUD
- /api/market - Market overview
- /api/auth - Dashboard authentication

## How Claude Pushes Changes (for new conversations)
1. Clone: git clone with GitHub token stored in Claude memory
2. Pull: git pull origin main
3. Make changes, git add -A, git commit, git push
4. Vercel auto-deploys in ~30 seconds
5. No action needed from Jay at all

## Roadmap
Phase 3: Crypto (Binance API - free, needs Binance account)
Phase 4: Forex (OANDA free API)
Phase 5: 24/7 Server (Railway.app ~Rs800/month, connects to GitHub)
Phase 6: WebSocket real-time + TOTP auto-login + Telegram alerts
Phase 7: AI strategy selector

## Market Priority
1. Indian Markets (done) - SEBI regulated, closes at night, safe to test
2. Crypto - 24/7 but high volatility, do after Indian is profitable
3. Forex - last, needs more capital to be meaningful

## Key Decisions
- Stay on free tiers until hitting actual limits
- Only necessary spend: Kite Connect Rs 500/month
- Future server: Railway (not AWS - too complex)
- Everything controlled via GitHub, nothing manual for Jay
