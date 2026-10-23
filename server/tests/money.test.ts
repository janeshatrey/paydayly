import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { createApp, type AppConfig } from "../src/app"
import { openDatabase } from "../src/db"
import { ruleEntries, ruleQuestion } from "../src/services/ai"

const statement = [
  "Date,Narration,Withdrawal Amt,Deposit Amt,Closing Balance",
  "01/10/2026,NEFT-CR-ACME PVT LTD-SALARY-OCT,,85000.00,95000.00",
  "01/10/2026,UPI/DR/40001/RENT/LANDLORD,22000.00,,73000.00",
  "02/10/2026,UPI/DR/881/BLINKIT/PAYTM,640.00,,72360.00",
  "03/10/2026,UPI/DR/883/SWIGGY/HDFC,410.00,,71950.00",
].join("\n")

function setup(extra: Partial<AppConfig> = {}, file = ":memory:") {
  const db = openDatabase(file)
  const app = createApp(db, { secret: "test-secret", secureCookies: false, authRateLimit: 1000, ...extra })
  return { db, app }
}

async function signUp(app: ReturnType<typeof setup>["app"], email = "asha@example.com") {
  const agent = request.agent(app)
  await agent.post("/api/auth/signup").send({ name: "Asha", email, password: "correct horse" }).expect(201)
  await agent
    .patch("/api/profile")
    .send({ incomePaise: 8_500_000, asOfDate: "2026-10-03", onboarded: true, savingsTargetPaise: 1_000_000, bufferPaise: 0 })
    .expect(200)
  return agent
}

describe("sessions and password reset", () => {
  it("revokes a session on the server, not just the cookie", async () => {
    const { app } = setup()
    const first = await signUp(app)
    const second = request.agent(app)
    await second.post("/api/auth/login").send({ email: "asha@example.com", password: "correct horse" }).expect(200)
    const list = await first.get("/api/auth/sessions").expect(200)
    expect(list.body.sessions).toHaveLength(2)
    expect(list.body.sessions.filter((item: { current: boolean }) => item.current)).toHaveLength(1)

    await first.post("/api/auth/sessions/others/revoke").expect(200)
    expect((await second.get("/api/dashboard")).status).toBe(401)
    expect((await first.get("/api/dashboard")).status).toBe(200)

    const cookie = (await request(app).post("/api/auth/login").send({ email: "asha@example.com", password: "correct horse" })).headers["set-cookie"]
    await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(204)
    expect((await request(app).get("/api/dashboard").set("Cookie", cookie)).status).toBe(401)
  })

  it("resets a password with a single-use token and signs everyone out", async () => {
    const tokens: string[] = []
    const { app } = setup({ onResetToken: (_email, token) => tokens.push(token) })
    const agent = await signUp(app)
    expect((await request(app).post("/api/auth/forgot").send({ email: "nobody@example.com" })).status).toBe(202)
    expect(tokens).toHaveLength(0)
    await request(app).post("/api/auth/forgot").send({ email: "Asha@example.com" }).expect(202)
    expect(tokens).toHaveLength(1)

    await request(app).post("/api/auth/reset").send({ token: tokens[0], password: "new password 1" }).expect(200)
    expect((await request(app).post("/api/auth/reset").send({ token: tokens[0], password: "again again" })).status).toBe(400)
    expect((await agent.get("/api/dashboard")).status).toBe(401)
    expect((await request(app).post("/api/auth/login").send({ email: "asha@example.com", password: "correct horse" })).status).toBe(401)
    expect((await request(app).post("/api/auth/login").send({ email: "asha@example.com", password: "new password 1" })).status).toBe(200)
  })

  it("only trusts proxy headers when told to", async () => {
    const plain = setup().app
    const proxied = setup({ trustProxy: 1 }).app
    expect(plain.get("trust proxy")).toBeFalsy()
    expect(proxied.get("trust proxy")).toBe(1)
  })
})

