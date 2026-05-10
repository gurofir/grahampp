-- Graham++ Discovery Engine — Supabase schema
-- Run once in your Supabase project's SQL editor (https://supabase.com/dashboard → SQL Editor → New query).
-- Idempotent: safe to re-run; uses CREATE TABLE IF NOT EXISTS.

-- ── situations ──────────────────────────────────────────────────────────────
-- One row per (ticker, scan_run). The frontend reads this via /discover.
-- The full pre-computed analysis is stored in `full_analysis` (jsonb) so the
-- UI can render an entire analysis screen with zero extra API calls.
CREATE TABLE IF NOT EXISTS situations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker            text NOT NULL,
  company_name      text,
  sector            text,
  country           text,
  current_price     numeric,
  daily_change_pct  numeric,
  low52             numeric,
  high52            numeric,
  setup_type        text NOT NULL,
  graham_decision   text NOT NULL,
  market_decision   text NOT NULL,
  graham_confidence text,
  market_confidence text,
  graham_thesis     text,
  market_thesis     text,
  insight           text,
  score             integer NOT NULL DEFAULT 0,
  situation_type    text,
  indicators        jsonb,
  full_analysis     jsonb NOT NULL,
  scanned_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  is_featured       boolean NOT NULL DEFAULT false,
  scan_run_id       uuid
);

CREATE INDEX IF NOT EXISTS situations_expires_at ON situations (expires_at);
CREATE INDEX IF NOT EXISTS situations_score      ON situations (score DESC);
CREATE INDEX IF NOT EXISTS situations_ticker     ON situations (ticker);
CREATE INDEX IF NOT EXISTS situations_scanned_at ON situations (scanned_at DESC);

-- ── scan_runs ───────────────────────────────────────────────────────────────
-- One row per nightly scan invocation. Used for diagnostics + the "scanned X
-- ago" banner on the home screen.
CREATE TABLE IF NOT EXISTS scan_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  universe_size   integer,
  after_filter    integer,
  after_detection integer,
  after_ai        integer,
  featured_count  integer,
  duration_ms     integer,
  status          text DEFAULT 'running'
);

CREATE INDEX IF NOT EXISTS scan_runs_started_at ON scan_runs (started_at DESC);

-- ── Row-Level Security ──────────────────────────────────────────────────────
-- We write/read everything with the service_role key from the backend, so RLS
-- can stay enabled in deny-by-default mode. No anon access needed (the
-- frontend never talks to Supabase directly — it goes through /discover).
ALTER TABLE situations ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_runs  ENABLE ROW LEVEL SECURITY;
