# Funds and Transactions: what the sheet does on every action

Every table below is the Google Sheet as the script left it, produced by running the real
Apps Script against a stand-in workbook that parses dates the way the committee's workbook
does (United States locale, month first). `row` is the physical row on the sheet.

## 1. What was going wrong

The workbooks were re-created under the committee's own Google account on 13 August 2026.
A new Google Sheet is on the United States locale, and its date column has no format, so
a value typed as `05-08-2026` is read as **8 May 2026**, not 5 August. The old workbook had
kept those cells as plain text, which is why the same script behaved before and not after.

The old script also only *renumbered* rows after a save; it never moved them. So a new row
always sat physically last, whatever number it was given.

### 1a. Old script: add "August Amount" dated 05-08-2026 on the Funds screen

The screen sends `date: "05-08-2026"`. The old script appends it as a bare string.

| row | sno | trnsctn_id | date | month | credit | debit | balance | reason | a_in |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | SSGC2025000001 | 05-10-2025 | October | 9500 |  | 9500 | Final Amount | 1 |
| 3 | 2 | SSGC2025000002 | 05-11-2025 | November | 3500 |  | 13000 | November Amount | 1 |
| 4 | 3 | SSGC2025000003 | 05-12-2025 | December | 3000 |  | 16000 | December Amount | 1 |
| 5 | 4 | SSGC2025000004 | 05-01-2026 | January | 3500 |  | 19500 | January Amount | 1 |
| 6 | 5 | SSGC2025000005 | 11-01-2026 | January |  | 2000 | 17500 | Bhogi Celebrations | 1 |
| 7 | 6 | SSGC2025000006 | 05-02-2026 | February | 3500 |  | 21000 | February Amount | 1 |
| 8 | 7 | SSGC2025000007 | 10-03-2026 | March | 2500 |  | 23500 | March Amount | 1 |
| 9 | 8 | SSGC2025000008 | 10-04-2026 | April | 3000 |  | 26500 | April Amount | 1 |
| 10 | 9 | SSGC2025000009 | 05-05-2026 | May | 3000 |  | 29500 | May Amount | 1 |
| 11 | 11 | SSGC2025000010 | 06-06-2026 | June | 1500 |  | 33500 | June Amount | 1 |
| 12 | 12 | SSGC2025000011 | 07-07-2026 | July | 1500 |  | 35000 | July Amount | 1 |
| 13 | 10 | SSGC2025000012 | 5/8/2026 ⚠ (a real date: 8 May) | August | 2500 |  | 32000 | August Amount | 1 |

Three faults in one save:

- **Wrong date.** Row 13 holds a real date of 8 May 2026, which the sheet displays as `5/8/2026`, while its own month column says August.
- **Wrong order.** Because the sheet thinks it is 8 May, it was numbered `sno 10`, between the May and June rows, and every row after it was renumbered and its balance restated. Physically it is still the last row.
- **A "failed" save that had landed.** The screen reads the ledger back and looks for the entry it wrote by date. The script returns the mangled date:

  - sent: `05-08-2026` · read back: `08-05-2026`
  - the old "did it land?" check answers: **no**

  Whenever Apps Script answered that save with its occasional HTML page instead of JSON, the screen ran that check, could not find the row, said "Could not save the entry", and the next press of Save added it again. That is the extra row at the bottom.

### 1b. Old script: the same entry saved a second time

