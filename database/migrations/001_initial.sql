CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE bot_state AS ENUM ('DISCONNECTED', 'CONNECTING', 'AUTHENTICATING', 'READY', 'SCANNING', 'PURCHASING', 'LISTING', 'PAUSED', 'RECOVERING', 'ERROR');
CREATE TYPE confidence_level AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_DATA');
CREATE TYPE position_status AS ENUM ('OPEN', 'LISTED', 'SOLD', 'EXPIRED', 'UNKNOWN');
CREATE TYPE attempt_status AS ENUM ('DETECTED', 'RESERVED', 'VALIDATING', 'CLICKING', 'CONFIRMING', 'VERIFYING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_account_id text UNIQUE NOT NULL,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  active_capital bigint NOT NULL CHECK (active_capital >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id),
  state bot_state NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX bot_sessions_account_started_idx ON bot_sessions (account_id, started_at DESC);

CREATE TABLE market_items (
  id text PRIMARY KEY,
  item_type text NOT NULL,
  display_name text NOT NULL,
  identity_hash text UNIQUE NOT NULL,
  normalized_properties jsonb NOT NULL,
  blacklisted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_items_item_type_idx ON market_items (item_type);

CREATE TABLE auction_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES bot_sessions(id),
  page integer NOT NULL CHECK (page >= 0),
  gui_title text NOT NULL,
  slot_count integer NOT NULL CHECK (slot_count >= 0),
  observed_at timestamptz NOT NULL,
  raw_payload jsonb NOT NULL
);
CREATE INDEX auction_snapshots_observed_idx ON auction_snapshots (observed_at DESC);
CREATE INDEX auction_snapshots_session_sequence_idx ON auction_snapshots (session_id, observed_at);

CREATE TABLE auction_listings (
  id text PRIMARY KEY,
  market_item_id text NOT NULL REFERENCES market_items(id),
  snapshot_id uuid REFERENCES auction_snapshots(id),
  item_type text NOT NULL,
  display_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  price_total bigint NOT NULL CHECK (price_total > 0),
  price_per_unit numeric(24, 8) NOT NULL CHECK (price_per_unit > 0),
  seller text,
  enchantments jsonb NOT NULL DEFAULT '[]',
  nbt_hash text,
  lore_hash text,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  auction_page integer NOT NULL,
  auction_slot integer NOT NULL,
  sold_or_disappeared boolean NOT NULL DEFAULT false,
  estimated_sale_time_ms bigint,
  raw_metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX auction_listings_market_price_idx ON auction_listings (market_item_id, price_per_unit, last_seen_at DESC);
CREATE INDEX auction_listings_active_idx ON auction_listings (last_seen_at DESC) WHERE sold_or_disappeared = false;
CREATE INDEX auction_listings_seller_idx ON auction_listings (seller, last_seen_at DESC);

CREATE TABLE market_statistics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_item_id text NOT NULL REFERENCES market_items(id),
  observed_at timestamptz NOT NULL,
  sample_size integer NOT NULL,
  weighted_median numeric(24, 8) NOT NULL,
  rolling_median numeric(24, 8) NOT NULL,
  ema numeric(24, 8) NOT NULL,
  p10 numeric(24, 8) NOT NULL,
  p25 numeric(24, 8) NOT NULL,
  p75 numeric(24, 8) NOT NULL,
  minimum_price numeric(24, 8) NOT NULL,
  listing_count integer NOT NULL,
  visible_supply bigint NOT NULL,
  volatility double precision NOT NULL,
  liquidity_score double precision NOT NULL,
  estimated_sale_time_ms bigint NOT NULL,
  fair_value numeric(24, 8) NOT NULL,
  confidence confidence_level NOT NULL,
  stale boolean NOT NULL
);
CREATE INDEX market_statistics_market_time_idx ON market_statistics (market_item_id, observed_at DESC);
CREATE INDEX market_statistics_time_brin_idx ON market_statistics USING brin (observed_at);

CREATE TABLE trade_opportunities (
  id uuid PRIMARY KEY,
  listing_id text NOT NULL REFERENCES auction_listings(id),
  account_id uuid REFERENCES accounts(id),
  expected_sell_price numeric(24, 8) NOT NULL,
  expected_profit numeric(24, 8) NOT NULL,
  roi double precision NOT NULL,
  expected_holding_time_ms bigint NOT NULL,
  profit_per_capital_hour double precision NOT NULL,
  score double precision NOT NULL,
  confidence confidence_level NOT NULL,
  detected_at timestamptz NOT NULL,
  rejected_reason text
);
CREATE INDEX trade_opportunities_detected_idx ON trade_opportunities (detected_at DESC);
CREATE INDEX trade_opportunities_listing_idx ON trade_opportunities (listing_id);

CREATE TABLE purchase_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES trade_opportunities(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  status attempt_status NOT NULL,
  correlation_id uuid NOT NULL,
  detection_latency_ms integer,
  execution_latency_ms integer,
  failure_reason text,
  evidence jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL,
  completed_at timestamptz
);
CREATE INDEX purchase_attempts_account_time_idx ON purchase_attempts (account_id, started_at DESC);
CREATE INDEX purchase_attempts_correlation_idx ON purchase_attempts (correlation_id);

CREATE TABLE positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id),
  market_item_id text NOT NULL REFERENCES market_items(id),
  source_listing_id text REFERENCES auction_listings(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  acquisition_cost bigint NOT NULL CHECK (acquisition_cost >= 0),
  acquired_at timestamptz NOT NULL,
  status position_status NOT NULL,
  listed_price bigint,
  listed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX positions_account_status_idx ON positions (account_id, status);
CREATE INDEX positions_market_status_idx ON positions (market_item_id, status);

CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES positions(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  sale_revenue bigint NOT NULL CHECK (sale_revenue >= 0),
  realized_profit bigint NOT NULL,
  sold_at timestamptz NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX sales_account_time_idx ON sales (account_id, sold_at DESC);

CREATE TABLE inventory_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  session_id uuid REFERENCES bot_sessions(id),
  observed_at timestamptz NOT NULL,
  inventory jsonb NOT NULL
);
CREATE INDEX inventory_snapshots_account_time_idx ON inventory_snapshots (account_id, observed_at DESC);

CREATE TABLE balance_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  balance bigint NOT NULL CHECK (balance >= 0),
  observed_at timestamptz NOT NULL,
  source text NOT NULL
);
CREATE INDEX balance_snapshots_account_time_idx ON balance_snapshots (account_id, observed_at DESC);

