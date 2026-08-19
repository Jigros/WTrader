# Trading Engine

The realtime path is deterministic:

`GUI update -> parse -> normalize -> stable listing fingerprint -> hot market state -> pricing -> opportunity queue -> Redis reservation -> guarded click -> reconciliation`

Pricing uses outlier filtering, weighted median, EMA, liquidity, and confidence. Risk enforces active capital, maximum trade, maximum market exposure, minimum profit, dynamic bounded ROI, confidence, stale data, and circuit breakers.

Purchases require a valid current GUI, matching listing slot/item, fresh balance, lock ownership, and post-click balance plus inventory confirmation. Ambiguous outcomes are treated as unknown and must be reconciled before another attempt.

Sell recommendations never intentionally price below cost basis. Repricing respects interval and hourly limits.
