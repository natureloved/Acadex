# Acadex — Academic Calendar Management System

**Acadex** is a web application that lets a university publish its academic
calendar as a *living system* instead of a static document. The registry
creates sessions, semesters and events (registration, lectures, examinations,
breaks, matriculation, convocation); students and staff read one authoritative,
searchable calendar; and every change of date leaves a visible audit trail.

It was built as a final-year project (Computer Science / Software Engineering)
around a real, observed problem at **Lagos State University (LASU)**: the
approved calendar is published as a static page, and corrections (such as the
one-week extension of the 2025/2026 session) are re-announced in separate news
posts and social-media threads. Readers must reconcile a stale page with a
correction posted elsewhere. Acadex turns that failure mode into a feature —
rescheduled events show exactly what changed and when.

## What it does

- **Public calendar** — server-rendered agenda of published events, upcoming
  events first, with session / semester / category / period filters and search.
  Draft events are never visible publicly.
- **Change history** — every event keeps an append-only revision trail; moved
  dates are flagged with a "rescheduled" badge and a before/after diff.
- **Roles** — admin, staff and student accounts with server-enforced
  authorisation (JWT session cookie, role re-checked against the database on
  every request).
- **Audience targeting** — events can target the whole university, a faculty,
  a department or a single level; staff-only notices stay off the public page.
- **Notifications and reminders** — a notification centre for every signed-in
  user (unread state, links to the event) and a scheduled job that reminds an
  event's audience one week and one day before it starts.
- **Demo data with an honest provenance** — the seed ships a realistic
  2025/2026 LASU calendar (archive) and a current 2026/2027 session, whose
  dates are explicitly marked provisional because public sources conflict
  (see [docs/seed-data-sources.md](docs/seed-data-sources.md)).

## Stack and why

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + React Server Components | One deployable, server-rendered app; shareable URLs; public pages work without client JavaScript |
| Language | TypeScript | Typed end-to-end from the Prisma schema to the UI |
| Styling | Tailwind CSS 4 | Fast utility styling, mobile-first responsive pages |
| ORM | Prisma 7 with the `better-sqlite3` driver adapter | Typed schema + versioned migrations, with **zero external database** — SQLite is a single file, so the demo runs fully offline |
| Database | SQLite (`dev.db`) for local dev | No server to install or run; the design plans PostgreSQL for a real deployment |
| Auth | `jose` JWT session cookie + `bcryptjs` | Signed, httpOnly session cookie; hashed passwords |
| Validation | Service-layer checks (`lib/auth.ts` `server-only` boundaries) | Role checks live next to the data, not just in the UI |

No Docker and no native build toolchain are required.

## Prerequisites

- Node.js 20+ (developed on Node 22)
- npm 10+
- Git (optional, for cloning)

## Setup

```bash
# 1. Install dependencies (also runs `prisma generate` via postinstall)
npm install

# 2. Configure the environment
cp .env.example .env
#    then edit .env and set AUTH_SECRET to a long random string, e.g.:
#    node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
#    and CRON_SECRET, which guards the reminder endpoint (same command) —
#    see "Notifications and reminders" below

# 3. Create the database, apply migrations and seed the demo data
npm run setup
#    or, to wipe and rebuild from scratch:
#    npm run db:reset

# 4. Run it
npm run dev
# open http://localhost:3000
```

The database is a single SQLite file (`dev.db`) created by the migrations —
no database server, no Docker.

## Seeded demo accounts

All three accounts share the password **`Password123!`**:

| Role | Email |
| --- | --- |
| Administrator | `admin@acadex.lasu.edu.ng` |
| Staff (Faculty of Science, Computer Science) | `staff@acadex.lasu.edu.ng` |
| Student (CSC, 400 level) | `student@acadex.lasu.edu.ng` |

> **⚠️ These are demo-only credentials, seeded in plain sight for the
> defence demo.** They must be changed or removed before any public
> deployment. The same applies to the seeded calendar dates: the 2025/2026
> dates were transcribed from published LASU announcements, and the 2026/2027
> dates are **provisional placeholders** because published sources on that
> session contradict each other. Verify everything against the official
> Senate-approved calendar — see [docs/seed-data-sources.md](docs/seed-data-sources.md).

## Project structure