| row | sno | trnsctn_id | date | month | credit | debit | balance | reason | a_in |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | SSGC2025000001 | 05-10-2025 | October | 9500 |  | 9500 | Final Amount | 1 |
| 3 | 2 | SSGC2025000002 | 05-11-2025 | November | 3500 |  | 13000 | November Amount | 1 |
| 4 | 3 | SSGC2025000003 | 05-12-2025 | December | 3000 |  | 16000 | December Amount | 1 |
| 5 | 4 | SSGC2025000004 | 05-01-2026 | January | 3500 |  | 19500 | January Amount | 1 |
| 6 | 5 | SSGC2025000005 | 11-01-2026 | January |  | 2000 | 17500 | Bhogi Celebrations | 1 |
| 7 | 6 | SSGC2025000006 | 05-02-2026 | February | 3500 |  | 21000 | February Amount | 1 |
| 8 | 7 | SSGC2025000007 | 10-03-2026 | March | 2500 |  | 23500 | March Amount | 1 |
| 9 | 8 | SSGC2025000008 | 10-04-2026 | April | 3000 |  | 26500 | April Amount | 1 |
| 10 | 9 | SSGC2025000009 | 05-05-2026 | May | 3000 |  | 29500 | May Amount | 1 |
| 11 | 12 | SSGC2025000010 | 06-06-2026 | June | 1500 |  | 36000 | June Amount | 1 |
| 12 | 13 | SSGC2025000011 | 07-07-2026 | July | 1500 |  | 37500 | July Amount | 1 |
| 13 | 11 | SSGC2025000012 | 5/8/2026 ⚠ (a real date: 8 May) | August | 2500 |  | 34500 | August Amount | 1 |
| 14 | 10 | SSGC2025000013 | 5/8/2026 ⚠ (a real date: 8 May) | August | 2500 |  | 32000 | August Amount | 1 |

Two rows for one collection, both on the wrong day, both numbered into May, and the balance carrying 2,500 twice.

### 1c. Old script: set the opening amount in Transactions, and the fund shows minus figures

Setting a 20,000 opening on 01-09-2026 also writes the transfer out of the fund. The workbook reads that date as **9 January 2026**, so the debit lands ahead of the money that paid for it:

| sno | date | credit | debit | balance | reason |
|---|---|---|---|---|---|
| 1 | 05-10-2025 | 9500 |  | 9500 | Final Amount |
| 2 | 05-11-2025 | 3500 |  | 13000 | November Amount |
| 3 | 05-12-2025 | 3000 |  | 16000 | December Amount |
| 4 | 05-01-2026 | 3500 |  | 19500 | January Amount |
| 5 | 09-01-2026 |  | 20000 | **-500** | Transferred to transactions (TXN2025000001) |
| 6 | 11-01-2026 |  | 2000 | **-2500** | Bhogi Celebrations |
| 7 | 05-02-2026 | 3500 |  | 1000 | February Amount |
| 8 | 10-03-2026 | 2500 |  | 3500 | March Amount |
| 9 | 10-04-2026 | 3000 |  | 6500 | April Amount |
| 10 | 05-05-2026 | 3000 |  | 9500 | May Amount |
| 11 | 06-06-2026 | 1500 |  | 11000 | June Amount |
| 12 | 07-07-2026 | 1500 |  | 12500 | July Amount |

That is where the "-" amounts came from: a debit sorted into the wrong month makes every balance after it, until the collections catch up, read as money the fund never had. Any spend dated on a day of 12 or under did the same on a smaller scale. With dates stored as text it cannot happen; and the Funds screen now says so if a balance ever dips below zero, naming the entry to check.

## 2. The fixed script, Funds screen

Every save now formats the date cell as plain text before writing, then physically sorts the
sheet into date order, renumbers `sno` 1..N down the page, rewrites the running balance,
rewrites `year` and `month` from the date, fills in the fund year, and colours the money
columns. Retired rows move below the live ones and lose their line number.

### 2a. Add: "August Amount" dated 05-08-2026

