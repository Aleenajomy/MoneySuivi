# Salary Planner API

All endpoints are under `/api/planner`, need `Authorization: Bearer <token>`, and only ever read or
change the signed-in user's records. A record that belongs to someone else returns **404**, the
same as one that doesn't exist.

The Salary Planner screen uses only the **salary plan** endpoints below. The other endpoints are kept
for existing data, and the screen no longer calls them.

**The planner never creates, changes or deletes a transaction.** Salary and spending are recorded only
in Add Transaction and History. The following were removed:
- `receive` with `mode: "create"` (400);
- `undo` with `deleteTransaction: true` (400);
- `POST /budgets/allocations/:id/record` (404);
- `POST /investments/:id/transactions` and `DELETE /investments/transactions/:txId` (404);
- `DELETE /investments/:id?deleteTransactions=true` (an investment that has transactions now always returns 409).

## Salary plan

The simple monthly plan: Salary → Fixed Expenses → Monthly Budget → Savings → Remaining. It is stored
as nine planning figures on the month's `BudgetPlan` row. Nothing here is a transaction, and balances,
History, EMIs, EMI payments, Lend/Borrow and Net Worth never read or change because of it.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/salary-plan?year=&month=` | | Read-only. `plan` is `null` if the month isn't set up. Always returns `emiTrackerTotal`. |
| POST | `/salary-plan/init` | `year`, `month` | Idempotent. Creates the month's plan as a copy of the latest earlier planned month; the very first month uses the default plan. 201 when created, else 200. |
| PUT | `/salary-plan` | `year`, `month`, any of the fields | Saves the given figures (sets the month up first if needed). Each is ≥ 0 with at most 2 decimals. |
| POST | `/salary-plan/reset` | `year`, `month` | Puts the month back to the default plan, with EMI from Loans & EMIs. |

Fields: `salaryAmount`, `allowanceAmount`, `rentAmount`, `emiAmount`, `emergencySavingsAmount`,
`generalSavingsAmount`, `shoppingAmount`, `travelAmount`, `foodAmount`.

**Default plan:**
- Salary ₹15,000 and company mess allowance ₹2,560.
- Rent ₹2,500, and EMI = the total of the user's active fixed EMIs (`emiTrackerTotal`).
- Emergency and general savings ₹2,000 each, shopping ₹1,500, travel ₹1,000, food ₹1,000.

Editing `emiAmount` changes the plan only, never an EMI or its payments.

`summary` (all in rupees, computed exactly in paise):

| Field | Formula |
|---|---|
| `incomeWithAllowance` | salary + allowance ("Total Income + Allowance") |
| `afterFixed` | salary − rent − EMI. **The allowance is never included**, because it pays for mess directly. |
| `allocated` | emergency + general + shopping + travel + food |
| `extraBalance` / `moneyRemaining` | `afterFixed − allocated`, or 0 when that is negative |
| `overBudget` | `allocated − afterFixed` when positive, else 0 |
| `plannedSavings` | emergency + general |
| `plannedExpenses` | rent + EMI + shopping + travel + food |
| `breakdown.{fixed,spending,savings,remaining}` | `{ amount, percent }`, where percent is the share of salary |

Within budget, `plannedSavings + plannedExpenses + moneyRemaining = salary`.

## Month overview

`GET /overview?year=&month=`

Returns `{ year, month, plan, salaries, summary, position, receivedBreakdown, emi }`. It is
read-only: it never creates a plan or a salary record. `plan` is `null` if the month hasn't been
set up.

`position` is what the simplified planner shows. It is calculated on every read and never stored
or written anywhere, so it can't change a balance, create a transaction or move money:

| Field | Meaning |
|---|---|
| `expectedIncome` | Expected amount of this month's salary records. |
| `receivedIncome` | Received salary records for this month (linked, or "already in my balance") **plus** other non-investment income dated this month that no record counts. A salary for this month paid early next month counts here, not in the month it arrived. |
| `plannedExpenses` | FIXED + VARIABLE lines. |
| `actualExpenses` | Spending transactions this month plus EMI-tracker payments, with each EMI-linked History expense counted once (as the payment). |
| `investedNet` | Net Investment-category money this month (0 unless the user records such transactions). |
| `plannedRemaining` | `expectedIncome − plannedExpenses`. |
| `actualRemaining` | `receivedIncome − actualExpenses − investedNet`. |
| `suggestedSavings` / `actualSavingsPotential` | `savingsPercent`% of the planned / actual remaining, rounded down to the paisa, never negative. |
| `savingsPercent` | The plan's share (default 20). |

`emi.payments[]` lists this month's EMI-tracker payments with `linkedTransaction` (set only when
the user linked it) and `possibleDuplicates` (same amount within 3 days, a hint that changes no
total). `emi.possibleDoubleCounts` counts payments that have such hints.

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
| `actual.expenses` | Expense transactions plus EMI payments this month. Investment-category transactions are excluded. |
| `actual.emi` | EMI payments this month. Already included in `actual.expenses`. |
| `actual.savingsNet` | Savings contributions minus withdrawals. These only set money aside: no transaction is created. |
| `actual.investmentNet` | Investment buys minus redemptions, from Investment-category transactions. |
| `actual.available` | `income − expenses − savingsNet − investmentNet`. |
| `unplanned[]` | Spending this month that no allocation tracks, by category. |

Transfers are never counted as income or spending.

Whether a transaction is an investment is decided by its **category** (Investment), the same rule
Analytics uses. If you change a buy to another category in History, it becomes ordinary spending
in the planner, on the Invest tab and in Analytics alike, and it is never counted as both. If you
change it into a transfer, it stops counting at all.

Each allocation in `plan.allocations[]` also has:

- `actualAmount`, `remainingAmount` and `utilization` (%):
  - For FIXED and VARIABLE lines: the spending matched to the line.
  - For a SAVINGS line linked to a goal (`savingsGoalId`): that goal's contributions minus
    withdrawals this month.
  - For an INVESTMENT line linked to an investment (`investmentPlanId`): that investment's buys
    minus redemptions this month.
  - `null` for an unlinked SAVINGS or INVESTMENT line, which means "not tracked" rather than ₹0.

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

## Reset

`POST /reset` clears planner data only. It never deletes or changes a transaction, a balance, an
EMI or EMI payment (other than removing its planner link), Lend/Borrow or Net Worth. Older savings
goals and investments are left alone.

| Body | Effect |
|---|---|
| `{ scope: "month", year, month }` | That month's salary records are rebuilt as pending from active sources, its lines go back to the defaults, savings goes back to 20%, and EMI links for payments that month are removed. Returns the month. |
| `{ scope: "all", confirm: "RESET" }` | Deletes every plan, salary record and income source, and removes every EMI link. Returns `cleared` counts. Without the exact confirmation word it returns 400 and changes nothing. |

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
| GET | `/salaries/:id/candidates` | | Unlinked, non-investment income transactions dated in the record's month or the month after, closest to the expected amount first. `matchesExpected` flags exact amount matches. |
| POST | `/salaries/:id/receive` | `{ mode: "link", expenseId }` or `{ mode: "alreadyInBalance", receivedAmount, receivedAt }` | Never creates a transaction. |
| POST | `/salaries/:id/undo` | | Sets the record back to pending. The linked transaction is always kept (`deleteTransaction: true` returns 400). |
| DELETE | `/salaries/:id` | | Pending records only. A received record returns 409 until it is undone. |

How `receive` works. The received date may be in the record's (earning) month or the month after;
anything else returns 400 `WRONG_MONTH`. The record always stays in its earning month.

- `mode: "link"` uses an existing income transaction that belongs to the user. It can't be an
  investment, and it can't already be linked to another record. Nothing is created.
- `mode: "alreadyInBalance"` marks the record received with the given amount and date and sets
  `countedInBalance`. No transaction is created and no balance changes. Undo simply clears it.
- Each mode only succeeds while the record is still pending. A double tap or a second device gets 409.

Each salary in a response has `receivedVia`: `TRANSACTION`, `ALREADY_IN_BALANCE` or `null`.

## Monthly budgets

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/budgets?year=&month=` | | `{ plan, summary }`. Read-only. |
| POST | `/budgets` | `year`, `month`, `defaults?` | Sets up the month and is idempotent. It creates the plan if missing (201, else 200) and copies **only** the lines marked `recurring` from the latest earlier plan, and only when the plan is new. With `defaults: true`, a new plan with nothing to copy starts with the default lines (below). It also adds pending salary records. It never copies or creates transactions. |
| PUT | `/budgets/:id` | `note?`, `savingsPercent?` (0-100), `allocations?: [{ id, ...fields }]` | Bulk edit. Either all of it is saved or none of it is. |
| POST | `/budgets/:id/default-lines` | | Adds the default lines this plan doesn't already cover (by name or a distinctive word: "Rent / Accommodation" covers Rent). Returns `added`. |
| POST | `/budgets/:id/copy-recurring` | | Adds recurring lines from the latest earlier plan that this month doesn't have, matched by name. Lines already in this month aren't changed. Returns `copied`. |
| POST | `/budgets/:id/allocations` | `group`, `name`, `plannedAmount`, `matchCategories?`, `recurring?` (default true), `sortOrder?` | `name` must be unique within the month (409). |
| PUT | `/budgets/allocations/:allocationId` | any allocation field | Changes this month only. |
| DELETE | `/budgets/allocations/:allocationId` | | Changes this month only. |

