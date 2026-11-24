---
status: accepted
---

# Four-state shift slot model with red/green projection for manager export

Each `(Date, Ca)` slot stores one of four states — `BV`, `Nghỉ`, `Rảnh`, or a confirmed KFC branch (`CN1`–`CN4`, with `CN4 + Ca 2` disallowed per clinic operating hours) — instead of mirroring the clinic manager's binary red/green grid. When exporting the 1–3 week PNG grid for the manager, both `BV` and `Nghỉ` project to plain red while `Rảnh` projects to plain green (and already-assigned `CN1`–`CN4` cells display branch labels on darker green with a toggle for plain red/green); unscheduled `Rảnh` slots stay `Rảnh` (unpaid) rather than mutating into `Nghỉ`.

## Consequences

- Personal analytics accurately separate hospital workload (`BV`), personal rest (`Nghỉ`), and unfulfilled availability (`Rảnh`) without exposing personal vs. hospital reasons to the clinic manager.