| row | sno | trnsctn_id | date | month | credit | debit | balance | reason | a_in |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | SSGC2025000001 | 05-10-2025 | October | 9500 |  | 9500 | Final Amount | 1 |
| 3 | 2 | SSGC2025000002 | 05-11-2025 | November | 3500 |  | 13000 | November Amount | 1 |
| 4 | 3 | SSGC2025000003 | 05-12-2025 | December | 3000 |  | 16000 | December Amount | 1 |
| 5 | 4 | SSGC2025000004 | 05-01-2026 | January | 3500 |  | 19500 | January Amount | 1 |
| 6 | 5 | SSGC2025000005 | 11-01-2026 | January |  | 2000 | 17500 | Bhogi Celebrations | 1 |
| 7 | 6 | SSGC2025000006 | 05-02-2026 | February | 3500 |  | 21000 | February Amount | 1 |
| 8 | 7 | SSGC2025000007 | 10-03-2026 | March | 2500 |  | 23500 | March Amount | 1 |
| 9 | 8 | SSGC2025000008 | 10-04-2026 | April | 3000 |  | 26500 | April Amount | 1 |
| 10 | 9 | SSGC2025000009 | 05-05-2026 | May | 3000 |  | 29500 | May Amount | 1 |
| 11 | 10 | SSGC2025000010 | 06-06-2026 | June | 1500 |  | 31000 | June Amount | 1 |
| 12 | 11 | SSGC2025000011 | 07-07-2026 | July | 1500 |  | 32500 | July Amount | 1 |
| 13 | 12 | SSGC2025000012 | 05-08-2026 | August | 2500 |  | 35000 | August Amount | 1 |

Stored as the text `05-08-2026`, numbered 12, last on the page because it is the latest date. The "did it land?" check now answers **yes**, so a lost reply is recognised as a landed save and never added twice.

### 2b. Add: an entry for an earlier date — "Ugadi Celebrations" on 30-03-2026, 1,500 out

| row | sno | trnsctn_id | date | month | credit | debit | balance | reason | a_in |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | SSGC2025000001 | 05-10-2025 | October | 9500 |  | 9500 | Final Amount | 1 |
| 3 | 2 | SSGC2025000002 | 05-11-2025 | November | 3500 |  | 13000 | November Amount | 1 |
| 4 | 3 | SSGC2025000003 | 05-12-2025 | December | 3000 |  | 16000 | December Amount | 1 |
| 5 | 4 | SSGC2025000004 | 05-01-2026 | January | 3500 |  | 19500 | January Amount | 1 |
| 6 | 5 | SSGC2025000005 | 11-01-2026 | January |  | 2000 | 17500 | Bhogi Celebrations | 1 |
| 7 | 6 | SSGC2025000006 | 05-02-2026 | February | 3500 |  | 21000 | February Amount | 1 |
| 8 | 7 | SSGC2025000007 | 10-03-2026 | March | 2500 |  | 23500 | March Amount | 1 |
| 9 | 8 | SSGC2025000013 | 30-03-2026 | March |  | 1500 | 22000 | Ugadi Celebrations | 1 |
| 10 | 9 | SSGC2025000008 | 10-04-2026 | April | 3000 |  | 25000 | April Amount | 1 |
| 11 | 10 | SSGC2025000009 | 05-05-2026 | May | 3000 |  | 28000 | May Amount | 1 |
| 12 | 11 | SSGC2025000010 | 06-06-2026 | June | 1500 |  | 29500 | June Amount | 1 |
| 13 | 12 | SSGC2025000011 | 07-07-2026 | July | 1500 |  | 31000 | July Amount | 1 |
| 14 | 13 | SSGC2025000012 | 05-08-2026 | August | 2500 |  | 33500 | August Amount | 1 |

The new row is physically row 9, between March and April. April onwards moved down one line, took the next number, and had its balance restated (April is now 25,000, not 26,500). The id `SSGC2025000013` is the newest even though the row sits in the middle — ids never move, line numbers do.

### 2c. Update: correct the April collection from 3,000 to 3,500

| row | sno | trnsctn_id | date | month | credit | debit | balance | reason | a_in |
|---|---|---|---|---|---|---|---|---|---|
| 9 | 8 | SSGC2025000013 | 30-03-2026 | March |  | 1500 | 22000 | Ugadi Celebrations | 1 |
| 10 | 9 | SSGC2025000008 | 10-04-2026 | April | 3500 |  | 25500 | April Amount | 1 |
| 11 | 10 | SSGC2025000009 | 05-05-2026 | May | 3000 |  | 28500 | May Amount | 1 |
| 12 | 11 | SSGC2025000010 | 06-06-2026 | June | 1500 |  | 30000 | June Amount | 1 |
| 13 | 12 | SSGC2025000011 | 07-07-2026 | July | 1500 |  | 31500 | July Amount | 1 |
| 14 | 13 | SSGC2025000012 | 05-08-2026 | August | 2500 |  | 34000 | August Amount | 1 |

