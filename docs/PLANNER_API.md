# Salary Planner API

All endpoints are under `/api/planner`, need `Authorization: Bearer <token>`, and only ever read or
change the signed-in user's records. A record that belongs to someone else returns **404**, the
same as one that doesn't exist.

## Conventions

- **Amounts.** Send numbers or strings with at most 2 decimals, from 0 up to 999,999,999,999.99.
  Responses return rupees as JSON numbers, for example `15000.5`. The server stores them as
  `DECIMAL(14,2)` and calculates in whole paise.
- **Months.** `year` is 2000–2100 and `month` is 1–12. A month is its calendar month in UTC,
  which is how transaction dates are stored.
- **Errors.** Errors return `{ success: false, message, code? }`:
  - 400: validation failed (the first error is in `message`, the full list in `errors`).
  - 404: not found, or not yours.
  - 409: conflict. `code` is `ALREADY_RECEIVED`, `TRANSACTION_ALREADY_LINKED` or
    `DUPLICATE_ALLOCATION`.
- **Planned vs actual.** Planned amounts are never counted as payments. Actual figures come only
  from recorded transactions, EMI payments and savings contributions.

## Month overview

`GET /overview?year=&month=`

Returns `{ year, month, plan, salaries, summary }`. It is read-only: it never creates a plan or a
salary record. `plan` is `null` if the month hasn't been set up.

`summary` contains:

| Field | Meaning |
|---|---|
| `income.expected` / `received` / `pending` | Totals of this month's salary records. A record counts as received only once it is marked received. |
| `income.expectedSalary` / `expectedAdditional` | Fixed salary vs every other income type. |
| `plan.byGroup.{FIXED,VARIABLE,SAVINGS,INVESTMENT}` | Planned total for each group. |
| `plan.plannedExpenses` | FIXED + VARIABLE. |
| `plan.plannedSavings` / `plannedInvestments` / `totalAllocated` | |
| `unallocated` | Expected income minus everything planned. Negative means over-allocated (see `overAllocated`). |
| `allocatedPercent` | Share of expected income that is planned. `null` when no income is expected. |
| `actual.income` | Income transactions this month, excluding the Investment category. |
| `actual.expenses` | Expense transactions plus EMI payments this month. Investment-category and investment-linked transactions are excluded. |
| `actual.emi` | EMI payments this month. Already included in `actual.expenses`. |
| `actual.savingsNet` | Savings contributions minus withdrawals. These only set money aside: no transaction is created. |
| `actual.investmentNet` | Investment buys minus redemptions, from Investment-category transactions. |
| `actual.available` | `income − expenses − savingsNet − investmentNet`. |
| `unplanned[]` | Spending this month that no allocation tracks, by category. |

Transfers are never counted as income or spending.

Each allocation in `plan.allocations[]` also has:

- `actualAmount`, `remainingAmount` and `utilization` (%) for FIXED and VARIABLE lines.
- `null` for those three on SAVINGS and INVESTMENT lines. Those are tracked through goals and
  investment plans in Phase 5.

Each spending item counts toward **exactly one** FIXED or VARIABLE line. The first rule that
applies wins:

1. **ASSIGNED.** The user pinned the transaction to a line in this month's plan. A pin to a
   deleted line, or to another month's plan (because the transaction's date was edited), is
   ignored.
2. **NAME.** The transaction's title contains a distinctive word from a line's name. For
   example, "Mess" matches "Mess / Food" and "House rent" matches "Rent / Accommodation".
   Generic words such as *other*, *bills*, *personal*, *fund* and *misc* don't count. The line
   with the most matching words wins, then the lower `sortOrder`.
3. **CATEGORY.** The first line (by `sortOrder`) whose `matchCategories` include the item's
   category. EMI payments use the pseudo-category `EMI`.
4. **UNPLANNED.**

Matching is calculated every time the month is read, so adding, editing or deleting a
transaction in History shows up straight away. The planner never creates or edits transactions.

Each allocation also has `transactionCount`. `GET /overview` (and every budget write) also
returns `spending[]`:

```
{ id, source: "TRANSACTION" | "EMI", title, category, amount, date, paymentMethod,
  allocationId | null, matchedBy: "ASSIGNED" | "NAME" | "CATEGORY" | "UNPLANNED", reassignable }
```

EMI payments have the id `emi:<paymentId>` and `reassignable: false`. They come from the EMI
tracker, so there is no transaction to pin.

## Income sources