describe("imports", () => {
  it("reconciles against the file, undoes cleanly and replays idempotent requests", async () => {
    const { app } = setup()
    const agent = await signUp(app)
    const first = await agent.post("/api/import").set("Idempotency-Key", "import-1").send({ csv: statement, filename: "oct.csv" }).expect(201)
    expect(first.body.added).toBe(4)
    expect(first.body.reconciliation.balanceMatches).toBe(true)
    const replay = await agent.post("/api/import").set("Idempotency-Key", "import-1").send({ csv: statement })
    expect(replay.body.importId).toBe(first.body.importId)
    expect((await agent.get("/api/transactions")).body.total).toBe(4)

    const history = await agent.get("/api/imports").expect(200)
    expect(history.body.imports[0].id).toBe(first.body.importId)
    await agent.post(`/api/imports/${first.body.importId}/undo`).expect(200)
    expect((await agent.get("/api/transactions")).body.total).toBe(0)
    const again = await agent.post("/api/import").send({ csv: statement }).expect(201)
    expect(again.body.added).toBe(4)
  })

  it("lets the user leave out rows flagged for review", async () => {
    const { app } = setup()
    const agent = await signUp(app)
    const res = await agent.post("/api/import").send({ csv: statement, exclude: [3] }).expect(201)
    expect(res.body.added).toBe(3)
  })
})

describe("money owed back, bills and affordability", () => {
  it("keeps money owed out of what is available until it arrives", async () => {
    const { app } = setup()
    const agent = await signUp(app)
    await agent.post("/api/import").send({ csv: statement }).expect(201)
    const dinner = await agent.post("/api/transactions").send({ date: "2026-10-03", amountPaise: 300_000, narration: "Dinner with friends" }).expect(201)
    const before = (await agent.get("/api/dashboard")).body.snapshot.headline.availablePaise
    const owed = await agent
      .post("/api/receivables")
      .send({ txId: dinner.body.transaction.id, kind: "friends", counterparty: "Ravi", amountPaise: 150_000 })
      .expect(201)
    const pending = (await agent.get("/api/dashboard")).body.snapshot
    expect(pending.headline.availablePaise).toBe(before)
    expect(pending.receivables.openPaise).toBe(150_000)

    const repaid = await agent.post("/api/transactions").send({ date: "2026-10-03", amountPaise: 150_000, narration: "UPI/CR/RAVI", direction: "credit" }).expect(201)
    await agent.post(`/api/receivables/${owed.body.receivable.id}/settle`).send({ txId: repaid.body.transaction.id }).expect(200)
    const settled = (await agent.get("/api/dashboard")).body.snapshot
    expect(settled.receivables.openPaise).toBe(0)
    expect(settled.headline.availablePaise).toBe(before + 150_000)
  })

  it("marks a bill paid once and can undo it", async () => {
    const { app } = setup()
    const agent = await signUp(app)
    const sip = await agent.post("/api/commitments").send({ name: "Mutual fund SIP", kind: "sip", amountPaise: 500_000, dueDay: 5 }).expect(201)
    const id = sip.body.commitment.id
    await agent.post(`/api/bills/${id}/mark`).send({ status: "paid" }).expect(200)
    await agent.post(`/api/bills/${id}/mark`).send({ status: "paid" }).expect(200)
    let bill = (await agent.get("/api/dashboard")).body.snapshot.bills.find((line: { id: string }) => line.id === id)
    expect(bill.status).toBe("paid")
    expect((await agent.get("/api/transactions")).body.total).toBe(1)
    await agent.post(`/api/bills/${id}/mark`).send({ status: "unpaid" }).expect(200)
    bill = (await agent.get("/api/dashboard")).body.snapshot.bills.find((line: { id: string }) => line.id === id)
    expect(bill.status).not.toBe("paid")
    expect((await agent.get("/api/transactions")).body.total).toBe(0)
  })

  it("answers can I afford this from the engine, including a late payday", async () => {
    const { app } = setup()
    const agent = await signUp(app)
    await agent.post("/api/import").send({ csv: statement }).expect(201)
    const small = await agent.post("/api/afford").send({ amountPaise: 100_000 }).expect(200)
    expect(small.body.result.availableAfterPaise).toBe(small.body.result.availableBeforePaise - 100_000)
    const late = await agent.post("/api/afford").send({ amountPaise: 100_000, paydayLateDays: 5 }).expect(200)
    expect(late.body.result.daysLeft).toBeGreaterThan(small.body.result.daysLeft)
    const huge = await agent.post("/api/afford").send({ amountPaise: 90_000_000 }).expect(200)
    expect(huge.body.result.verdict).toBe("no")
  })
})