```
app/                      Next.js App Router pages
  page.tsx                Landing page (active session summary)
  calendar/               Public agenda + per-event detail with revision history
  calendar/print/         Print / save-as-PDF view of a session or semester
  calendar/[id]/ics/      "Download this event" as a one-event .ics file
  login/ register/ logout Auth pages and logout route
  admin/                  Admin screens: dashboard, events, sessions,
                          categories, CSV import and the audit log (ADMIN only)
  staff/                  Staff view scoped to faculty/department/level
  ics/[token]/            .ics subscription feeds (the token is the credential)
  subscribe/              Subscribe screen: feed address, instructions, rotate
  notifications/          Notification centre: every notice addressed to you
  api/reminders/run/      Scheduler entry point for the reminder job (CRON_SECRET)
components/               Shared UI: agenda items, chips, badges, revision timeline
components/admin/         Admin-only UI: sub-navigation, event form, import wizard
lib/                      Data access and domain logic
  auth.ts                 Role checks (server-only, enforced on every request)
  db.ts                   Prisma client, framework-free so scripts can use it
  services/               Business rules: event lifecycle, sessions, categories,
                          CSV import, feeds, notifications and sign-in throttling.
                          No framework imports, so the verify scripts exercise
                          them directly
  actions/                Server actions: resolve the user, then call a service
  events.ts               Event queries — the single "who may see what" rule
  constants.ts            String "enums" (SQLite has no native enums)
  session.ts              JWT session issuing/verification
  generated/prisma/       Generated Prisma client (recreated by `npm install`)
prisma/
  schema.prisma           13 models: users, faculties, departments, sessions,
                          semesters, categories, events, targets, revisions,
                          subscriptions, notifications, audit log
  migrations/             Versioned SQLite migration history
  seed.ts                 Idempotent demo-data seed (two sessions)
app/error.tsx             Error boundary: shows a digest, never a stack trace
app/not-found.tsx         404 page (a withdrawn date is a 404 on purpose)
app/api/diagnostics/      Development-only query counter, used by the measurer
proxy.ts                  Coarse route protection for /admin and /staff
scripts/                  Verification scripts (see "Verifying it works")
public/csv-import-template.csv  Downloadable template for the CSV importer
docs/                     ACADEX-PLAN.md, seed-data-sources.md, security-checklist.md
```

## Available scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build (type-checks + lints) |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript check, no emit |
| `npm run db:migrate` | Apply pending migrations (`prisma migrate dev`) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:seed` | Re-run the demo seed (idempotent) |
| `npm run db:reset` | Reset the database, migrate, generate, seed |
| `npm run db:studio` | Open Prisma Studio |
| `npm run setup` | Migrate + generate + seed in one step |
| `npm run reminders` | Run the reminder job without HTTP (see below) |
| `npx tsx scripts/verify-phase3.mts` | Service-layer regression test (no server needed) |
| `npx tsx scripts/verify-http.mts` | Proxy, audience and action checks (dev server running) |
| `npx tsx scripts/verify-phase4.mts` | Feeds, subscribe screen and print view (dev server running) |
| `npx tsx scripts/verify-phase5.mts` | Notifications, the reminder job and the endpoint (dev server running) |
| `npx tsx scripts/verify-phase6.mts` | Headers, throttling, limits, accessibility, contrast |
| `npx tsx scripts/measure-performance.mts` | Page sizes, timings and the query count |
| `npx tsx scripts/verify-deployment.mts` | Deployment smoke test against a running target |
| `npx tsx scripts/smoke-db.mts` | Quick check that the database layer opens |

## Managing the calendar (admin)

Sign in as `admin@acadex.lasu.edu.ng` and open **Admin**.

| Screen | What it is for |
| --- | --- |
| Overview | Counts, the active session and the latest audit entries |
| Events | Filterable list of every event, drafts included, with its revision number |
| Sessions | Create sessions and semesters; exactly one session is active at a time |
| Categories | The colour-coded buckets; a category still in use cannot be deleted |
| Import | Bulk-load an approved calendar from CSV |
| Audit | Every create, edit, publish, reschedule, cancellation and deletion |

**Event lifecycle.** Create an event as a *draft* to keep it off the calendar
while it is still being confirmed, then **Publish** it. Editing the dates of a
published event records a `RESCHEDULED` revision, increases the revision number
and notifies the audience; the public event page then carries a "this event was
rescheduled" notice with the old and new dates. Changing only the wording does
*not* bump the revision number, so students are not alarmed by a typo fix. A
published event is **cancelled** rather than deleted - its change history is the
point of the system - and only drafts can be deleted outright.

**Audience.** *Whole university* goes to everybody. A faculty, department or
level audience is shown only to those people, and to them on `/calendar` once
they sign in. *Staff only* additionally hides an event from students. Reschedules
and cancellations notify exactly the users in that audience.

**Warnings.** Every save runs two conflict checks: an overlap with another event
that shares the audience, and a clash with an examination window. They are
warnings, not blocks - a registry sometimes has to schedule around them - and they
are listed on the event page.

**Importing.** `/admin/import` accepts a CSV with the header
`title,category,semester,start,end,location,description` (dates `YYYY-MM-DD`,
semester `FIRST` or `SECOND`, category matched by name). It parses and validates
first, listing any row it would skip and why; nothing is written until you
confirm. Imported events arrive as drafts unless you tick "publish immediately".
A template ships at `public/csv-import-template.csv`.

## Subscribing to the calendar

Nobody should have to visit a website to learn that an examination moved. Acadex
publishes iCalendar (RFC 5545) feeds, so the subscriber's own calendar application
keeps itself current, corrections and cancellations included.

| Feed | Address | Who it is for |
| --- | --- | --- |
| Personal | `/ics/<your-token>.ics` | One person: whole-university dates plus their faculty, department and level |
| Public | `/ics/public.ics` | Anyone, no account: whole-university dates only |
| Single event | `/calendar/<id>/ics` | "Download this event", from its detail page |

Sign in and open **Subscribe** (`/subscribe`) for your own address, a one-click
`webcal://` link, and step-by-step instructions for Google Calendar, Outlook and
Apple Calendar.

