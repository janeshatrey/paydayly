# Sample data

Paydayly starts empty. Nothing is preloaded. This folder has realistic, fully synthetic bank statements you can use to try the app. Paydayly reads statements from any bank: CSV, XLS (including the HTML-style .xls many banks export) and XLSX. It finds the header row itself, skips bank-info and summary lines, joins wrapped descriptions, and handles separate withdrawal/deposit columns or a single amount with a Dr/Cr column.

## Files

- `hdfc-statement-sep-oct-2026.csv`: an HDFC-style net banking export with 111 transactions from 1 Sep 2026 to 22 Oct 2026. It includes salary credits, rent, an EMI, bills, a SIP, food delivery, groceries, rides, subscriptions (Netflix goes from 499 to 649 in October) two identical Blinkit charges on the same day, an Amazon refund, a credit card bill payment, and a ₹2,400 group dinner on 18 Oct that a friend (Arjun) partly pays back with ₹800 on 20 Oct.
- `sample-bank-statement-sep-oct-2026.xlsx`: the same 111 transactions as an Excel statement in a different layout: a bank-info preamble, real Excel date cells, a single Amount column with a Dr/Cr marker, an opening balance row and a totals/closing balance footer.
- `generate.mjs`: the script that produced the CSV.
- `make-xlsx.mjs`: builds the .xlsx from the CSV (`node make-xlsx.mjs` from the repo after `npm install`).

## Try it

1. Sign up for an account.
2. In the setup wizard, enter:
   - Monthly take-home pay: 85,000, paid on the 1st
   - Commitments:

     | Name    | Type | Amount | Due day |
     |---------|---------|--------|---------|
     | Rent    | Rent    | 22,000 | 1       |
     | Car EMI | EMI     | 6,500  | 5       |
     | Bills   | Bills and subscriptions | 3,500  | 10      |
     | SIP     | SIP     | 8,000  | 7       |
     | Savings | Savings | 5,000  | 8       |

   - Optional goal: Goa trip, 40,000 target, 5,000 a month.
3. On the import step (or later with the Import button), drop in `hdfc-statement-sep-oct-2026.csv` or `sample-bank-statement-sep-oct-2026.xlsx`, check the column mapping and click Import.

If you open the app after 22 Oct 2026, today's numbers will be based on a month with no recent spending. Go to Settings > Preferences and set the review date to 2026-10-22 to see the dashboard as it looked on the last day of the statement. Clear the date to go back to today.

To try money owed back, open the Toit dinner in Activity, mark ₹1,600 as owed by your friends, then link Arjun's ₹800 credit to it. The remaining ₹800 shows on the dashboard as expected, not as money you already have.

To try the balance check, confirm a balance of 77,508.75 (the closing balance on 20 Oct) or map the balance column during import.

Importing the same file again skips every row, because Paydayly fingerprints each transaction.

## Regenerate for another period

```
node generate.mjs 2026-12-15
```

This writes `statement-2026-12-15.csv`, starting on the 1st of the previous month and ending on the date you give. Pass a second argument to choose the file name.