describe("isolation, backup and restart", () => {
  it("never shows or touches another user's data", async () => {
    const { app } = setup()
    const asha = await signUp(app)
    const ravi = await signUp(app, "ravi@example.com")
    const tx = await asha.post("/api/transactions").send({ date: "2026-10-03", amountPaise: 5_000, narration: "Chai" }).expect(201)
    expect((await ravi.get("/api/transactions")).body.total).toBe(0)
    expect((await ravi.delete(`/api/transactions/${tx.body.transaction.id}`)).status).toBe(404)
    expect((await ravi.post("/api/receivables").send({ txId: tx.body.transaction.id, kind: "friends", counterparty: "X", amountPaise: 100 })).status).toBe(404)
    const accounts = (await asha.get("/api/accounts")).body.accounts
    expect((await ravi.post(`/api/accounts/${accounts[0].id}/confirm`).send({ balancePaise: 1 })).status).toBe(404)
  })

  it("round-trips a backup into a fresh account", async () => {
    const { app } = setup()
    const asha = await signUp(app)
    await asha.post("/api/import").send({ csv: statement }).expect(201)
    await asha.post("/api/goals").send({ name: "Goa trip", targetPaise: 2_000_000 }).expect(201)
    const backup = (await asha.get("/api/backup").expect(200)).body
    const ravi = await signUp(app, "ravi@example.com")
    await ravi.post("/api/restore").send(backup).expect(200)
    expect((await ravi.get("/api/transactions")).body.total).toBe(4)
    expect((await ravi.get("/api/goals")).body.goals).toHaveLength(1)
    expect((await asha.get("/api/transactions")).body.total).toBe(4)
    expect((await ravi.post("/api/restore").send({ app: "other" })).status).toBe(400)
  })

  it("keeps data and sessions across a restart", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paydayly-"))
    const file = path.join(dir, "paydayly.db")
    const first = setup({}, file)
    const agent = await signUp(first.app)
    await agent.post("/api/import").send({ csv: statement }).expect(201)
    const cookie = (await request(first.app).post("/api/auth/login").send({ email: "asha@example.com", password: "correct horse" })).headers["set-cookie"]
    first.db.close()
    const second = setup({}, file)
    const res = await request(second.app).get("/api/transactions").set("Cookie", cookie).expect(200)
    expect(res.body.total).toBe(4)
    second.db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe("AI helper", () => {
  it("falls back to simple rules without a key", async () => {
    const { app } = setup()
    const agent = await signUp(app)
    expect((await agent.get("/api/ai/status")).body).toMatchObject({ available: false, enabled: false })
    const parsed = await agent.post("/api/ai/parse").send({ text: "Kal chai pe 80 aur auto pe 150" }).expect(200)
    expect(parsed.body.source).toBe("rules")
    expect(parsed.body.drafts).toEqual([
      { date: "2026-10-02", amountPaise: 8_000, narration: "Chai", direction: "debit" },
      { date: "2026-10-02", amountPaise: 15_000, narration: "Auto", direction: "debit" },
    ])
    const ask = await agent.post("/api/ai/ask").send({ question: "Can I afford 2000 shoes?" }).expect(200)
    expect(ask.body.intent).toBe("afford")
    expect(ask.body.result.availableAfterPaise).toBe(ask.body.result.availableBeforePaise - 200_000)
  })

  it("uses the model only to read and explain, and rejects invented numbers", async () => {
    const replies = [
      { intent: "afford", amountRupees: 2000, date: null, item: "shoes" },
      { text: "Yes, but you would have ₹99,999 left." },
    ]
    const calls: unknown[] = []
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(replies.shift()) } }] }), { status: 200 })
    }) as unknown as typeof fetch
    const { app, db } = setup({ ai: { apiKey: "test", model: "m", baseUrl: "http://ai", dailyLimit: 5, timeoutMs: 1000, fetchImpl } })
    const agent = await signUp(app)
    const ask = await agent.post("/api/ai/ask").send({ question: "shoes for two thousand, ok?" }).expect(200)
    expect(ask.body.intent).toBe("afford")
    expect(ask.body.result.availableAfterPaise).toBe(ask.body.result.availableBeforePaise - 200_000)
    expect(ask.body.explanation).not.toContain("99,999")
    expect(calls).toHaveLength(2)
    expect(JSON.stringify(calls)).not.toContain("asha@example.com")
    db.prepare("UPDATE ai_usage SET count = 5").run()
    db.prepare("DELETE FROM ai_cache").run()
    const limited = await agent.post("/api/ai/ask").send({ question: "Can I afford 500?" }).expect(200)
    expect(limited.body.source).toBe("rules")
    expect(calls).toHaveLength(2)
  })

  it("reads Hinglish notes and questions with rules", () => {
    expect(ruleEntries("aaj 1.5k groceries", "2026-10-03")).toEqual([{ amountRupees: 1500, description: "Groceries", date: "2026-10-03", direction: "debit" }])
    expect(ruleQuestion("kitna bacha hai?").intent).toBe("status")
  })
})

