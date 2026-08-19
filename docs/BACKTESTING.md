# Backtesting

The backtester reuses the execution opportunity evaluator and risk engine. It replays historical frames with capital constraints and listing disappearance modeling. The replay adapter additionally replays normalized client events.

Before using real capital, capture owner-authorized Auction House observations, persist them, and replay them through new strategy/configuration revisions.