Same row, same id, same place. Only the amount changed, and every balance below it moved up by 500.

### 2d. Update: change a date — Ugadi was actually on 19-03-2026, before the March collection was taken

| row | sno | trnsctn_id | date | month | credit | debit | balance | reason | a_in |
|---|---|---|---|---|---|---|---|---|---|
| 7 | 6 | SSGC2025000006 | 05-02-2026 | February | 3500 |  | 21000 | February Amount | 1 |
| 8 | 7 | SSGC2025000007 | 10-03-2026 | March | 2500 |  | 23500 | March Amount | 1 |
| 9 | 8 | SSGC2025000013 | 19-03-2026 | March |  | 1500 | 22000 | Ugadi Celebrations | 1 |
| 10 | 9 | SSGC2025000008 | 10-04-2026 | April | 3500 |  | 25500 | April Amount | 1 |

The row moved above "March Amount" and the two swapped line numbers. Nothing was added or removed.

### 2e. Delete: remove the Ugadi entry

| row | sno | trnsctn_id | date | month | credit | debit | balance | reason | a_in |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | SSGC2025000001 | 05-10-2025 | October | 9500 |  | 9500 | Final Amount | 1 |
| 3 | 2 | SSGC2025000002 | 05-11-2025 | November | 3500 |  | 13000 | November Amount | 1 |
| 4 | 3 | SSGC2025000003 | 05-12-2025 | December | 3000 |  | 16000 | December Amount | 1 |
| 5 | 4 | SSGC2025000004 | 05-01-2026 | January | 3500 |  | 19500 | January Amount | 1 |
| 6 | 5 | SSGC2025000005 | 11-01-2026 | January |  | 2000 | 17500 | Bhogi Celebrations | 1 |
| 7 | 6 | SSGC2025000006 | 05-02-2026 | February | 3500 |  | 21000 | February Amount | 1 |
| 8 | 7 | SSGC2025000007 | 10-03-2026 | March | 2500 |  | 23500 | March Amount | 1 |
| 9 | 8 | SSGC2025000008 | 10-04-2026 | April | 3500 |  | 27000 | April Amount | 1 |
| 10 | 9 | SSGC2025000009 | 05-05-2026 | May | 3000 |  | 30000 | May Amount | 1 |
| 11 | 10 | SSGC2025000010 | 06-06-2026 | June | 1500 |  | 31500 | June Amount | 1 |
| 12 | 11 | SSGC2025000011 | 07-07-2026 | July | 1500 |  | 33000 | July Amount | 1 |
| 13 | 12 | SSGC2025000012 | 05-08-2026 | August | 2500 |  | 35500 | August Amount | 1 |
| 14 |  | SSGC2025000013 | 19-03-2026 | March |  | 1500 | 22000 | Ugadi Celebrations | 0 |

Deletes are soft: the row is kept with `a_in = 0`, moved below the live ledger, with no line number and no colour, so a mistaken delete is one cell (`a_in` back to 1, then any save) from being undone. The live rows closed up and the balances were restated.

## 3. The fixed script, Transactions screen

The transactions book follows the same rules. Its extra rule: one opening a year, and
saving the opening writes the matching debit into the funds sheet in the same call.

### 3a. Add: set the opening amount — 20,000 moved across on 01-09-2026

Transactions sheet:

| row | sno | trnsctn_id | date | kind | credit | debit | balance | reason | paid_to | a_in | trnsfr_nm |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | TXN2025000001 | 01-09-2026 | opening | 20000 |  | 20000 | Opening amount from annual funds |  | 1 | Naresh |

Funds sheet, last two rows — the transfer out is written there in the same call, naming the transaction id so the pair can always be found:

| row | sno | trnsctn_id | date | month | credit | debit | balance | reason | a_in |
|---|---|---|---|---|---|---|---|---|---|
| 13 | 12 | SSGC2025000012 | 05-08-2026 | August | 2500 |  | 35000 | August Amount | 1 |
| 14 | 13 | SSGC2025000013 | 01-09-2026 | September |  | 20000 | 15000 | Transferred to transactions (TXN2025000001) | 1 |