**The address is the credential.** Calendar clients cannot present a login form, so
the feed route is public and the token in the URL is what authorises it - the same
"secret address" model Google and Outlook use for their own calendars. Anyone holding
the link can read that one person's feed, which is why the Subscribe screen says so
plainly and offers a button that regenerates the address and kills the old one.

Two details are what make the feed trustworthy rather than merely present:

- **A moved date propagates.** Every entry carries `SEQUENCE`, `LAST-MODIFIED` and a
  description saying that it was rescheduled, so the client replaces the date it
  already had instead of quietly keeping the old one.
- **A cancellation propagates.** Cancelled events keep being advertised for 90 days
  with `STATUS:CANCELLED` and a higher `SEQUENCE`, which is what tells a client to
  remove the entry. Without that, a withdrawn date would linger in people's calendars
  indefinitely.

`SEQUENCE` is derived from each event's append-only revision *count* rather than its
revision *number*, because only a monotonic value is respected by clients: cancelling
and then restoring an event moves no dates, so a number derived from the date-move
counter would go **down** and be ignored, leaving the event cancelled in every
subscriber's calendar. `scripts/verify-phase4.mts` section 14 pins that behaviour down.

A print view lives at `/calendar/print` (optionally with `?session=` or `?semester=`),
laid out for paper with a "Print / save as PDF" button. That uses the browser's own
PDF engine, so there is no dependency to install and no server-side rendering service
to run.

## Notifications and reminders

Subscribing puts the calendar in one application. Notifications reach people inside
Acadex, without them having to look:

- **The centre** (`/notifications`) lists every notice addressed to one person,
  newest first, with unread notices visually distinct, a link to the event and a
  "mark as read" control per row plus a "mark all as read" action. An `?unread=1`
  filter narrows it to what is outstanding. The header shows the unread count for
  signed-in users, and hides the badge at zero.
- **The reminder job** writes a `REMINDER_T7` one week before a published event
  starts and a `REMINDER_T1` the day before, to everyone in that event's audience —
  the same audience rule as the calendar, the staff view and the feeds, so a
  department-scoped event reminds that department only and a staff-only notice
  never reaches a student.

Everything is server-rendered; the marking controls are real forms posting to
server actions, so the page works with JavaScript disabled. Reads and writes are
scoped to the signed-in user id in the service layer, so one account cannot see or
mark another account's notices.

