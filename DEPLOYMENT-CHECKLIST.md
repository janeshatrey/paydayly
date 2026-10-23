# Deploying the review fixes

The changes are local until deployed. Do not treat local tests as proof of live email delivery or backup health.

## Before deploying

1. Export a backup of each important account and verify that the existing B2 replica is accessible. Keep these copies private. Do not upload a bank statement into a test service.
2. Set `RESEND_API_KEY`, `MAIL_FROM` (a verified sender), and `PUBLIC_URL=https://paydayly.onrender.com` in Render. These are server-only secrets/settings; do not put the key in a `VITE_` variable. The sender uses the [Resend HTTPS email API](https://resend.com/docs/api-reference/emails/send-email). No email provider account was created by this code change.
3. Ensure all five backup variables exist: `B2_BUCKET`, `B2_ENDPOINT`, `B2_REGION`, `LITESTREAM_ACCESS_KEY_ID`, and `LITESTREAM_SECRET_ACCESS_KEY`. The Render start script now refuses to start if any are missing. Never remove this guard to make a deployment appear healthy.
4. Run `npm test`, `npm run typecheck`, and `npm run build`.

## Data changes

- Cards and loans no longer count as spendable cash. Card debt uses positive values; a genuine overpayment uses a negative value.
- Existing card confirmations are normalized to the new sign convention. All old confirmations remain stored, but are excluded from calculations because they lacked reliable closing-balance semantics. Users must confirm a closing balance again.
- The balance dialog asks for the previous day's closing balance. The API also accepts an explicitly dated closing balance before the app's current reporting date. It rejects current-day/future confirmations. Transactions on the closing date are already included; subsequent dates are applied automatically.
- Same-date confirmations now use the latest inserted correction, including timestamp ties.
- New repayment allocations make deleting credits and undoing imports reversible. Old links are reconstructed conservatively from their credit amount and saved settlement total. Legacy records do not contain enough information to reconstruct every historical partial allocation exactly; inspect old partial settlements, manual settlements and previously inflated debts. No invented repayment is added to the ledger.
- Backups include repayment allocations and preserve them on restore. Old backups without allocations reconstruct linked allocations conservatively. Old balance confirmations require reconfirmation.
- Import duplicate checks use the actual account and occurrence count, and recognize old rows without rewriting their fingerprints. Previously skipped legitimate rows cannot be recovered without reimporting their source statement into the correct account.
- Partial bills stay reserved. An explicit “paid” mark can still close a lower final bill. Yearly/quarterly bills reserve their full unpaid amount in their due cycle; between due cycles they reserve a monthly share. This is conservative and does not constitute a separate persistent sinking-fund account.
- Completed goals stop reserving new monthly contributions; money already allocated remains protected.

## Live verification after deployment

- Use a disposable test account, not someone's financial data.
- Request a password reset and confirm it reaches the inbox, expires after 30 minutes and is single-use. Without mail settings the app reports recovery unavailable. Provider failures log a generic operational message and do not expose whether an email has an account. The UI says a reset was requested, not that delivery is guaranteed.
- Verify the migration ran once, then confirm yesterday's closing bank/card balances and record today's synthetic payments.
- Verify B2 replication, restart recovery and an isolated restore. Restore into a separate directory and verify SQLite integrity plus expected records before trusting the recovery procedure. Never restore over the running database as a test.
- Check the public `/tour` page signed out. It uses synthetic, fixed-date examples and makes no writes.
- Check English/Hindi display and mobile widths. The authenticated dashboard still requires sign-in.

## Hosting limitation

Render's free service uses an ephemeral filesystem and can spin down. See [Render's free-service documentation](https://render.com/docs/free). Litestream reduces the risk but does not guarantee zero data loss if the process stops before recent writes replicate. A production service should use durable primary storage and monitored backups. This revision does not change your hosting plan, create paid services, or configure live credentials.

## Statement coverage

Automated parser fixtures cover preamble CSVs, signed-amount XLSX, ICICI-style XLS and HTML disguised as XLS, plus common date/amount variants. These are format tests, not certification of every bank's current export. Preview the account, dates, amounts, rejected rows and any available running-balance check before importing. Password-protected PDFs and arbitrary bank layouts are not promised.