### 3b. Add: two spends, entered out of date order (10 Sep first, then 3 Sep) — by the transactions admin

| row | sno | trnsctn_id | date | kind | credit | debit | balance | reason | paid_to | a_in | trnsfr_nm |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | TXN2025000001 | 01-09-2026 | opening | 20000 |  | 20000 | Opening amount from annual funds |  | 1 | Naresh |
| 3 | 2 | TXN2025000003 | 03-09-2026 | spend |  | 8000 | 12000 | Pandal advance | Sri Ramesh Decorators | 1 | Rajesh |
| 4 | 3 | TXN2025000002 | 10-09-2026 | spend |  | 4500 | 7500 | Flowers and garlands | Lakshmi Flower Mart | 1 | Rajesh |

The 3 September spend was typed second but sits second, and `trnsfr_nm` records whose hand it was, from the signed session rather than anything typed.

### 3c. Add: money in mid-festival — a 5,000 donation on 05-09-2026

| row | sno | trnsctn_id | date | kind | credit | debit | balance | reason | paid_to | a_in | trnsfr_nm |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | TXN2025000001 | 01-09-2026 | opening | 20000 |  | 20000 | Opening amount from annual funds |  | 1 | Naresh |
| 3 | 2 | TXN2025000003 | 03-09-2026 | spend |  | 8000 | 12000 | Pandal advance | Sri Ramesh Decorators | 1 | Rajesh |
| 4 | 3 | TXN2025000004 | 05-09-2026 | credit | 5000 |  | 17000 | Donation | Sri Venkat Rao | 1 | Rajesh |
| 5 | 4 | TXN2025000002 | 10-09-2026 | spend |  | 4500 | 12500 | Flowers and garlands | Lakshmi Flower Mart | 1 | Rajesh |

### 3d. Update: the flowers bill was 4,000, not 4,500

| row | sno | trnsctn_id | date | kind | credit | debit | balance | reason | paid_to | a_in | trnsfr_nm |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | TXN2025000001 | 01-09-2026 | opening | 20000 |  | 20000 | Opening amount from annual funds |  | 1 | Naresh |
| 3 | 2 | TXN2025000003 | 03-09-2026 | spend |  | 8000 | 12000 | Pandal advance | Sri Ramesh Decorators | 1 | Rajesh |
| 4 | 3 | TXN2025000004 | 05-09-2026 | credit | 5000 |  | 17000 | Donation | Sri Venkat Rao | 1 | Rajesh |
| 5 | 4 | TXN2025000002 | 10-09-2026 | spend |  | 4000 | 13000 | Flowers and garlands | Lakshmi Flower Mart | 1 | Rajesh |

### 3e. Delete: try to remove the opening while spends stand on it

Refused with code `OPENING_IN_USE`: "This year has 3 transactions standing on that opening amount. Remove them first, or edit the amount instead."

Nothing changed in either book.

### 3f. Delete: remove the pandal advance

| row | sno | trnsctn_id | date | kind | credit | debit | balance | reason | paid_to | a_in | trnsfr_nm |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | TXN2025000001 | 01-09-2026 | opening | 20000 |  | 20000 | Opening amount from annual funds |  | 1 | Naresh |
| 3 | 2 | TXN2025000004 | 05-09-2026 | credit | 5000 |  | 25000 | Donation | Sri Venkat Rao | 1 | Rajesh |
| 4 | 3 | TXN2025000002 | 10-09-2026 | spend |  | 4000 | 21000 | Flowers and garlands | Lakshmi Flower Mart | 1 | Rajesh |
| 5 |  | TXN2025000003 | 03-09-2026 | spend |  | 8000 | 12000 | Pandal advance | Sri Ramesh Decorators | 0 | Rajesh |

Kept as a retired row below the live ones, unnumbered, with the deleter's name beside it. The live balances were restated.

### 3g. Delete the rest, then the opening — the transfer leaves the funds sheet with it