The job is idempotent: a reminder is written at most once per person, event and
horizon, so running it twice — or a scheduler firing twice by accident — creates
nothing the second time and reports the duplicates as `skipped`. Each run also
writes one `AuditLog` row (`REMINDERS_RUN`) with its counts, so a scheduler that
silently stops firing is visible in the audit log rather than inferred from a stale
calendar.

Delivery is in-app only. Email and SMS are out of scope for this phase: they would
add a mail or SMS dependency plus provider credentials to a system that runs fully
offline, along with template, bounce and unsubscribe handling. The iCalendar feed
already covers "tell me without me visiting the site".

### Running the job

Two equivalent entry points.

**Without HTTP** — a thin runner that calls the service directly, prints the
summary and exits non-zero on failure:

```bash
npm run reminders
# 7-day reminders created:  0
# 1-day reminders created:  0
# already sent (skipped):   0
# events on a horizon:      0
```

Add `-- --now=YYYY-MM-DD` to run the job as if that were today (UTC). It exists to
demonstrate and rehearse the job, because the seeded calendar has nothing due on
most days.

**Over HTTP** — `POST /api/reminders/run` (and `GET`, for manual testing) returns
the summary as JSON. Both are guarded by a shared secret in `CRON_SECRET`:

| Situation | Response |
| --- | --- |
| `CRON_SECRET` not set on the server | `503` — the job does not run at all |
| Secret missing or wrong | `401` — the job does not run at all |
| Secret correct | `200` with `{ ok, runAt, t7, t1, skipped, considered, auditLogId }` |

It fails closed: a missing configuration can never turn into an open endpoint that
anyone can trigger. The secret is compared with `timingSafeEqual`, and is read from
`Authorization: Bearer <secret>` (what Vercel Cron sends) or `x-cron-secret` —
never from the query string, because URLs end up in access logs.

Set the variable in `.env` (see `.env.example`) and generate a value with:

```bash
node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
```

### Scheduling it

Any of these run the job once a day; daily is enough, because the job is
idempotent and looks at calendar days.

**Windows Task Scheduler** (adjust the path and time; `schtasks /query /tn "Acadex
reminders"` shows whether it exists, `schtasks /delete /tn "Acadex reminders" /f`
removes it):

```bat
schtasks /create /tn "Acadex reminders" /sc daily /st 06:00 /tr ^
  "cmd /c cd /d C:\path\to\Acadex && npm run reminders >> reminders.log 2>&1"
```

**cron** (Linux or macOS, 06:00 daily):

```cron
0 6 * * * cd /srv/acadex && /usr/bin/npm run reminders >> /var/log/acadex-reminders.log 2>&1
```

**Vercel Cron** — `vercel.json` in the project root, which sends the secret as a
bearer token automatically when `CRON_SECRET` is set in the project's environment
variables:

```json
{
  "crons": [{ "path": "/api/reminders/run", "schedule": "0 6 * * *" }]
}
```

Schedules are in the platform's timezone (UTC on Vercel); the job itself works in
UTC calendar days, so a single daily run covers everyone.

## Verifying it works

```bash
npx tsx scripts/verify-phase3.mts   # service layer; no server required
npm run dev                         # in another terminal
npx tsx scripts/verify-http.mts     # proxy gating, audience, server actions
npx tsx scripts/verify-phase4.mts   # feeds, subscribe screen, print view
npx tsx scripts/verify-phase5.mts   # notification centre, reminders, endpoint
```

If the dev server is not on port 3000, point the HTTP scripts at it with
`BASE_URL`:

```bash
BASE_URL=http://localhost:3001 npx tsx scripts/verify-http.mts
```

`verify-phase5.mts` needs `CRON_SECRET` in the server's environment to exercise the
authorised reminder run; without it the script reports a `SKIP` rather than
pretending the check passed.

`verify-phase3.mts` drives the service layer directly and inspects the database
after every step: draft, publish, reschedule (including who was notified and who
was not), cancel, restore, delete, the session and semester rules, guarded
deletes, and CSV parsing with deliberately malformed rows. It cleans up
everything it created and exits non-zero if any assertion fails.

`verify-http.mts` mints its own session cookies from the database and exercises
what only exists over HTTP: proxy gating for anonymous and student visitors,
every admin screen rendering, the audience model on the public calendar, and the
server actions themselves (create, reject, delete).

