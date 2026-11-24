---
status: accepted
---

# Monthly rate snapshots and cash-basis AH revenue recognition

Unit rates (default 500,000 VND/shift and 40,000 VND/procedure) and monthly payout ratios (default 100%, adjustable e.g. 90% for tax withholding) are snapshotted per calendar month rather than read from a single mutable global constant, and `AH` scientific-writing tasks are recognized in the calendar month payment is actually received while unpaid tasks are tracked as receivables. Shift revenue always partitions strictly by exact calendar date when a week spans two months.

## Consequences

- Future rate increases or tax withholding changes never alter historical monthly totals, and monthly financial summaries match real bank inflows rather than accrual estimates.
