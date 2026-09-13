# Pro Timesheet — Build Spec

Status: **APPROVED, ready to build** (design locked with Craig, Sep 13 2026).
Purpose: give teaching pros an hourly timesheet, mirroring the proven office timesheet engine, auto-generated from the pro-schedule class grid.

## Core principle

The office timesheet is the **master engine**: confirm a row → compute hours → period total → CSV export. The pro timesheet is that *same engine*, just fed from a different source:

- **Office sheet** — rows come from fixed daily shifts (morning / afternoon / closing).
- **Pro sheet** — rows come from the pro-schedule class grid.

**Rate separation is automatic.** Office hours live in the office sheet (office rate); teaching hours live in the pro sheet (pro rate). A dual-role person (e.g. Angie) appears in both, each already at the correct rate. No per-shift work-area tagging needed.

## Auto-generation from the class grid

Each `pro_schedule_slot` stores: `day` (weekday, e.g. `Mon`), `start`/`end` (24h), `time_label`, `program`, `pro_ids` (assigned pros), `active`.

Generation logic per logged-in pro, for a pay period `[start, end]`:
- For each active slot where the pro is in `pro_ids`:
  - For each date in the period whose weekday === `slot.day`:
    - Emit a confirmable row: `{ date, program, time_label, start, end, hours = end − start }`.
- The pro taps to confirm each class actually taught. Default times = class times; editable.
- Unconfirmed rows = 0 hours (harmless), so extra/off-week rows never affect pay.

### Seasons (no date math required)

The club runs three seasons, each with its own class grid:
- **Indoor** — September–April
- **Spring** — May–June
- **Summer** — July–August

When the season changes, management re-enters the pro-schedule grid. Auto-generation reads *whatever the current grid is*, so the pro timesheets switch over automatically. **No stored per-class end dates, no planning ahead.**

### Snapshot on confirm (critical)

When a pro confirms a class, the timesheet entry **snapshots** that class's `date`, `start`, `end`, and `program` at confirm time. Past pay periods therefore stay accurate forever — swapping the grid for a new season never rewrites historical confirmed hours. Entries do **not** depend on the source slot still existing.

## Manual entries

- **Pros can add their own** manual lines (date, start, end, note) — private lessons, subbing, off-grid classes.
- **Management (admin/manager)** can add/edit anyone's.
- Manual entries are **flagged with a visible badge** so management can scan a period and spot every manually-added line at a glance.

## Dual-role toggle

- Staff who are both pro and office (e.g. Angie) get an **Office ⇄ Pro toggle** on the timesheet page.
- The toggle switches which sheet they view and confirm.
- Detect dual-role: appears in both the office schedule assignments AND in any `pro_ids` (or an explicit capability flag on the staff record).

## Permissions (mirror office sheet)

- Pros confirm/edit their **own** rows only.
- Management (admin/manager) edit anyone's.

## Excluded

- **Salaried staff (David, Megan)** — kept outside the timesheet system entirely.

## Build order

1. **Backend engine** — expand grid → dated rows (`getProAssignmentsForRange`), a `pro_timesheet_entries` store (upsert / manual add / delete), snapshot class details on confirm, CSV export.
2. **Pro timesheet page** — copy the office engine, adapted: auto rows + one-tap confirm + per-class hours + period total + CSV.
3. **Dual-role toggle** + manual-entry UI + management manual-flag scan.
4. **Phase 2 — pay math** — per-person pro hourly rate → dollar totals. Hours-first; money later.

## Already shipped (Sep 13 2026)

- Office timesheet: per-shift hours now display inline at the end of each row once a shift is confirmed (commit `865407a`). This is the reusable pattern the pro sheet copies.
