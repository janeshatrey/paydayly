import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"

export type DB = Database.Database

const migrations: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    income_paise INTEGER,
    payday INTEGER NOT NULL DEFAULT 1,
    weekend_weighted INTEGER NOT NULL DEFAULT 0,
    weekend_weight REAL NOT NULL DEFAULT 1.3,
    as_of_date TEXT,
    onboarded INTEGER NOT NULL DEFAULT 0,
    theme TEXT NOT NULL DEFAULT 'system'
  );

  CREATE TABLE commitments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    amount_paise INTEGER NOT NULL,
    due_day INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE INDEX commitments_user ON commitments(user_id);

  CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    amount_paise INTEGER NOT NULL,
    direction TEXT NOT NULL,
    narration TEXT NOT NULL,
    merchant TEXT NOT NULL,
    category TEXT NOT NULL,
    category_source TEXT NOT NULL,
    confidence REAL NOT NULL,
    fixed_override INTEGER,
    transfer INTEGER NOT NULL DEFAULT 0,
    one_off INTEGER NOT NULL DEFAULT 0,
    pending INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, fingerprint)
  );
  CREATE INDEX transactions_user_date ON transactions(user_id, date);

  CREATE TABLE rules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, pattern)
  );

  CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_paise INTEGER NOT NULL,
    saved_paise INTEGER NOT NULL DEFAULT 0,
    monthly_paise INTEGER NOT NULL DEFAULT 0,
    deadline TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE budgets (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    limit_paise INTEGER NOT NULL,
    PRIMARY KEY (user_id, category)
  );

  CREATE TABLE dismissed_flags (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    flag_id TEXT NOT NULL,
    PRIMARY KEY (user_id, flag_id)
  );

  CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT,
    UNIQUE (user_id, key)
  );

  CREATE TABLE imports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    added INTEGER NOT NULL,
    skipped INTEGER NOT NULL,
    rejected INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE profiles ADD COLUMN savings_target_paise INTEGER;
  ALTER TABLE profiles ADD COLUMN buffer_paise INTEGER;
  ALTER TABLE profiles ADD COLUMN tracking_since TEXT;
  ALTER TABLE profiles ADD COLUMN salary_delayed_for TEXT;
  ALTER TABLE profiles ADD COLUMN ai_enabled INTEGER NOT NULL DEFAULT 0;

  ALTER TABLE commitments ADD COLUMN frequency TEXT NOT NULL DEFAULT 'monthly';
  ALTER TABLE commitments ADD COLUMN due_month INTEGER;

  ALTER TABLE transactions ADD COLUMN account_id TEXT;
  ALTER TABLE transactions ADD COLUMN counter_account_id TEXT;
  ALTER TABLE transactions ADD COLUMN commitment_id TEXT;
  ALTER TABLE transactions ADD COLUMN goal_id TEXT;
  ALTER TABLE transactions ADD COLUMN receivable_id TEXT;
  ALTER TABLE transactions ADD COLUMN refund_of_id TEXT;
  ALTER TABLE transactions ADD COLUMN own_share_paise INTEGER;
  ALTER TABLE transactions ADD COLUMN import_id TEXT;
  CREATE INDEX transactions_import ON transactions(import_id);

  ALTER TABLE imports ADD COLUMN debit_paise INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE imports ADD COLUMN credit_paise INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE imports ADD COLUMN from_date TEXT;
  ALTER TABLE imports ADD COLUMN to_date TEXT;
  ALTER TABLE imports ADD COLUMN account_id TEXT;
  ALTER TABLE imports ADD COLUMN undone_at TEXT;

  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    spending INTEGER NOT NULL DEFAULT 1,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX accounts_user ON accounts(user_id);

  CREATE TABLE balance_confirmations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    balance_paise INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE goal_allocations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    amount_paise INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE receivables (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tx_id TEXT,
    kind TEXT NOT NULL,
    counterparty TEXT NOT NULL,
    amount_paise INTEGER NOT NULL,
    settled_paise INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE bill_marks (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    commitment_id TEXT NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
    cycle_start TEXT NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (user_id, commitment_id, cycle_start)
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    revoked_at TEXT
  );

  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );

  CREATE TABLE change_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL
  );
  CREATE INDEX change_log_user ON change_log(user_id, at);

  CREATE TABLE idempotency (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    status INTEGER NOT NULL,
    response TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );

  CREATE TABLE available_history (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    available_paise INTEGER NOT NULL,
    lines TEXT NOT NULL,
    PRIMARY KEY (user_id, date)
  );

  CREATE TABLE ai_usage (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );

  CREATE TABLE merchant_aliases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL,
    merchant TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, pattern)
  );

  CREATE TABLE ai_cache (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  `,
  `
  -- The AI money helper is available whenever the server has a key, so ai_enabled is no longer read (kept so old backups restore).
  ALTER TABLE profiles ADD COLUMN language TEXT NOT NULL DEFAULT 'en';
  `,
  `
  -- Legacy UI stored card debt as a negative balance and treated cards as cash.
  UPDATE balance_confirmations SET balance_paise = ABS(balance_paise)
    WHERE account_id IN (SELECT id FROM accounts WHERE kind = 'card');
  UPDATE accounts SET spending = 0 WHERE kind IN ('card', 'loan');
  -- Old confirmations were intraday values without a timestamp. Preserve them for
  -- history, but ask users for an unambiguous closing balance before using them.
  ALTER TABLE balance_confirmations ADD COLUMN is_closing INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE settlement_allocations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receivable_id TEXT NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
    tx_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0)
  );
  CREATE INDEX settlements_tx ON settlement_allocations(tx_id);
  CREATE TRIGGER reverse_settlement AFTER DELETE ON settlement_allocations
  BEGIN
    UPDATE receivables SET
      settled_paise = MAX(settled_paise - OLD.amount_paise, 0),
      status = CASE WHEN status = 'written_off' THEN status
        WHEN MAX(settled_paise - OLD.amount_paise, 0) >= amount_paise THEN 'settled' ELSE 'open' END
    WHERE id = OLD.receivable_id AND user_id = OLD.user_id;
  END;
  CREATE TRIGGER unlink_deleted_payment AFTER DELETE ON transactions
  BEGIN
    UPDATE receivables SET tx_id = NULL WHERE tx_id = OLD.id AND user_id = OLD.user_id;
    UPDATE transactions SET refund_of_id = NULL WHERE refund_of_id = OLD.id AND user_id = OLD.user_id;
  END;
  `,
]

/** Old backups have only aggregate settlement totals. Recover linked allocations
 * conservatively, never allocating more than either the credit or the saved total. */
export function recoverSettlementAllocations(db: DB): void {
  const rows = db.prepare(`SELECT t.id, t.user_id, t.receivable_id, t.amount_paise,
    r.settled_paise - COALESCE((SELECT SUM(a.amount_paise) FROM settlement_allocations a WHERE a.receivable_id = r.id), 0) AS remaining
    FROM transactions t JOIN receivables r ON r.id = t.receivable_id AND r.user_id = t.user_id
    WHERE t.direction = 'credit' AND NOT EXISTS (SELECT 1 FROM settlement_allocations a WHERE a.tx_id = t.id)
    ORDER BY t.date, t.time, t.id`).all() as { id: string; user_id: string; receivable_id: string; amount_paise: number; remaining: number }[]
  const used = new Map<string, number>()
  for (const row of rows) {
    const amount = Math.min(row.amount_paise, row.remaining - (used.get(row.receivable_id) ?? 0))
    if (amount <= 0) continue
    db.prepare("INSERT INTO settlement_allocations VALUES (?, ?, ?, ?, ?)").run(`legacy_${row.id}`, row.user_id, row.receivable_id, row.id, amount)
    used.set(row.receivable_id, (used.get(row.receivable_id) ?? 0) + amount)
  }
}

export function migrate(db: DB): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
  const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number | null }
  const current = row.version ?? 0
  migrations.slice(current).forEach((sql, index) => {
    const version = current + index + 1
    db.transaction(() => {
      db.exec(sql)
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(version, new Date().toISOString())
    })()
  })
  db.transaction(() => recoverSettlementAllocations(db))()
}

export function openDatabase(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  migrate(db)
  return db
}
