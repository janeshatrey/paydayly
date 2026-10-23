# Paydayly

Paydayly is a payday decision assistant for salaried people in India. Paydayly explains what you can afford before payday, and tells you when it doesn't have enough information.

It sets aside rent, EMIs, bills, SIPs and your savings target first, then shows what is left for discretionary spending until the next payday, and what is safe for today.

Paydayly is built as a hosted product (web now, Android app planned) with sign up and sign in; the instructions below are for running it locally during development.

Original app built by the team; an AI assistant was used for code review, bug fixes, redesign and documentation.

## Features

- Accounts with email and password (bcrypt hashes, httpOnly session cookie)
- Light setup: take-home pay, payday and fixed costs only. Savings default from a 50/30/20 split (at least 10%) and can be changed later
- Budget period runs from payday to payday
- "Available for discretionary spending" with a breakdown of how it was worked out and why it changed
- Figures are marked as estimates until you confirm a balance; confirming is optional and can be done any time
- "Can I afford this?": checks a purchase against bills due before payday, your buffer and goals, with a "what if payday is late" switch
- Money owed back: mark part of a payment as owed by a friend, link repayments, and keep expected money separate from money you have
- Quarterly and yearly commitments with a due month
- Password reset, active sessions with sign-out, backup and restore, import undo and a change history
- Statement import from any bank: CSV, XLS (including HTML-style .xls exports) and XLSX. Paydayly finds the header row, skips bank-info and summary lines, joins wrapped descriptions, handles withdrawal/deposit columns or a single amount with Dr/Cr, and reads most date formats. Automatic column mapping with a confidence score and manual override, duplicate detection, a review list, a closing-balance check and a reconciliation summary
- Dashboard with a "safe to spend today" figure, spending trend, category breakdown, upcoming bills, alerts, budgets and goals
- Month view with daily spending chart, calendar heatmap, categories and top merchants
- Activity list with search, filters, manual entries, editing, category rules and CSV export
- Savings goals with contributions and a projected finish date
- Recurring payment detection, including price increases
- AI money helper: ask in plain English or Hinglish, or type and speak entries and typed or spoken entries in English, Hindi and Hinglish (see below)
- Guided first-login tour in English and Hindi
- Notification centre, dark mode and a mobile layout
- Export all data, clear data, or delete the account

The app starts empty. There is no demo data. To try it with a realistic statement, see [sample-data/README.md](sample-data/README.md).

## Requirements

- Node.js 20 or newer (22 or 24 recommended)
- npm 10 or newer

## Run it

```
npm install
npm run dev
```

If npm 11 or newer warns that install scripts were skipped, the project already approves `better-sqlite3` and `esbuild` in `package.json`; run `npm rebuild better-sqlite3 esbuild` once if the server fails to start.

Open http://localhost:5173. The API runs on http://localhost:4000 and Vite forwards `/api` requests to it.

To run a single production server:

```
npm run build
npm start
```

Then open http://localhost:4000.

## Tests

```
npm test
npm run typecheck
```

`npm test` runs the budgeting engine tests in `shared` and the API tests in `server`.

## Configuration

| Variable          | Default        | Purpose                                                    |
|-------------------|----------------|------------------------------------------------------------|
| `PORT`            | `4000`         | API port                                                   |
| `PAYDAYLY_DATA_DIR`  | `server/data`  | Where the SQLite database and session secret are stored    |
| `JWT_SECRET`      | generated      | Session signing secret. One is generated on first run if unset |
| `SECURE_COOKIES`  | `false`        | Set to `true` when serving over HTTPS                      |
| `NODE_ENV`        | -              | `production` tightens the login rate limit                 |
| `TRUST_PROXY`     | -              | Set only behind a reverse proxy you control                |
| `PUBLIC_URL`      | -              | Base URL used in password reset links                      |
| `LOG_RESET_LINKS` | `false`        | Print reset links to the server log (local use, no mail server) |
| `GROQ_API_KEY`    | -              | Key for the AI money helper                                |
| `GROQ_MODEL`      | `openai/gpt-oss-120b` | Groq model used by the AI money helper                    |
| `AI_DAILY_LIMIT`  | `40`           | AI requests per user per day                               |

Put these in `server/.env` (copy `server/.env.example`). The server loads it on start. `.env` is gitignored; leave it out of any zip you share.

## AI money helper

The AI money helper is available to every signed-in user when the server has a Groq key. Without a key, Paydayly falls back to its built-in rules. With a key it can answer plain-language questions on the "Can I afford this?" screen and turn typed notes like "kal raat dominos 640, aaj rapido 85" into draft entries for you to check. On the dashboard you can also tap the mic (Chrome, Edge or Android Chrome) and speak the same thing in Hindi or English.

1. Get a key from https://console.groq.com and add `GROQ_API_KEY=...` to `server/.env`.
2. Optionally set `GROQ_MODEL` (default `openai/gpt-oss-120b`).
3. Restart the server.

The key stays on the server and is never sent to the browser. The AI never changes your data and never does the arithmetic: every figure comes from Paydayly's own engine, and replies that contain numbers the engine did not produce are dropped. Only the figures needed for the question, and the text you type, are sent to Groq. Without a key, or if a request fails, Paydayly falls back to its built-in answers.

## Project layout

```
shared/       budgeting engine, CSV parsing, categoriser, shared types
server/       Express API, SQLite database and migrations, tests
client/       React app
sample-data/  sample bank statement and setup guide
```

## Open-source libraries

Server: Express, better-sqlite3, bcryptjs, jsonwebtoken, cookie-parser, helmet, express-rate-limit, zod, tsx.

Shared: Papa Parse, Fuse.js.

Client: React, React Router, TanStack Query, Vite, Tailwind CSS, Recharts, Framer Motion, Sonner, Lucide icons, clsx, Inter and Manrope fonts (Fontsource).

Tooling: TypeScript, Vitest, Supertest, concurrently.

## Notes

Paydayly is a budgeting aid, not financial advice.

## Language, live tour and Indian dates

- **English / हिंदी:** the button next to the theme toggle (landing page and app) switches the whole UI. The choice is kept in the browser and saved on your profile. Numbers stay in Indian format (₹1,23,456).
- **Live tour:** "Take the tour" on the landing page, the **?** button in the app, and automatically after onboarding. It moves between real screens, spotlights the real controls, opens the breakdown, types a quick-entry example and runs an affordability check for ₹2,500. Next/Back/Skip, arrow keys and Esc work; on phones the card docks to the screen edge. Nothing the tour does is saved.
- **Dates are day-first everywhere:** date fields show DD/MM/YYYY, and quick entry understands "22/10", "22-10-26", "22 Oct" or "3rd March 2025" in the text.

## Privacy and security

- Passwords are stored as bcrypt hashes; sessions use httpOnly cookies (secure cookies with `SECURE_COOKIES=true` behind HTTPS in production).
- Each account's data is private to that account. Paydayly never sells data and never asks for your bank login: you upload a statement you downloaded yourself.
- AI requests send only the sentence you typed or a few figures Paydayly already worked out, never your statement, name, email or history.
