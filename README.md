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
  login/ register/ logout Auth pages and logout route
  admin/                  Admin dashboard (ADMIN role only)
  staff/                  Staff view scoped to faculty/department/level
components/               Shared UI: agenda items, chips, badges, revision timeline
lib/                      Data access and domain logic
  auth.ts                 Role checks (server-only, enforced on every request)
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
proxy.ts                  Coarse route protection for /admin and /staff
docs/                     ACADEX-PLAN.md (approved plan) and seed-data-sources.md
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

## Data honesty

The seeded dates are **demonstration data**, not the official LASU calendar.
[`docs/seed-data-sources.md`](docs/seed-data-sources.md) records where each
2025/2026 date came from, reproduces the conflicting 2026/2027 commencement
claims as evidence of the problem this project addresses, and lists what must
be verified against the official published calendar before submission.

The project plan, requirements and research notes live in
[`docs/ACADEX-PLAN.md`](docs/ACADEX-PLAN.md).