Transactions sheet:

| row | sno | trnsctn_id | date | kind | credit | debit | balance | reason | paid_to | a_in | trnsfr_nm |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 |  | TXN2025000001 | 01-09-2026 | opening | 20000 |  | 20000 | Opening amount from annual funds |  | 0 | Rajesh |
| 3 |  | TXN2025000003 | 03-09-2026 | spend |  | 8000 | 12000 | Pandal advance | Sri Ramesh Decorators | 0 | Rajesh |
| 4 |  | TXN2025000004 | 05-09-2026 | credit | 5000 |  | 25000 | Donation | Sri Venkat Rao | 0 | Rajesh |
| 5 |  | TXN2025000002 | 10-09-2026 | spend |  | 4000 | 16000 | Flowers and garlands | Lakshmi Flower Mart | 0 | Rajesh |

Funds sheet, last two rows — the "Transferred to transactions" debit is retired too, so the fund is not short by 20,000 for money that went nowhere:

| row | sno | trnsctn_id | date | month | credit | debit | balance | reason | a_in |
|---|---|---|---|---|---|---|---|---|---|
| 13 | 12 | SSGC2025000012 | 05-08-2026 | August | 2500 |  | 35000 | August Amount | 1 |
| 14 |  | SSGC2025000013 | 01-09-2026 | September |  | 20000 | 15000 | Transferred to transactions (TXN2025000001) | 0 |

## 4. Repairing the sheets that are already wrong

Run once from the Apps Script editor: **Run ▸ repairFundsSheet**, then **Run ▸ repairTransactionsSheet**.
Each does exactly what a save now does, over whatever is in the sheet. Here is a funds sheet as the
old script and the workbook left it: pasted history parsed month-first, a mangled August row at the
bottom, and its duplicate.

### 4a. Before

| row | sno | trnsctn_id | date | month | credit | debit | balance | reason | a_in |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | SSGC2025000001 | 5/10/2025 ⚠ (a real date: 10 May) | October | 9500 |  | 9500 | Final Amount | 1 |
| 3 | 2 | SSGC2025000002 | 5/11/2025 ⚠ (a real date: 11 May) | November | 3500 |  | 13000 | November Amount | 1 |
| 4 | 3 | SSGC2025000003 | 5/12/2025 ⚠ (a real date: 12 May) | December | 3000 |  | 16000 | December Amount | 1 |
| 5 | 4 | SSGC2025000004 | 5/1/2026 ⚠ (a real date: 1 May) | January | 3500 |  | 19500 | January Amount | 1 |
| 6 | 5 | SSGC2025000005 | 11/1/2026 ⚠ (a real date: 1 Nov) | January |  | 2000 | 17500 | Bhogi Celebrations | 1 |
| 7 | 6 | SSGC2025000006 | 5/2/2026 ⚠ (a real date: 2 May) | February | 3500 |  | 21000 | February Amount | 1 |
| 8 | 7 | SSGC2025000007 | 10/3/2026 ⚠ (a real date: 3 Oct) | March | 2500 |  | 23500 | March Amount | 1 |
| 9 | 8 | SSGC2025000008 | 10/4/2026 ⚠ (a real date: 4 Oct) | April | 3000 |  | 26500 | April Amount | 1 |
| 10 | 9 | SSGC2025000009 | 5/5/2026 ⚠ (a real date: 5 May) | May | 3000 |  | 29500 | May Amount | 1 |
| 11 | 10 | SSGC2025000010 | 6/6/2026 ⚠ (a real date: 6 Jun) | June | 1500 |  | 31000 | June Amount | 1 |
| 12 | 11 | SSGC2025000011 | 7/7/2026 ⚠ (a real date: 7 Jul) | July | 1500 |  | 32500 | July Amount | 1 |
| 13 | 10 | SSGC2025000012 | 5/8/2026 ⚠ (a real date: 8 May) | August | 2500 |  | 32000 | August Amount | 1 |
| 14 | 11 | SSGC2025000013 | 5/8/2026 ⚠ (a real date: 8 May) | August | 2500 |  | 34500 | August Amount | 1 |

