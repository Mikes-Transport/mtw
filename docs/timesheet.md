# Timesheet

A separate app in `apps/timesheet/` that the dashboard loads as the **Timesheet** navigation item. Only the Managers role sees it.

## Using it

1. **First use:** open Timesheet. With no PINs in Firebase yet, it asks for a GM name and creates the first GM PIN. The PIN is shown once.
2. **Unlock:** enter a 6-digit PIN. The PIN decides who you are:
   - **Employee**: clock in and out, pick a task, take the three breaks, see today's totals and their Wednesday–Tuesday timesheet, and write a daily work summary.
   - **GM**: live team status, any employee's weekly timesheet (with CSV export), and **People & PINs**, which adds people, resets PINs and removes people. Removing someone keeps their records.
3. **Lock** forgets the PIN for this browser tab.

## Rules it follows (from the spec)

- Times are stored as UTC instants. Reporting dates and weeks are New Zealand time (`Pacific/Auckland`): **Wednesday 00:00 to Tuesday 23:59:59**.
- The employee sees their own time (`America/Edmonton` for Calgary) next to NZ time. Sessions that cross NZ midnight are split between the two days (and weeks).
- Time zones use IANA rules, never fixed offsets. For example, Alberta stopped changing clocks in November 2026 and is now UTC−6 all year. A browser with very old time-zone data may show Calgary times an hour off; totals are unaffected.
- Totals are kept separate: **on clock**, **active work**, **paid breaks**, **unpaid breaks**, **payable** (= active + paid breaks).
- Breaks (proposed defaults; confirm against the employment agreement): first rest 15 min paid, meal 30 min unpaid, second rest 15 min paid. A break that runs over is recorded in full and flagged, never truncated.
- Only one open session at a time. A session open longer than 14 hours is flagged as a possible missed clock-out; no end time is invented.
- Every change is written to `timesheet-audit`.

## Firestore data

| Collection | Fields |
|---|---|
| `timesheet-people` | `name`, `role` (`employee`/`gm`), `timeZone`, `pinSalt`, `pinHash`, `active`, `createdAt` |
| `timesheet-sessions` | `personId`, `startAt`, `endAt` (null while open), `task`, `breaks[]` (`type`, `paid`, `startAt`, `endAt`), `createdAt`, `updatedAt` |
| `timesheet-summaries` | id `<personId>_<NZ date>`: `personId`, `date`, `text`, `updatedAt` |
| `timesheet-audit` | `actorId`, `action`, `targetType`, `targetId`, `at`, `details` |

PINs are never stored. Only a salted SHA-256 hash is.

## Security: what this does and doesn't protect

The PIN identifies who is using the tool and keeps casual users out. It is **not** strong security yet:

- The check runs in the browser, so anyone who can open the dashboard and the browser console can read or change Firestore data directly, depending on the project's Firestore rules.
- Times come from the employee's computer clock.

Before payroll relies on it, the spec's next step applies: Firebase Authentication accounts, Firestore security rules (employees read only their own records; only GMs approve), and Cloud Functions for server-validated clock times and approvals.

## Not built yet

- Random webcam presence checks: needs MTW's agreed policy (frequency, response window, photo retention) and server-side scheduling.
- Corrections and approval workflow (submit, approve, return).
- Export to the real timesheet template, once it's provided.

## Code

- `apps/timesheet/js/timesheet-core.js`: time-zone maths, week/day splitting, totals, PIN hashing. No DOM or Firebase. Tested in `tests/timesheet-core.test.js`.
- `apps/timesheet/js/timesheet.js`: the tool (PIN gate, employee and GM views, Firestore reads and writes). Tested end to end in `tests/timesheet-tool.test.js`.
- `apps/timesheet/css/timesheet.css`: styles.
- The dashboard loads all three from `apps/dashboard/js/dashboard.js`.
