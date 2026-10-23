import request from "supertest"
import { beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app"
import { openDatabase } from "../src/db"

const statement = [
  "Date,Narration,Withdrawal Amt,Deposit Amt",
  "01/10/2026,NEFT-CR-ACME PVT LTD-SALARY-OCT,,85000.00",
  "01/10/2026,UPI/DR/40001/RENT/LANDLORD,22000.00,",
  "02/10/2026,UPI/DR/881/BLINKIT/PAYTM,640.00,",
  "02/10/2026,UPI/DR/882/THIRD WAVE COFFEE/OKICICI,260.00,",
  "03/10/2026,UPI/DR/883/SWIGGY/HDFC,410.00,",
  "not a date,UPI/DR/884/ZEPTO,100.00,",
].join("\n")

function setup() {
  const db = openDatabase(":memory:")
  const app = createApp(db, { secret: "test-secret", secureCookies: false, authRateLimit: 1000 })
  return { db, app }
}

async function signUp(app: ReturnType<typeof setup>["app"], email = "asha@example.com") {
  const agent = request.agent(app)
  const res = await agent.post("/api/auth/signup").send({ name: "Asha", email, password: "correct horse" })
  expect(res.status).toBe(201)
  return agent
}

describe("auth", () => {
  let ctx: ReturnType<typeof setup>
  beforeEach(() => {
    ctx = setup()
  })

  it("creates an account, stores a hash, and sets an httpOnly cookie", async () => {
    const res = await request(ctx.app).post("/api/auth/signup").send({ name: "Asha", email: "Asha@Example.com", password: "correct horse" })
    expect(res.status).toBe(201)
    expect(res.headers["set-cookie"][0]).toMatch(/HttpOnly/)
    const row = ctx.db.prepare("SELECT email, password_hash FROM users").get() as { email: string; password_hash: string }
    expect(row.email).toBe("asha@example.com")
    expect(row.password_hash).toMatch(/^\$2[aby]\$12\$/)
  })

  it("rejects weak input and duplicate emails", async () => {
    const weak = await request(ctx.app).post("/api/auth/signup").send({ name: "A", email: "a@b.co", password: "short" })
    expect(weak.status).toBe(400)
    await signUp(ctx.app)
    const dup = await request(ctx.app).post("/api/auth/signup").send({ name: "B", email: "asha@example.com", password: "another pass" })
    expect(dup.status).toBe(409)
  })

  it("logs in with the right password only", async () => {
    await signUp(ctx.app)
    const wrong = await request(ctx.app).post("/api/auth/login").send({ email: "asha@example.com", password: "nope nope" })
    expect(wrong.status).toBe(401)
    const right = await request(ctx.app).post("/api/auth/login").send({ email: "asha@example.com", password: "correct horse" })
    expect(right.status).toBe(200)
  })

  it("blocks the API without a session", async () => {
    const res = await request(ctx.app).get("/api/dashboard")
    expect(res.status).toBe(401)
  })
})

describe("a new account", () => {
  it("starts with no data at all", async () => {
    const { app } = setup()
    const agent = await signUp(app)
    const dash = await agent.get("/api/dashboard")
    expect(dash.status).toBe(200)
    expect(dash.body.empty).toBe(true)
    expect(dash.body.transactionCount).toBe(0)
    expect((await agent.get("/api/transactions")).body.total).toBe(0)
    expect((await agent.get("/api/goals")).body.goals).toEqual([])
    expect((await agent.get("/api/commitments")).body.commitments).toEqual([])
    expect((await agent.get("/api/notifications")).body.unread).toBe(0)
  })
})

describe("ledger", () => {
  async function onboarded() {
    const { app, db } = setup()
    const agent = await signUp(app)
    await agent.patch("/api/profile").send({ incomePaise: 8_500_000, asOfDate: "2026-10-03", onboarded: true, savingsTargetPaise: 1_000_000, bufferPaise: 0 }).expect(200)
    await agent.post("/api/commitments").send({ name: "Rent", kind: "rent", amountPaise: 2_200_000, dueDay: 1 }).expect(201)
    await agent.post("/api/commitments").send({ name: "Mutual fund SIP", kind: "sip", amountPaise: 1_000_000, dueDay: 5 }).expect(201)
    return { app, db, agent }
  }

  it("previews and imports a statement, keeping rejected rows visible", async () => {
    const { agent } = await onboarded()
    const preview = await agent.post("/api/import/preview").send({ csv: statement })
    expect(preview.status).toBe(200)
    expect(preview.body.mapping).toMatchObject({ date: "Date", narration: "Narration", debit: "Withdrawal Amt", credit: "Deposit Amt" })
    expect(preview.body.readable).toBe(5)
    expect(preview.body.rejected).toHaveLength(1)

    const first = await agent.post("/api/import").send({ csv: statement, filename: "oct.csv" })
    expect(first.status).toBe(201)
    expect(first.body.added).toBe(5)
    expect(first.body.rejected).toHaveLength(1)

    const again = await agent.post("/api/import").send({ csv: statement })
    expect(again.body.added).toBe(0)
    expect(again.body.skipped).toBe(5)
  })

  it("computes safe to spend from the shared engine", async () => {
    const { agent } = await onboarded()
    await agent.post("/api/import").send({ csv: statement }).expect(201)
    const dash = await agent.get("/api/dashboard")
    const { budget } = dash.body.snapshot
    expect(budget.poolPaise).toBe(8_500_000 - 2_200_000 - 1_000_000)
    expect(budget.poolLeftAtStartPaise).toBe(5_300_000 - 64_000 - 26_000)
    expect(budget.daysLeft).toBe(29)
    expect(dash.body.snapshot.reconciliation.ok).toBe(true)
  })

  it("adds, recategorises with a rule, and deletes a payment", async () => {
    const { agent } = await onboarded()
    await agent.post("/api/import").send({ csv: statement }).expect(201)
    const created = await agent.post("/api/transactions").send({ date: "2026-10-03", time: "19:30", amountPaise: 45_000, narration: "UPI/DR/889/BLINKIT/PAYTM" })
    expect(created.status).toBe(201)
    expect(created.body.transaction.category).toBe("Quick commerce")

    const patched = await agent.patch(`/api/transactions/${created.body.transaction.id}`).send({ category: "Shopping", applyToSimilar: true })
    expect(patched.body.updated).toBe(2)
    const shopping = await agent.get("/api/transactions").query({ category: "Shopping" })
    expect(shopping.body.total).toBe(2)

    const search = await agent.get("/api/transactions").query({ q: "coffee" })
    expect(search.body.total).toBe(1)

    await agent.delete(`/api/transactions/${created.body.transaction.id}`).expect(204)
    expect((await agent.get("/api/transactions")).body.total).toBe(5)
  })

  it("validates payloads", async () => {
    const { agent } = await onboarded()
    expect((await agent.post("/api/transactions").send({ date: "03-10-2026", amountPaise: 100, narration: "x" })).status).toBe(400)
    expect((await agent.post("/api/transactions").send({ date: "2026-10-03", amountPaise: -5, narration: "x" })).status).toBe(400)
    expect((await agent.post("/api/commitments").send({ name: "Rent", kind: "holiday", amountPaise: 100 })).status).toBe(400)
    expect((await agent.patch("/api/profile").send({ theme: "neon" })).status).toBe(400)
  })

  it("raises notifications for overspending and upcoming bills", async () => {
    const { agent } = await onboarded()
    await agent.post("/api/import").send({ csv: statement }).expect(201)
    await agent.post("/api/transactions").send({ date: "2026-10-03", time: "20:00", amountPaise: 900_000, narration: "UPI/DR/AMAZON PAY/AXIS" }).expect(201)
    const list = await agent.get("/api/notifications")
    const kinds = list.body.notifications.map((item: { kind: string }) => item.kind)
    expect(kinds).toContain("overspend")
    expect(kinds).toContain("bill")
    await agent.post("/api/notifications/read").expect(204)
    expect((await agent.get("/api/notifications")).body.unread).toBe(0)
  })

  it("tracks goals and projects a finish date", async () => {
    const { agent } = await onboarded()
    const goal = await agent.post("/api/goals").send({ name: "Goa trip", targetPaise: 6_000_000, savedPaise: 1_000_000, monthlyPaise: 1_000_000, deadline: "2027-06-30" })
    expect(goal.status).toBe(201)
    await agent.post(`/api/goals/${goal.body.goal.id}/contributions`).send({ amountPaise: 500_000 }).expect(200)
    const dash = await agent.get("/api/dashboard")
    expect(dash.body.goals[0].savedPaise).toBe(1_500_000)
    expect(dash.body.goals[0].monthsLeft).toBe(5)
  })

  it("keeps each user's data separate", async () => {
    const { app, agent } = await onboarded()
    await agent.post("/api/import").send({ csv: statement }).expect(201)
    const other = await signUp(app, "ravi@example.com")
    expect((await other.get("/api/transactions")).body.total).toBe(0)
    const mine = await agent.get("/api/transactions")
    const res = await other.delete(`/api/transactions/${mine.body.transactions[0].id}`)
    expect(res.status).toBe(404)
  })

  it("deletes the account after checking the password", async () => {
    const { agent, db } = await onboarded()
    expect((await agent.delete("/api/account").send({ password: "wrong one" })).status).toBe(403)
    await agent.delete("/api/account").send({ password: "correct horse" }).expect(204)
    expect((db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n).toBe(0)
  })
})