Default lines: Rent (FIXED, ₹2,500), EMI (FIXED, the sum of the user's active fixed EMI amounts,
matches `EMI`), Mess / Food (FIXED, matches Food), Travel (VARIABLE) and Other Personal
(VARIABLE, matches Shopping, Entertainment, Healthcare, Other). All are planned amounts only and
can be edited or deleted.

## EMI payment links

An EMI-tracker payment never creates a transaction, so a user who also adds the payment in
History would see it twice in the planner. The user can link the two; nothing is matched
automatically, and linking never changes a transaction, EMI or balance.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/emi-payments/:paymentId/candidates` | | Unlinked spending within 31 days of the payment, exact amount first, then nearest date. Each has `sameAmount` and `daysApart`. |
| PUT | `/emi-payments/:paymentId/link` | `expenseId` | Refused unless the transaction is the user's spending (not income, a transfer or an investment, 400 `NOT_SPENDING`), has exactly the payment's amount (`AMOUNT_MISMATCH`) and is within 31 days (`TOO_FAR_APART`). One transaction backs one payment (409). Returns the payment's month. |
| DELETE | `/emi-payments/:paymentId/link` | | Removes only the link. |

A linked expense is left out of spending, because the payment already counts it. If the user later
edits it in History so it no longer qualifies, or deletes it, the link is removed in the same step
and the expense counts as ordinary spending again.

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

## Savings goals

Goals only **set money aside on paper**. Adding to or withdrawing from a goal never creates a
transaction and never changes an account balance; the month summary reports it as
`actual.savingsNet`.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/goals?year=&month=` | | All goals, active first. `thisMonthAmount` is for the given month (default: the current month). |
| POST | `/goals` | `name`, `targetAmount` (> 0), `initialAmount?`, `monthlyContribution?`, `targetDate?`, `note?` | `initialAmount` is what was saved before the goal was created. |
| PUT | `/goals/:id` | any of the above | `targetDate` and `monthlyContribution` can be set to `null`. Lowering `initialAmount` below what has already been withdrawn returns 409. |
| PATCH | `/goals/:id/archive` | `archived` (boolean) | An archived goal accepts no new entries (409 `ARCHIVED`) until it is restored. |
| DELETE | `/goals/:id` | | Removes the goal and its entries. Budget lines linked to it are kept and unlinked. |
| GET | `/goals/:id/contributions` | | Newest first, up to 200. |
| POST | `/goals/:id/contributions` | `type` (`CONTRIBUTION` or `WITHDRAWAL`), `amount`, `date`, `note?` | A withdrawal larger than what is saved returns 409 `INSUFFICIENT_SAVED`. |
| DELETE | `/goals/contributions/:contributionId` | | Removing a deposit that later withdrawals depend on returns 409. |

