-- ============================================================
-- PROJECTZERO — Supabase Database Schema
-- Run this once in your Supabase SQL editor
-- ============================================================

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  symbol        TEXT NOT NULL,
  direction     TEXT NOT NULL,   -- BUY | SELL
  quantity      INTEGER NOT NULL,
  entry_price   NUMERIC(12,2),
  exit_price    NUMERIC(12,2),
  stop_loss     NUMERIC(12,2),
  target        NUMERIC(12,2),
  strategy      TEXT,
  status        TEXT DEFAULT 'OPEN',  -- OPEN | CLOSED | CANCELLED
  pnl           NUMERIC(12,2),
  order_id      TEXT,
  notes         TEXT
);

-- Signals log
CREATE TABLE IF NOT EXISTS signals (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  symbol      TEXT NOT NULL,
  strategy    TEXT NOT NULL,
  signal      TEXT NOT NULL,   -- BUY | SELL | HOLD
  price       NUMERIC(12,2),
  stop_loss   NUMERIC(12,2),
  target      NUMERIC(12,2),
  confidence  INTEGER,
  reason      TEXT,
  executed    BOOLEAN DEFAULT FALSE
);

-- Portfolio snapshots
CREATE TABLE IF NOT EXISTS portfolio (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  capital     NUMERIC(12,2),
  pnl_day     NUMERIC(12,2),
  pnl_total   NUMERIC(12,2),
  positions   JSONB
);

-- Backtest results
CREATE TABLE IF NOT EXISTS backtest_results (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  strategy          TEXT,
  symbol            TEXT,
  timeframe         TEXT,
  start_date        DATE,
  end_date          DATE,
  initial_capital   NUMERIC(12,2),
  final_capital     NUMERIC(12,2),
  total_return_pct  NUMERIC(8,2),
  sharpe_ratio      NUMERIC(6,2),
  max_drawdown_pct  NUMERIC(8,2),
  win_rate          NUMERIC(6,2),
  total_trades      INTEGER,
  raw_results       JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trades_symbol    ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_status    ON trades(status);
CREATE INDEX IF NOT EXISTS idx_signals_symbol   ON signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_created  ON signals(created_at DESC);

-- Enable Row Level Security (keep data private)
ALTER TABLE trades           ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio        ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_results ENABLE ROW LEVEL SECURITY;