describe("regressions found in user testing", () => {
  it("lets two identical manual entries on the same day coexist", async () => {
    const { app } = setup()
    const agent = await signUp(app)
    const chai = { date: "2026-10-03", time: "12:00", amountPaise: 8000, narration: "Chai" }
    await agent.post("/api/transactions").set("Idempotency-Key", "k1").send(chai).expect(201)
    await agent.post("/api/transactions").set("Idempotency-Key", "k2").send(chai).expect(201)
    const replay = await agent.post("/api/transactions").set("Idempotency-Key", "k2").send(chai).expect(201)
    expect(replay.headers["idempotent-replay"]).toBe("true")
    expect((await agent.get("/api/transactions")).body.total).toBe(2)
  })

  it("rejects dates that do not exist", async () => {
    const { app } = setup()
    const agent = await signUp(app)
    await agent.post("/api/transactions").send({ date: "2026-13-45", amountPaise: 100, narration: "x" }).expect(400)
    await agent.post("/api/transactions").send({ date: "2026-02-30", amountPaise: 100, narration: "x" }).expect(400)
  })

  it("reads Hindi notes written in Devanagari", () => {
    expect(ruleEntries("कल चाय पे ८० और ऑटो पे 150", "2026-10-03")).toEqual([
      { amountRupees: 80, description: "चाय", date: "2026-10-02", direction: "debit" },
      { amountRupees: 150, description: "ऑटो", date: "2026-10-02", direction: "debit" },
    ])
  })
})

describe("review fixes, round 3", () => {
  it("counts a yearly commitment as a monthly share in the month report", async () => {
    const { app } = setup()
    const agent = await signUp(app)
    await agent.post("/api/commitments").send({ name: "Insurance", kind: "bills", amountPaise: 1_200_000, dueDay: 10, frequency: "yearly", dueMonth: 3 }).expect(201)
    await agent.post("/api/commitments").send({ name: "Gold fund", kind: "sip", amountPaise: 600_000, frequency: "quarterly", dueMonth: 1 }).expect(201)
    const month = await agent.get("/api/month?month=2026-10").expect(200)
    expect(month.body.totals.plannedFixedPaise).toBe(100_000)
    expect(month.body.totals.plannedSavingsPaise).toBe(200_000)
  })

  it("keeps the AI helper on for everyone whenever the server has a key", async () => {
    const { app } = setup({ ai: { apiKey: "test-key", model: "test-model", dailyLimit: 5 } as never })
    const agent = await signUp(app)
    const status = await agent.get("/api/ai/status").expect(200)
    expect(status.body).toMatchObject({ available: true, enabled: true })
    expect((await agent.get("/api/me")).body.user.profile.aiEnabled).toBeUndefined()
  })

  it("stores the chosen language on the profile", async () => {
    const { app } = setup()
    const agent = await signUp(app)
    await agent.patch("/api/profile").send({ language: "hi" }).expect(200)
    expect((await agent.get("/api/me")).body.user.profile.language).toBe("hi")
    expect((await agent.patch("/api/profile").send({ language: "fr" })).status).toBe(400)
  })

  it("drops an AI explanation that ties a purchase to a goal the user did not pick", async () => {
    const replies = [{ intent: "afford", amountRupees: 12000, item: "phone" }, { text: "Yes, but it delays your Goa trip." }]
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(replies.shift()) } }] }), { status: 200 })) as unknown as typeof fetch
    const { app } = setup({ ai: { apiKey: "test", model: "m", baseUrl: "http://ai", dailyLimit: 5, timeoutMs: 1000, fetchImpl } })
    const agent = await signUp(app)
    await agent.post("/api/goals").send({ name: "Goa trip", targetPaise: 3_000_000, monthlyPaise: 500_000 }).expect(201)
    const ask = await agent.post("/api/ai/ask").send({ question: "Can I buy a 12000 phone?" }).expect(200)
    expect(ask.body.result.goal).toBeNull()
    expect(ask.body.explanation).not.toContain("Goa")
  })
})

describe("quick entry with Indian dates", () => {
  it("reads DD/MM and '22 Oct' dates without treating them as amounts", () => {
    const a = ruleEntries("chai 80 on 22/10", "2026-10-23")
    expect(a).toEqual([expect.objectContaining({ amountRupees: 80, date: "2026-10-22" })])
    const b = ruleEntries("15 Oct auto 150, lunch 220", "2026-10-23")
    expect(b.map((e) => [e.amountRupees, e.date])).toEqual([
      [150, "2026-10-15"],
      [220, "2026-10-15"],
    ])
  })
})