### 4b. After `repairFundsSheet()`

Logged: `funds: 13 rows (13 live) now in date order; 13 date cells rewritten as dd-MM-yyyy text.`

| row | sno | trnsctn_id | date | month | credit | debit | balance | reason | a_in |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | SSGC2025000001 | 05-10-2025 | October | 9500 |  | 9500 | Final Amount | 1 |
| 3 | 2 | SSGC2025000002 | 05-11-2025 | November | 3500 |  | 13000 | November Amount | 1 |
| 4 | 3 | SSGC2025000003 | 05-12-2025 | December | 3000 |  | 16000 | December Amount | 1 |
| 5 | 4 | SSGC2025000004 | 05-01-2026 | January | 3500 |  | 19500 | January Amount | 1 |
| 6 | 5 | SSGC2025000005 | 11-01-2026 | January |  | 2000 | 17500 | Bhogi Celebrations | 1 |
| 7 | 6 | SSGC2025000006 | 05-02-2026 | February | 3500 |  | 21000 | February Amount | 1 |
| 8 | 7 | SSGC2025000007 | 10-03-2026 | March | 2500 |  | 23500 | March Amount | 1 |
| 9 | 8 | SSGC2025000008 | 10-04-2026 | April | 3000 |  | 26500 | April Amount | 1 |
| 10 | 9 | SSGC2025000009 | 05-05-2026 | May | 3000 |  | 29500 | May Amount | 1 |
| 11 | 10 | SSGC2025000010 | 06-06-2026 | June | 1500 |  | 31000 | June Amount | 1 |
| 12 | 11 | SSGC2025000011 | 07-07-2026 | July | 1500 |  | 32500 | July Amount | 1 |
| 13 | 12 | SSGC2025000012 | 05-08-2026 | August | 2500 |  | 35000 | August Amount | 1 |
| 14 | 13 | SSGC2025000013 | 05-08-2026 | August | 2500 |  | 37500 | August Amount | 1 |

Every date is back to the day the month column says it was, as text; the rows are in order; `sno` and the balance run cleanly. The duplicate August row is still there — the script cannot know which of two identical entries the committee meant — so delete one of them on the Funds screen; it will retire to the bottom and the balance will correct itself.

### 4c. After deleting the duplicate on the screen

| row | sno | trnsctn_id | date | month | credit | debit | balance | reason | a_in |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | SSGC2025000001 | 05-10-2025 | October | 9500 |  | 9500 | Final Amount | 1 |
| 3 | 2 | SSGC2025000002 | 05-11-2025 | November | 3500 |  | 13000 | November Amount | 1 |
| 4 | 3 | SSGC2025000003 | 05-12-2025 | December | 3000 |  | 16000 | December Amount | 1 |
| 5 | 4 | SSGC2025000004 | 05-01-2026 | January | 3500 |  | 19500 | January Amount | 1 |
| 6 | 5 | SSGC2025000005 | 11-01-2026 | January |  | 2000 | 17500 | Bhogi Celebrations | 1 |
| 7 | 6 | SSGC2025000006 | 05-02-2026 | February | 3500 |  | 21000 | February Amount | 1 |
| 8 | 7 | SSGC2025000007 | 10-03-2026 | March | 2500 |  | 23500 | March Amount | 1 |
| 9 | 8 | SSGC2025000008 | 10-04-2026 | April | 3000 |  | 26500 | April Amount | 1 |
| 10 | 9 | SSGC2025000009 | 05-05-2026 | May | 3000 |  | 29500 | May Amount | 1 |
| 11 | 10 | SSGC2025000010 | 06-06-2026 | June | 1500 |  | 31000 | June Amount | 1 |
| 12 | 11 | SSGC2025000011 | 07-07-2026 | July | 1500 |  | 32500 | July Amount | 1 |
| 13 | 12 | SSGC2025000012 | 05-08-2026 | August | 2500 |  | 35000 | August Amount | 1 |
| 14 |  | SSGC2025000013 | 05-08-2026 | August | 2500 |  | 37500 | August Amount | 0 |

