# Spring Reclaim Strategy — Setup Guide

## What this is

A complete Pine Script v6 strategy that:
1. **Backtests** automatically in TradingView Strategy Tester
2. **Fires live alerts** to your Railway webhook when toggled to LIVE_ALERTS mode
3. **Visualizes** support/resistance levels, daily references, and signal markers on chart

Single file: `spring_reclaim.pine` — toggle `Mode` input to switch between BACKTEST and LIVE_ALERTS.

---

## Step 1: Load into TradingView

1. Open TradingView, go to **NSE:NIFTY1!** (continuous front-month futures — has real volume)
2. Set timeframe to **15 minutes**
3. Open **Pine Editor** (bottom panel, "Pine Editor" tab)
4. Click **New** → **Strategy script**
5. Replace all content with the full `spring_reclaim.pine` file
6. Click **Save** → name it "PZ-S1-Spring-Reclaim"
7. Click **Add to chart**

You should see:
- Green dashed line = active support level
- Red dashed line = active resistance level
- Gray dots = PDH/PDL/PDC (previous day high/low/close)
- Blue line = session VWAP
- Orange dots = daily Pivot Point
- Status table top-right showing current state

---

## Step 2: Run Backtest

1. **Mode input** = `BACKTEST` (default)
2. Open **Strategy Tester** tab (bottom panel)
3. Look at the **Performance Summary**:
   - Net Profit %
   - Win Rate %
   - Profit Factor
   - Max Drawdown %
   - Total Trades
   - Average Win / Average Loss
   - Time in Market

### What to look for in backtest:

**KEEP if:**
- Win Rate ≥ 35% (margin above 25% breakeven for 1:3 R:R)
- Profit Factor ≥ 1.5
- Total Trades ≥ 30 (meaningful sample size)
- Max Drawdown < 30%

**KILL if:**
- Win Rate < 30% even after parameter tuning
- Profit Factor < 1.2
- Max consecutive losses > 8

### How to test across different periods:

TradingView Premium gives you ~5-7 years of NIFTY1! 15m data. Test across:

1. **Trending Up (2023 Q4):** Oct 2023 - Mar 2024 — strong rally
2. **Volatile (2024 Q2):** Apr 2024 - Jun 2024 — election volatility
3. **Recent (last 90 days):** for current regime feel
4. **Sideways (mid-2024):** chop period to test false-positive rate

Set start/end dates in Strategy Tester → Settings → Properties → Backtesting Range.

---

## Step 3: Tune Parameters (One at a Time)

Default parameters are conservative. To experiment:

| Parameter | Make MORE selective (fewer signals) | Make LESS selective (more signals) |
|-----------|-------------------------------------|-------------------------------------|
| Volume Multiple | Increase to 1.5 - 1.8 | Decrease to 1.1 - 1.2 |
| Min Wick Depth | Increase to 0.20 - 0.30 | Decrease to 0.10 |
| Min Reclaim Distance | Increase to 0.15 - 0.20 | Decrease to 0.05 |
| Body Upper Pct | Increase to 0.75 | Decrease to 0.55 |
| A-Grade Only | Keep ON | Turn OFF |

**Discipline rule:** Change ONE parameter at a time. Re-run backtest. Compare to baseline. Don't tune everything at once — you'll overfit.

---

## Step 4: Manual Backtest Validation (CRITICAL)

The Strategy Tester gives mechanical backtest. But you also need to **manually verify each signal makes visual sense.**

1. Run backtest with default params
2. Open **List of Trades** in Strategy Tester
3. For each trade, click the entry → chart jumps to that bar
4. Verify visually:
   - Was there genuinely a support level to defend?
   - Was the wick truly hunting stops (or was it a real breakdown that happened to recover)?
   - Was the volume genuinely elevated, or was it just average?
   - Did the reclaim happen on the same bar (proper Spring) or 2-3 bars later (weaker setup)?

5. Tag manually in a spreadsheet:
   - **A-grade:** clear stop hunt, strong volume, decisive reclaim, multiple confluences
   - **B-grade:** valid pattern but weaker on one dimension
   - **C-grade:** marginal, would skip in real trading
6. Calculate win rate per grade. A-grade should significantly outperform.

---

## Step 5: Switch to LIVE_ALERTS Mode

