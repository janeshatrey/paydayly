import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createApp, type AppConfig } from "../src/app"
import { migrate, openDatabase, type DB } from "../src/db"
import Database from "better-sqlite3"
import { resetMailerFromEnv } from "../src/services/mail"

const databases: DB[] = []
afterEach(() => { databases.splice(0).forEach((db) => db.close()); vi.restoreAllMocks() })
async function setup(extra: Partial<AppConfig> = {}) {
  const db = openDatabase(":memory:"); databases.push(db)
  const app = createApp(db, { secret: "review-tests", secureCookies: false, authRateLimit: 1000, ...extra })
  const agent = request.agent(app)
  await agent.post("/api/auth/signup").send({ name: "Review", email: "review@example.test", password: "review-password" }).expect(201)
  await agent.patch("/api/profile").send({ asOfDate: "2026-10-24", incomePaise: 5_000_000, savingsTargetPaise: 0, bufferPaise: 0 }).expect(200)
  const main = (await agent.get("/api/accounts")).body.accounts[0].account.id as string
  return { db, app, agent, main }
}
const debit = { date: "2026-10-24", amountPaise: 100_000, narration: "Shared lunch", category: "Eating out" }
const csv = "Date,Narration,Debit,Credit\n24/10/2026,BANK CHARGE,100,\n"