CREATE TABLE strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  version text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE strategy_parameters (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  strategy_id uuid NOT NULL REFERENCES strategies(id),
  revision integer NOT NULL,
  parameters jsonb NOT NULL,
  approved_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, revision)
);

CREATE TABLE daily_performance (
  account_id uuid NOT NULL REFERENCES accounts(id),
  day date NOT NULL,
  realized_profit bigint NOT NULL DEFAULT 0,
  unrealized_cost bigint NOT NULL DEFAULT 0,
  capital_hours numeric(24, 8) NOT NULL DEFAULT 0,
  purchase_attempts integer NOT NULL DEFAULT 0,
  successful_purchases integer NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day)
);

CREATE TABLE backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid REFERENCES strategies(id),
  config jsonb NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  starting_capital bigint NOT NULL,
  ending_capital bigint,
  result jsonb
);

CREATE TABLE backtest_trades (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES backtest_runs(id),
  listing_id text NOT NULL,
  market_item_id text NOT NULL,
  bought_at timestamptz NOT NULL,
  sold_at timestamptz,
  acquisition_cost bigint NOT NULL,
  sale_revenue bigint,
  realized_profit bigint
);
CREATE INDEX backtest_trades_run_idx ON backtest_trades (run_id, bought_at);

CREATE TABLE system_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service text NOT NULL,
  account_id uuid REFERENCES accounts(id),
  bot_session_id uuid REFERENCES bot_sessions(id),
  event text NOT NULL,
  severity text NOT NULL,
  correlation_id uuid,
  payload jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL
);
CREATE INDEX system_events_time_idx ON system_events (occurred_at DESC);
CREATE INDEX system_events_correlation_idx ON system_events (correlation_id);

CREATE TABLE errors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service text NOT NULL,
  account_id uuid REFERENCES accounts(id),
  code text NOT NULL,
  message text NOT NULL,
  stack text,
  context jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL
);
CREATE INDEX errors_time_idx ON errors (occurred_at DESC);

CREATE TABLE discovered_commands (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  command text NOT NULL,
  result jsonb NOT NULL,
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  UNIQUE (command, result)
);

CREATE TABLE discovered_guis (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  slot_count integer NOT NULL,
  fingerprint text NOT NULL,
  structure jsonb NOT NULL,
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  UNIQUE (fingerprint)
);

CREATE TABLE action_outcomes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES bot_sessions(id),
  sequence bigint NOT NULL,
  action jsonb NOT NULL,
  success boolean NOT NULL,
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  before_snapshot jsonb,
  after_snapshot jsonb,
  message text,
  observed_at timestamptz NOT NULL,
  UNIQUE (session_id, sequence)
);
CREATE INDEX action_outcomes_session_time_idx ON action_outcomes (session_id, observed_at);

CREATE TABLE config_revisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  revision integer UNIQUE NOT NULL,
  config jsonb NOT NULL,
  changed_by text NOT NULL,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
