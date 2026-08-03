CREATE TABLE IF NOT EXISTS budget_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    category TEXT NOT NULL,
    monthly_limit REAL NOT NULL,
    month_key TEXT NOT NULL,
    alerted_80 INTEGER NOT NULL DEFAULT 0,
    alerted_100 INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, category, month_key)
);
CREATE INDEX IF NOT EXISTS budget_limits_due ON budget_limits(month_key, user_id);
