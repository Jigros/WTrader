ALTER TABLE positions
  ADD COLUMN fair_value_at_purchase bigint,
  ADD COLUMN expected_sale_price bigint,
  ADD COLUMN expected_holding_time_ms bigint,
  ADD COLUMN strategy_id uuid REFERENCES strategies(id);

CREATE TABLE discovered_gui_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gui_signature text UNIQUE NOT NULL,
  title_pattern text NOT NULL,
  layout_type text NOT NULL,
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX discovered_gui_layouts_type_idx ON discovered_gui_layouts (layout_type, last_seen_at DESC);

ALTER TABLE purchase_attempts
  ADD COLUMN transition_history jsonb NOT NULL DEFAULT '[]';
