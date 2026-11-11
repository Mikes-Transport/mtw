# Timesheet

A separate app in `apps/timesheet/` that the dashboard loads as the **Timesheet** navigation item. Only the Managers role sees it.

## Using it

1. **First use:** open Timesheet. With no PINs in Firebase yet, it asks for a GM name and creates the first GM PIN. The PIN is shown once.
2. **Unlock:** enter a 6-digit PIN. The PIN decides who you are:
   - **Employee** tabs: **Clock** (clock in and out, task, breaks with a live timer, today's totals and notes, daily work summary), **My hours** (their Wednesday–Tuesday week and summaries), **Requests** (ask not to work a day or run of days; cancel while pending).
   - **GM** tabs: **Team status** (live), **Hours** (any employee's week, work summaries, CSV export), **Requests** (approve or decline, with a note; the tab shows how many are waiting), **People & PINs** (add people, reset PINs, remove people; removing keeps their records), **Settings** (breaks, tasks, missed clock-out hours).
   - **Notifications** (bell with an unread count, plus a short pop-up when something arrives while the tool is open):
     - GM: new day-off requests and cancellations, new work summaries, breaks that ran over, possible missed clock-outs.
     - Employee: their day-off request was approved or declined (with the GM's note).
     - Opening the bell marks everything as seen, saved on the person (`notificationsSeenAt`), so it holds across devices. Clicking a notification opens the right tab. The last 30 days are kept.
   - All times are 24-hour.
   - Everything updates live through Firestore listeners (polling every 30 s if those are unavailable). Redraws wait while someone is typing.
3. **Lock** forgets the PIN for this browser tab.

## Rules it follows (from the spec)

- Times are stored as UTC instants. **Each person's shifts are filed under their own work date**, in their time zone (People & PINs): a Calgary employee's Monday 07:30–17:00 shows on the **Monday** row, even though it is Tuesday 02:30–12:00 in NZ. Weeks run **Wednesday to Tuesday** in those same dates. Requests use those dates too.
- Timesheets show the employee's local times and the NZ times side by side. The NZ weekday is marked when it differs. The CSV has both.
- Time zones use IANA rules, never fixed offsets. For example, Alberta stopped changing clocks in November 2026 and is now UTC−6 all year. A browser with very old time-zone data may show Calgary times an hour off; totals are unaffected.
- Totals are kept separate: **on clock**, **active work**, **paid breaks**, **unpaid breaks**, **payable** (= active + paid breaks).
- Breaks (defaults, editable in Settings; confirm against the employment agreement): first rest 15 min paid, meal 30 min unpaid, second rest 15 min paid. Each can be taken once per NZ day. While a break runs, a timer shows elapsed time and time left, then time over. A break that runs over is recorded in full and flagged on that day, never truncated.
- Approved day-off requests show on the timesheet for those days and in the CSV.
- Only one open session at a time. A session open longer than 14 hours is flagged as a possible missed clock-out; no end time is invented.
- Every change is written to `timesheet-audit`.

## Firestore data

| Collection | Fields |
|---|---|
| `timesheet-people` | `name`, `role` (`employee`/`gm`), `timeZone`, `pinSalt`, `pinHash`, `active`, `createdAt`, `notificationsSeenAt` |
| `timesheet-sessions` | `personId`, `startAt`, `endAt` (null while open), `task`, `breaks[]` (`type`, `paid`, `startAt`, `endAt`), `createdAt`, `updatedAt` |
| `timesheet-summaries` | id `<personId>_<NZ date>`: `personId`, `date`, `text`, `updatedAt` |
| `timesheet-audit` | `actorId`, `action`, `targetType`, `targetId`, `at`, `details` |
| `timesheet-settings` | `main`: `breaks[]` (`id`, `label`, `minutes`, `paid`), `tasks[]`, `longSessionHours` |
| `timesheet-requests` | `personId`, `type`, `from`, `to` (NZ dates), `note`, `status` (`pending`/`approved`/`declined`/`cancelled`), `createdAt`, `reviewedBy`, `reviewedAt`, `reviewNote` |

PINs are never stored. Only a salted SHA-256 hash is.

## Security: what this does and doesn't protect

The PIN identifies who is using the tool and keeps casual users out. It is **not** strong security yet:

- The check runs in the browser, so anyone who can open the dashboard and the browser console can read or change Firestore data directly, depending on the project's Firestore rules.
- Times come from the employee's computer clock.

Before payroll relies on it, the spec's next step applies: Firebase Authentication accounts, Firestore security rules (employees read only their own records; only GMs approve), and Cloud Functions for server-validated clock times and approvals.

## Not built yet

- Random webcam presence checks: needs MTW's agreed policy (frequency, response window, photo retention) and server-side scheduling.
- Timesheet corrections and weekly approval (submit, approve, return).
- Export to the real timesheet template, once it's provided.

## Code

- `apps/timesheet/js/timesheet-core.js`: time-zone maths, week/day splitting, totals, PIN hashing. No DOM or Firebase. Tested in `tests/timesheet-core.test.js`.
- `apps/timesheet/js/timesheet.js`: the tool (PIN gate, employee and GM views, Firestore reads and writes). Tested end to end in `tests/timesheet-tool.test.js`.
- `apps/timesheet/css/timesheet.css`: styles.
- The dashboard loads all three from `apps/dashboard/js/dashboard.js`.