Each goal returns:

- `savedAmount`: `initialAmount` + contributions − withdrawals. It never goes below ₹0: every
  check that could lower it locks the goal row, so concurrent requests are checked one at a time.
  A withdrawal may be dated before the deposits that cover it; only the overall balance is checked.
- `remainingAmount`, `progress` (%, can exceed 100) and `reached`.
- `monthsLeft` (this month included) and `requiredMonthly`: what would still need to be set aside
  each month to reach the target by the target date's month, rounded up to the paisa. This is
  plain arithmetic, not a forecast.
- `overdue`: the target date has passed without reaching the target.

## Investments

For planning and tracking only: MoneySuivi never buys or sells anything and doesn't estimate
returns.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/investments?year=&month=` | | `{ plans, summary }` for the given month (default: current). |
| POST | `/investments` | `name`, `category`, `monthlyPlannedAmount?`, `note?` | `category` is one of `GOLD`, `GOLD_ETF`, `MUTUAL_FUND`, `INDEX_FUND`, `STOCK`, `OTHER`. |
| PUT | `/investments/:id` | any of the above | |
| PATCH | `/investments/:id/active` | `active` (boolean) | |
| DELETE | `/investments/:id` | | Refused with 409 `HAS_TRANSACTIONS` while it has any transactions; those are deleted in History. |
| GET | `/investments/:id/transactions` | | Newest first, up to 200. |

Existing investment transactions (recorded by the earlier planner) are read only:

- A buy is an `expense` and a redemption an `income`, both in the **Investment** category.
- The planner counts them in `actual.investmentNet` only, never as income or spending.
- The History transaction is the source of truth. Editing its amount or date shows up everywhere;
  changing it into a transfer or another category means it no longer counts as an investment.

Each plan returns:

- `investedTotal`: all buys minus redemptions. It can be negative if more was taken out than put in.
- `thisMonthAmount` and `thisMonthProgress` (% of `monthlyPlannedAmount`).
- `transactionCount` and `lastTransactionAt`.

`summary` contains:

- `plannedThisMonth`: active plans only.
- `investedThisMonth` and `totalInvested`.
- `unlinkedThisMonth`: Investment-category transactions entered in History without an investment.
- `totalThisMonth`: `investedThisMonth` + `unlinkedThisMonth`. This equals the month summary's
  `actual.investmentNet`.

## Bills and EMIs

`GET /bills?year=&month=` (default: the current month) is **read-only**. Bills are the user's
active recurring expenses (Recurring Payments) and EMIs are their Loans & EMIs. The planner never
keeps its own copy of either, so nothing can be duplicated. EMIs are paid through the existing
`PATCH /api/emis/:id/pay`.

Returns `{ bills, emis, upcoming, summary }`:

- **`bills[]`** has one entry per date an active recurring **expense** falls on in the month.
  Weekly bills can appear up to 5 times. Stopped recurring payments, recurring income and
  recurring transfers are not bills.

  A date counts as paid when a transaction in History backs it:

  - the first payment itself;
  - otherwise an auto-added copy with the same title, category and date;
  - otherwise, for a bill that was renamed or recategorised later, an auto-added copy on the same
    day with the same amount and payment method.

  Each transaction backs one date only. Statuses:

  | Status | Meaning |
  |---|---|
  | `RECORDED` | Backed by a transaction in History. |
  | `NOT_FOUND` | The nightly job has already passed this date, but no transaction backs it any more. It was deleted or edited. |
  | `DUE` | Due today or earlier, and not yet added. |
  | `SCHEDULED` | A future date. |

- **`emis[]`** follows the EMI tracker's own rules:
  - **Fixed EMI.** Installment *k* is due *k* months after the start date. It is `PAID` once the
    tracker counts it paid, whichever month the payment was made in. A payment made this month for
    a different installment shows as `paidThisMonth`, but settles that installment's month, not
    this one.
  - **Flexible EMI with an EMI amount.** It is due monthly on its due day: `nextDueDate`, otherwise
    one month after the start. It is `PAID` or `PARTIAL` from that month's payments.
  - **Flexible EMI without an amount.** It only appears in its `nextDueDate` month, or in a month
    with a payment.
  - Otherwise the status is `OVERDUE`, `DUE_TODAY`, `UPCOMING`, or `NO_DATE`.
  - **`payable`** marks the one row a payment would settle. For a fixed EMI, the tracker always
    pays the next unpaid installment, so only that row is payable. A flexible EMI is payable only in
    the current month, because payments are dated today.
- **`upcoming[]`** lists the next 30 days from today, whatever month is being viewed: each
  recurring bill's next date, each fixed EMI's `nextDueDate` (including overdue ones), and each
  flexible EMI's next unpaid monthly due date.
- **`summary`** has:
  - `expected`: all bill dates plus EMI amounts due in the month.
  - `settled`: recorded bills, plus the EMI amounts settled for this month.
  - `pending`: added up item by item, so an EMI paid ahead can't hide another bill.
  - `overdueCount` and `notFoundCount`.

**Limits:**

- A stopped recurring payment, or a completed fixed EMI, no longer appears in past months unless a
  payment was made that month.
- EMI payments recorded in Loans & EMIs keep their time of day. A payment made just after midnight
  IST on the 1st can therefore fall in the previous month, because months are grouped in UTC.

**Reminder.** The nightly job (00:00 Asia/Kolkata) sends a "Bill tomorrow" notification the day
before a recurring bill is added. It goes in-app, and as a push notification to the installed app.

- Identical bills (same title, amount and account) share one message, for example "2 payments of …".
- Each message is sent at most once a day. The check and the in-app record happen in one database
  transaction holding a lock on that message, so two runs can't both send it.
- A bill created after midnight that is due the next day gets no reminder.
- The existing EMI reminders are unchanged.