Once backtest looks reasonable:

1. Change **Mode** input from `BACKTEST` to `LIVE_ALERTS`
2. **Webhook Secret:** copy your existing webhook secret (same as other strategies)
3. **Strategy ID:** keep `S1_SPRING_RECLAIM_V1` (matches DB registry)
4. Click **Save** → reload the script
5. Right-click chart → **Add Alert**
6. Configuration:
   - Condition: "PZ-S1-Spring-Reclaim" → **Any alert() function call**
   - Options: Once Per Bar Close
   - Expiration: Open-ended
   - Webhook URL: `https://projectzero-production.up.railway.app/webhook/tradingview`
   - Message: `{{ alert_message }}` (the script builds the JSON internally)
7. **Create alert**

Now every confirmed Spring or Upthrust on 15m close will fire to Railway → create paper trade → Telegram you.

---

## Step 6: Register in Strategy Manager

In your dashboard's **🎯 Strategies** tab, you should see this strategy register itself once the first signal fires (Railway auto-creates).

If you want to pre-register manually, the SQL is:

```sql
INSERT INTO strategies (
  id, name, description,
  tv_symbol, tv_timeframe,
  market, instrument_type,
  enabled, automation_mode,
  daily_loss_cap_pct, max_consec_losses, cooldown_minutes, max_trades_per_day,
  allowed_start_ist, allowed_end_ist, allowed_days,
  risk_per_trade_pct,
  trade_options, option_strike_offset, option_sl_pct, option_target_pct,
  pattern_family, source_reference, structural_filter_required,
  status, notes
) VALUES (
  'S1_SPRING_RECLAIM_V1',
  'Spring Reclaim — NIFTY 15m',
  'Wyckoff Spring at support / Upthrust at resistance. Stop-hunt-aware reclaim setup. Multi-source consensus (Bigalow, Stoxmee, Frank Miller, CryptoCred, Wyckoff).',
  'NSE:NIFTY1!', '15',
  'india', 'index_options',
  true, 'paper_only',
  3.0, 4, 30, 3,
  '09:45', '15:00', 'Mon,Wed,Thu,Fri',
  1.0,
  true, 0, 40, 80,
  'stop_hunt_reversal', 'Project Zero v6 + custom strategy spec', false,
  'forward_test',
  'Forward test 30 days minimum. Kill criteria: win rate < 35% after 30 trades.'
);
```

---

## Step 7: Forward Test — 30 Days Minimum

Let it run. Don't change anything. Watch:
- Telegram notifications when signals fire
- Paper trades appearing in dashboard
- Performance tab updating

After 30 trading days OR 30 closed trades (whichever comes first):

**Pass criteria:**
- Win rate within ±10% of backtest
- Profit factor ≥ 1.3
- No regime where it consistently fails

**Fail criteria:**
- Win rate > 20% below backtest
- Profit factor < 1.0
- Cumulative drawdown > 30%

If pass → keep running, add a 2nd pattern.
If fail → kill, analyze what went wrong, decide whether to iterate or move on.

---

## Files in this folder

- `spring_reclaim.pine` — the actual strategy code (paste into TradingView)
- `SETUP.md` — this file
- `BACKTEST_TEMPLATE.csv` — spreadsheet template for manual backtest validation

---

## Common Issues

**Issue: No signals firing on backtest**
- Check `Mode` is BACKTEST not LIVE_ALERTS (live mode doesn't enter strategy positions)
- Disable A-Grade Only to see all candidates
- Reduce Volume Multiple to 1.1
- Verify chart symbol is `NSE:NIFTY1!` not `NSE:NIFTY`

**Issue: Too many signals**
- Re-enable A-Grade Only
- Increase Volume Multiple to 1.5+
- Increase Min Wick Depth to 0.25+

**Issue: Alerts not firing in LIVE mode**
- Check Mode is set to LIVE_ALERTS
- Verify alert is created with "Any alert() function call" option
- Check webhook URL points to Railway
- Verify webhook secret matches

**Issue: Looks-too-good-to-be-true backtest**
- Check Time in Market % — if very low and PnL very high, sample size is the issue
- Check if all profits come from one period
- Check Max Drawdown — if very low, suspicious
- Always sanity-check by manually reviewing 10 random trades visually