describe("review API regressions", () => {
  it("migrates legacy card confirmations and reconstructs reversible settlements", () => {
    const db = new Database(":memory:"); databases.push(db)
    db.pragma("foreign_keys = ON")
    db.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT);
      INSERT INTO schema_migrations VALUES (3, '2026-10-01');
      CREATE TABLE users (id TEXT PRIMARY KEY);
      INSERT INTO users VALUES ('u');
      CREATE TABLE accounts (id TEXT PRIMARY KEY, kind TEXT, spending INTEGER);
      INSERT INTO accounts VALUES ('card', 'card', 1);
      CREATE TABLE balance_confirmations (id TEXT PRIMARY KEY, account_id TEXT, balance_paise INTEGER);
      INSERT INTO balance_confirmations VALUES ('bc', 'card', -500000);
      CREATE TABLE receivables (id TEXT PRIMARY KEY, user_id TEXT, tx_id TEXT, amount_paise INTEGER, settled_paise INTEGER, status TEXT);
      INSERT INTO receivables VALUES ('r', 'u', NULL, 10000, 10000, 'settled');
      CREATE TABLE transactions (id TEXT PRIMARY KEY, user_id TEXT, receivable_id TEXT, refund_of_id TEXT, direction TEXT, amount_paise INTEGER, date TEXT, time TEXT);
      INSERT INTO transactions VALUES ('t', 'u', 'r', NULL, 'credit', 20000, '2026-10-01', '12:00');
    `)
    migrate(db)
    expect(db.prepare("SELECT balance_paise, is_closing FROM balance_confirmations").get()).toEqual({ balance_paise: 500000, is_closing: 0 })
    expect(db.prepare("SELECT spending FROM accounts").get()).toEqual({ spending: 0 })
    expect(db.prepare("SELECT amount_paise FROM settlement_allocations").get()).toEqual({ amount_paise: 10000 })
    migrate(db)
    db.prepare("DELETE FROM transactions WHERE id = 't'").run()
    expect(db.prepare("SELECT settled_paise, status FROM receivables").get()).toEqual({ settled_paise: 0, status: "open" })
  })

  it("uses corrected closing balances and rejects ambiguous intraday confirmations", async () => {
    const { agent, main } = await setup()
    await agent.post(`/api/accounts/${main}/confirm`).send({ balancePaise: 1_000_000 }).expect(201)
    await agent.post(`/api/accounts/${main}/confirm`).send({ balancePaise: 800_000 }).expect(201)
    expect((await agent.get("/api/accounts")).body.accounts[0].balancePaise).toBe(800_000)
    await agent.post(`/api/accounts/${main}/confirm`).send({ date: "2026-10-24", balancePaise: 800_000 }).expect(400)
    await agent.post("/api/transactions").send({ ...debit, category: "Transfer", amountPaise: 200_000 }).expect(201)
    expect((await agent.get("/api/accounts")).body.accounts[0].balancePaise).toBe(600_000)
  })

  it("keeps cards out of cash even when clients request spending=true", async () => {
    const { agent, main } = await setup()
    const card = (await agent.post("/api/accounts").send({ name: "Card", kind: "card", spending: true }).expect(201)).body.account
    expect(card.spending).toBe(false)
    await agent.post(`/api/accounts/${main}/confirm`).send({ balancePaise: 1_000_000 }).expect(201)
    await agent.post(`/api/accounts/${card.id}/confirm`).send({ balancePaise: 500_000 }).expect(201)
    await agent.post("/api/transactions").send({ ...debit, amountPaise: 200_000, accountId: card.id }).expect(201)
    expect((await agent.get("/api/dashboard")).body.snapshot.headline.availablePaise).toBe(300_000)
  })

  it("imports matching rows in distinct accounts, but skips a reimport in the same account", async () => {
    const { agent, main, db } = await setup()
    const other = (await agent.post("/api/accounts").send({ name: "Other", kind: "bank" })).body.account.id
    expect((await agent.post("/api/import").send({ csv })).body.added).toBe(1)
    // Simulate a legacy fingerprint: detection must also work without rewriting history.
    db.prepare("UPDATE transactions SET fingerprint = 'legacy-fingerprint'").run()
    expect((await agent.post("/api/import/preview").send({ csv, accountId: main })).body.duplicates).toBe(1)
    expect((await agent.post("/api/import/preview").send({ csv, accountId: other })).body.duplicates).toBe(0)
    expect((await agent.post("/api/import").send({ csv, accountId: other })).body.added).toBe(1)
    expect((await agent.post("/api/import").send({ csv, accountId: main })).body.skipped).toBe(1)
    const double = csv + "24/10/2026,BANK CHARGE,100,\n"
    expect((await agent.post("/api/import").send({ csv: double, accountId: main })).body.added).toBe(1)
    expect((await agent.get("/api/transactions")).body.total).toBe(3)
  })

  it("rejects overallocated debts and inflated or zero linked repayments", async () => {
    const { agent } = await setup()
    const tx = (await agent.post("/api/transactions").send(debit)).body.transaction
    const owed = (await agent.post("/api/receivables").send({ txId: tx.id, kind: "friends", counterparty: "A", amountPaise: 80_000 })).body.receivable
    await agent.post("/api/receivables").send({ txId: tx.id, kind: "friends", counterparty: "B", amountPaise: 80_000 }).expect(400)
    const credit = (await agent.post("/api/transactions").send({ ...debit, direction: "credit", amountPaise: 10_000 })).body.transaction
    await agent.post(`/api/receivables/${owed.id}/settle`).send({ txId: credit.id, amountPaise: 80_000 }).expect(400)
    await agent.post(`/api/receivables/${owed.id}/settle`).send({ txId: credit.id, amountPaise: 0 }).expect(400)
    await agent.post(`/api/receivables/${owed.id}/settle`).send({ txId: credit.id }).expect(200)
    await agent.delete(`/api/transactions/${credit.id}`).expect(204)
    const after = (await agent.get("/api/receivables")).body.receivables[0]
    expect(after.settledPaise).toBe(0)
    expect(after.status).toBe("open")
  })

  it("reverses exactly the allocation after backup/restore and import undo", async () => {
    const { agent } = await setup()
    const owed = (await agent.post("/api/receivables").send({ kind: "friends", counterparty: "A", amountPaise: 10_000 })).body.receivable
    const imported = (await agent.post("/api/import").send({ csv: "Date,Narration,Debit,Credit\n24/10/2026,Repayment,,200\n" })).body
    const tx = (await agent.get("/api/transactions")).body.transactions[0]
    await agent.post(`/api/receivables/${owed.id}/settle`).send({ txId: tx.id, amountPaise: 6_000 }).expect(200)
    await agent.post(`/api/receivables/${owed.id}/settle`).send({ amountPaise: 4_000 }).expect(200)
    const backup = (await agent.get("/api/backup")).body
    await agent.post("/api/restore").send(backup).expect(200)
    const imports = (await agent.get("/api/imports")).body.imports
    expect(imports[0].id).not.toBe(imported.importId)
    await agent.post(`/api/imports/${imports[0].id}/undo`).expect(200)
    const after = (await agent.get("/api/receivables")).body.receivables[0]
    expect(after.settledPaise).toBe(4_000)
    expect(after.status).toBe("open")
  })

  it("restores legacy backups without allocations and keeps write-offs closed when credits are deleted", async () => {
    const { agent } = await setup()
    const owed = (await agent.post("/api/receivables").send({ kind: "friends", counterparty: "A", amountPaise: 10_000 })).body.receivable
    const credit = (await agent.post("/api/transactions").send({ ...debit, direction: "credit", amountPaise: 10_000 })).body.transaction
    await agent.post(`/api/receivables/${owed.id}/settle`).send({ txId: credit.id }).expect(200)
    const backup = (await agent.get("/api/backup")).body
    delete backup.tables.settlement_allocations
    await agent.post("/api/restore").send(backup).expect(200)
    const restoredDebt = (await agent.get("/api/receivables")).body.receivables[0]
    const restoredCredit = (await agent.get("/api/transactions")).body.transactions[0]
    await agent.post(`/api/receivables/${restoredDebt.id}/write-off`).expect(200)
    await agent.delete(`/api/transactions/${restoredCredit.id}`).expect(204)
    const after = (await agent.get("/api/receivables")).body.receivables[0]
    expect(after.settledPaise).toBe(0)
    expect(after.status).toBe("written_off")
  })

  it("reports unavailable recovery consistently and never exposes mail failures or reset tokens", async () => {
    const { app } = await setup()
    for (const email of ["review@example.test", "missing@example.test"]) await request(app).post("/api/auth/forgot").send({ email }).expect(503)
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const broken = await setup({ onResetToken: async () => { throw new Error("provider secret") } })
    const known = await request(broken.app).post("/api/auth/forgot").send({ email: "review@example.test" }).expect(202)
    const unknown = await request(broken.app).post("/api/auth/forgot").send({ email: "missing@example.test" }).expect(202)
    expect(known.body).toEqual(unknown.body)
    expect(broken.db.prepare("SELECT COUNT(*) AS n FROM password_resets").get()).toEqual({ n: 0 })
    expect(JSON.stringify(log.mock.calls)).not.toContain("provider secret")
  })
})

describe("mail delivery adapter", () => {
  it("requires configuration and sends a 30-minute link only through the server", async () => {
    expect(resetMailerFromEnv({})).toBeUndefined()
    const send = vi.fn().mockResolvedValue({ ok: true })
    const mail = resetMailerFromEnv({ PUBLIC_URL: "https://paydayly.example", RESEND_API_KEY: "test", MAIL_FROM: "reset@example.test", NODE_ENV: "production" }, send)!
    await mail("review@example.test", "test-token")
    const payload = JSON.parse(send.mock.calls[0][1].body)
    expect(payload.to).toEqual(["review@example.test"])
    expect(payload.text).toContain("https://paydayly.example/reset?token=test-token")
    expect(payload.text).toContain("30 minutes")
    send.mockResolvedValue({ ok: false })
    await expect(mail("review@example.test", "token")).rejects.toThrow("delivery failed")
    expect(() => resetMailerFromEnv({ PUBLIC_URL: "http://example.test", RESEND_API_KEY: "test", MAIL_FROM: "a", NODE_ENV: "production" })).toThrow("HTTPS")
  })
})