`verify-phase4.mts` checks the iCalendar wire format against hand-written fixtures
(CRLF, 75-octet folding, TEXT escaping, exclusive `DTEND`, floating times,
`SEQUENCE`) and then the feeds, subscribe screen and print view over HTTP.

`verify-phase5.mts` drives the notification service directly (create, dedupe, list,
count, mark one read, mark all read, and that one account can never touch another's
notices), then the reminder job over temporary events created exactly seven days and
one day out — asserting who was reminded, what the notices say, that a second run
creates nothing, and that department-scoped and staff-only events reach exactly the
right people. Finally it checks the HTTP surface: the redirect for anonymous
visitors, the header's unread badge against the database, a mark-as-read POST
driven as a no-JS browser would drive it, and the reminder endpoint's 401/503/200
behaviour. It removes every row it created and restores every read flag it flipped,
so the closing count comparison is against the state it found.

They print one PASS/FAIL line per assertion. The audit log is append-only by
design, so these scripts deliberately do not roll that table back.

## Deploying

Short version: **SQLite for local development and marking, Postgres for a
deployed instance.** SQLite cannot serve a serverless host (the filesystem is
ephemeral and read-only) and Prisma migration files are provider-specific, so
the two paths live side by side rather than one replacing the other. The full
runbook - which files differ between the two, the environment variables, the
cron configuration for the reminder job, rollback and backup, and a "before
this is public" checklist - is in [`docs/deployment.md`](docs/deployment.md).

Once something is running - a local production build now, a real deployment
later - verify it from the outside:

```bash
npm run build && npm run start -- -p 3100
BASE_URL=http://localhost:3100 npx tsx scripts/verify-deployment.mts
```

The smoke test checks the health endpoint, the public pages, the `.ics` feed,
that the admin area refuses anonymous visitors, the security headers, that HSTS
appears only over HTTPS, and that the sign-in page **does not advertise the demo
credentials** on a production target. It writes nothing.

## Security, accessibility and performance

The point of this section is that the claims are measured rather than asserted.

**Security.** Response headers are set for every route in `next.config.ts`: a
Content-Security-Policy, `nosniff`, `Referrer-Policy`, `X-Frame-Options`,
`Permissions-Policy`, and HSTS plus `upgrade-insecure-requests` in production only
(sending HSTS over plain-HTTP localhost would pin every other project on the machine
to HTTPS). Sign-in is throttled after five failed attempts for one address within
fifteen minutes, recorded in the database so the lockout survives a restart rather
than being cleared by the next deploy.

The full picture - assets, actors, every control with the file it lives in, the risks
that are accepted on purpose, and what a real deployment would still need - is in
[`docs/security-checklist.md`](docs/security-checklist.md).

**Accessibility.** A skip link and a `main` landmark on every page, an accessible
name on the unread badge, and a contrast audit that computes the WCAG ratio for each
foreground/background pair the UI uses, from Tailwind's own palette values. Body text
measures 4.77:1 to 17.84:1 and the status badges 4.87:1 to 5.51:1. The form-control
border was changed from `slate-300` (about 1.6:1, failing WCAG 1.4.11) to `slate-500`
(4.77:1), which is why the inputs look slightly darker than before.

**Performance.** On the production build the public calendar is **60 KB of HTML and
7.0 KB gzipped** - roughly 0.15 s of transfer on a 400 kbit/s connection - and its
data path runs **4 database queries**. A future N+1 would show up in
`scripts/measure-performance.mts` rather than being discovered by a student on a
phone.

```bash
npx tsx scripts/verify-phase6.mts         # headers, throttling, limits, a11y, contrast
npx tsx scripts/measure-performance.mts   # sizes, timings and the query count
```

## Data honesty

The seeded dates are **demonstration data**, not the official LASU calendar.
[`docs/seed-data-sources.md`](docs/seed-data-sources.md) records where each
2025/2026 date came from, reproduces the conflicting 2026/2027 commencement
claims as evidence of the problem this project addresses, and lists what must
be verified against the official published calendar before submission.

The project plan, requirements and research notes live in
[`docs/ACADEX-PLAN.md`](docs/ACADEX-PLAN.md).