An income source is income the user expects every month.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/income-sources` | | Active sources first. |
| POST | `/income-sources` | `name`, `expectedAmount`, `kind?`, `payDay?` | `kind` is one of `SALARY`, `ALLOWANCE`, `BONUS`, `INCENTIVE`, `OTHER`. `payDay` is 1–31; days past the end of a month are clamped to its last day. |
| PUT | `/income-sources/:id` | any of the above | Also updates the **pending** records for this month and later months. Past or received records are not changed. |
| PATCH | `/income-sources/:id/active` | `active` (boolean) | Pausing removes pending records for this month and later months. Resuming lets the next set-up add them back. |
| DELETE | `/income-sources/:id` | | Removes pending records for this month and later months. Received and past records stay, with `incomeSourceId: null`; their label and kind are kept. |

## Monthly salary records

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/salaries?year=&month=` | | `{ salaries, income }` |
| GET | `/salaries/history?months=&year=&month=` | | Totals and records for each month, newest first. Covers up to 36 months, ending at the given month (default: the current month). |
| POST | `/salaries/initialize` | `year`, `month` | Adds a pending record for each active source created by the end of that month. Safe to repeat or run concurrently. |
| POST | `/salaries` | `year`, `month`, `label`, `expectedAmount`, `kind?` | One-off income for one month. |
| PUT | `/salaries/:id` | `expectedAmount?`, `label?` | Changes this month only. |
| GET | `/salaries/:id/candidates` | | Income transactions from 7 days before the month to its end that aren't linked to any record, so the user can link one instead of recording the income twice. `matchesExpected` flags exact amount matches. |
| POST | `/salaries/:id/receive` | `{ mode: "create", receivedAmount, receivedAt, paymentMethod?, note? }` or `{ mode: "link", expenseId }` | See below. |
| POST | `/salaries/:id/undo` | `deleteTransaction?` (boolean) | Sets the record back to pending. The linked transaction is kept unless `deleteTransaction` is true. |
| DELETE | `/salaries/:id` | | Pending records only. A received record returns 409 until it is undone. |

How `receive` works:

- `mode: "create"` adds one income transaction. Its category is Salary, or Other for the
  `OTHER` kind. Its account comes from `paymentMethod`, the same way the Add Transaction form
  sets it.
- `mode: "link"` uses an existing income transaction that belongs to the user. It can't be an
  investment, and it can't already be linked to another record.
- Either way, it all runs in one database transaction that only succeeds while the record is
  still pending. A double tap or a second device gets 409, and nothing extra is created.

## Monthly budgets

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/budgets?year=&month=` | | `{ plan, summary }`. Read-only. |
| POST | `/budgets` | `year`, `month` | Sets up the month and is idempotent. It creates the plan if missing (201, else 200) and copies **only** the lines marked `recurring` from the latest earlier plan, and only when the plan is new. It also adds pending salary records. It never copies transactions. |
| PUT | `/budgets/:id` | `note?`, `allocations?: [{ id, ...fields }]` | Bulk edit. Either all of it is saved or none of it is. |
| POST | `/budgets/:id/copy-recurring` | | Adds recurring lines from the latest earlier plan that this month doesn't have, matched by name. Lines already in this month aren't changed. Returns `copied`. |
| POST | `/budgets/:id/allocations` | `group`, `name`, `plannedAmount`, `matchCategories?`, `recurring?` (default true), `sortOrder?` | `name` must be unique within the month (409). |
| PUT | `/budgets/allocations/:allocationId` | any allocation field | Changes this month only. |
| DELETE | `/budgets/allocations/:allocationId` | | Changes this month only. |

Allocation fields:

- `group` is one of `FIXED`, `VARIABLE`, `SAVINGS`, `INVESTMENT`.
- `matchCategories` is up to 20 transaction categories. `"EMI"` matches EMI payments.
- `recurring` is the "repeat next month" flag.

## Spending and manual reassignment

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/budgets/spending?year=&month=` | | `{ planId, spending[] }`. Works for a month with no plan, where everything is unplanned. |
| PUT | `/transactions/:expenseId/assignment` | `allocationId` | Pins the transaction to a line, replacing any earlier pin. Returns the whole month. |
| DELETE | `/transactions/:expenseId/assignment` | | Removes the pin, so the transaction goes back to automatic matching. Returns the whole month. |

A pin is rejected with:

- **404** if the transaction or the line isn't the user's.
- **400** if the transaction isn't spending (income, a transfer or an investment).
- **400** if the line is a SAVINGS or INVESTMENT line.
- **400** if the line belongs to a different month from the transaction.

Pinning never changes the transaction itself. Because `expenseId` is unique, a transaction always
has at most one pin. Deleting the line removes its pins, and those transactions go back to
automatic matching.
