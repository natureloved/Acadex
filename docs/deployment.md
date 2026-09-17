# Deploying Acadex

A runbook for putting this project on the internet. It is written to be followed
without guessing, and it separates two things that are easy to conflate:

- what is **already done** in the repository, and
- what needs **your accounts** and your decisions.

Nothing here has been executed for you. The project has never been deployed — what
*has* been verified is the production build, the deployment smoke test against it,
and the hardening documented in [`security-checklist.md`](./security-checklist.md).

---

## 0. What you need

| Thing | Why | Notes |
| --- | --- | --- |
| A Git host | Deployment platforms build from a repository | Already done: `https://github.com/natureloved/Acadex` |
| A hosting account | To run the app | Vercel's free tier is enough; the steps below assume it |
| A Postgres database | SQLite cannot work on a serverless host | Neon or Supabase free tier |
| A secret or two | Session signing, and the reminder job | You generate them; they live only in the host's environment settings |

---

## 1. The database decision

**The local setup uses SQLite. A deployment must not.** That is not a preference,
it is a constraint: a serverless host gives the application an ephemeral,
effectively read-only filesystem, so `dev.db` would be recreated empty on every
cold start and no two instances would agree about the data.

There is a second thing to know before starting, and it is the one that catches
people out:

> **Prisma migrations are provider-specific.** The files in `prisma/migrations/`
> are SQLite SQL — `TEXT`, `INTEGER`, `PRAGMA` and so on. They cannot be applied to
> Postgres. A Postgres deployment needs **its own migration history**, produced
> against the Postgres database.

That means the two paths live side by side rather than one replacing the other,
and only these differ:

| File | Local (SQLite, for offline marking) | Deployed (Postgres) |
| --- | --- | --- |
| `prisma/schema.prisma` | `provider = "sqlite"` | `provider = "postgresql"` |
| `lib/db.ts` | `@prisma/adapter-better-sqlite3` | `@prisma/adapter-pg` |
| `package.json` | already installed | needs `@prisma/adapter-pg` as a dependency |
| `prisma/migrations/` | SQLite history | Postgres history |
| `prisma/seed.ts` | `file:./dev.db` | the Postgres `DATABASE_URL` |

### Recommended way to keep both

Keep `main` on SQLite so the marking environment works offline, and treat Postgres
as a deployment branch:

```bash
# on a branch, e.g. `deploy/postgres`
npm install @prisma/adapter-pg
# edit prisma/schema.prisma -> provider = "postgresql"
# edit lib/db.ts        -> use PrismaPg instead of PrismaBetterSqlite3
# point DATABASE_URL at the Postgres instance, then create the Postgres history:
npx prisma migrate dev --name init
npx prisma migrate deploy      # what the host runs
```

`lib/db.ts` is the only file that needs code changes, and it is deliberately small:
it constructs one client and exports it.

---

## 2. Environment variables

| Variable | Required | What it does | If it is missing |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | The database connection string | The app refuses to start: `lib/db.ts` throws a message telling you to copy `.env.example` |
| `AUTH_SECRET` | yes | Signs and verifies session cookies | Nobody can sign in; `lib/session.ts` refuses to issue or verify a session when the secret is absent or shorter than 16 characters |
| `CRON_SECRET` | for reminders | Authorises the reminder endpoint | `/api/reminders/run` returns **503** and does nothing — it fails closed on purpose |
| `NODE_ENV` | set by the host | Enables production behaviour: HSTS, secure cookies, and suppressing the demo-credentials panel on the sign-in page | Defaults to development behaviour, which would advertise the demo password |
| `ALLOW_DESTRUCTIVE_SEED` | never in production | Opt-in that lets `prisma/seed.ts` run with `NODE_ENV=production` | Correct behaviour: the seed refuses to run and says why |

Generate a secret with any of:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
openssl rand -base64 48
```

**Use a different value from the one in your local `.env`.** The local one has been
on a developer machine; a deployed instance should not share it.

---

## 3. Deploying

1. **Create the database.** On Neon or Supabase, create a project and copy the
   connection string. Add `?sslmode=require` if the provider does not include it.
2. **Prepare the Postgres branch** as in section 1, and push it.
3. **Import the repository** at the host (Vercel: *Add New → Project → Import*).
   Framework preset: Next.js. Build command `next build` (the default). Leave the
   output directory alone.
4. **Set the environment variables** from section 2 in the host's dashboard —
   *not* in the repository. `.env` is git-ignored and must stay that way.
5. **Apply the migrations** against the deployed database. Either let the platform
   run `npx prisma migrate deploy` as part of the build command, or run it once
   from your machine with `DATABASE_URL` pointing at the deployed database.
   `prisma generate` already runs on `postinstall`, so the client exists before
   `next build`.
6. **Do not seed.** The seed creates accounts whose password is published in this
   repository, and it deletes everything first. If you want demo content on a
   public deployment, create one administrator by hand instead.
7. **Deploy**, then verify with section 5.

### A note on the `prisma` CLI in production

`prisma` is a dev dependency. If the host's build runs `prisma migrate deploy`, make
sure it is available at build time (it is, by default, on Vercel — dev dependencies
are installed for the build). If your host strips them, move `prisma` to
`dependencies` or run migrations from outside the build.

---

## 4. Scheduling the reminders

The reminder job is `POST`/`GET /api/reminders/run` and it fails closed: with no
`CRON_SECRET` configured it returns 503, and with the wrong secret 401. It must run
at least daily.

**Vercel** — add `vercel.json` at the repository root:

```json
{
  "crons": [
    {
      "path": "/api/reminders/run",
      "schedule": "0 6 * * *"
    }
  ]
}
```

Vercel's cron requests include the secret automatically when `CRON_SECRET` is set
as an environment variable for the project.

**Any other host, or a machine** — a daily crontab line:

```cron
0 6 * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://your-app.example.com/api/reminders/run
```

**Windows Task Scheduler** (matching the local development habit):

```powershell
schtasks /create /tn "Acadex reminders" /tr "powershell -Command \"Invoke-RestMethod -Method Post -Uri https://your-app.example.com/api/reminders/run -Headers @{ 'x-cron-secret' = 'YOUR_SECRET' }\"" /sc daily /st 06:00
```

Or run the job directly without HTTP, which is what `npm run reminders` does:

```powershell
schtasks /create /tn "Acadex reminders" /tr "cmd /c cd C:\path\to\Acadex && npm run reminders" /sc daily /st 06:00
```

Either way, **the job is idempotent**: running it twice in a row creates nothing
the second time, so a duplicate schedule or a retry is harmless. Each run writes one
`REMINDERS_RUN` row to the audit log — which is how you can tell whether a silent
scheduler has stopped firing.

---

## 5. Verifying a deployment

```bash
BASE_URL=https://your-app.example.com npx tsx scripts/verify-deployment.mts
```

It checks the health endpoint, the main pages, the public calendar feed, that the
admin area refuses anonymous visitors, that the security headers are present, that
HSTS appears only over HTTPS, and — importantly — that **the sign-in page no longer
advertises the demo credentials**. It writes nothing.

Then, by hand:

1. **Subscribe from a real calendar.** Open `/subscribe` while signed in, copy the
   `webcal://` address into Google Calendar or Outlook, and confirm the events
   arrive. Then cancel one event in the admin area and confirm the calendar
   removes it — that is the whole point of the project, and it is the one thing no
   script here can check for you.
2. **Trigger the reminder job** and read the response: `{"ok":true,...,"t7":n,"t1":n,"skipped":n}`.
3. **Check the health endpoint** returns 200 with `"database":"up"`.
4. **Sign in as a real account** and confirm the demo panel is absent.

---

## 6. Rollback and backups

- **Application rollback.** Redeploy the previous successful build from the host's
  dashboard, or push a revert commit. Both are one click or one command.
- **Database rollback is not the same thing.** `prisma migrate deploy` is
  forward-only; there is no automatic down-migration. Take a backup (Neon and
  Supabase both offer point-in-time restore on paid tiers and manual snapshots on
  free ones) **before** applying a migration.
- **The seed is destructive.** It deletes every row before recreating demo data.
  Never run it against a database whose contents matter, and never with
  `ALLOW_DESTRUCTIVE_SEED=1` on a deployed instance.
- **Rotating `AUTH_SECRET` signs everyone out.** That is the intended way to
  invalidate every session at once.

---

## 7. Before this is public

- [ ] Seeded demo accounts **removed or disabled** — `admin@acadex.lasu.edu.ng`,
      `staff@acadex.lasu.edu.ng`, `student@acadex.lasu.edu.ng` all use
      `Password123!`, which is published in this repository.
- [ ] A fresh `AUTH_SECRET`, different from every value that has appeared in a
      chat, a report or a screenshot.
- [ ] A `CRON_SECRET` set, and the schedule actually running.
- [ ] `NODE_ENV=production` on the host, so HSTS, secure cookies and the hidden
      demo panel all take effect.
- [ ] The published LASU dates replaced with the Senate-approved calendar — the
      current 2026/2027 seed dates are marked `PROVISIONAL` in `prisma/seed.ts`
      because no authoritative source could be established.
- [ ] A backup taken, and one restore rehearsed.

---

## 8. What is still unverified

Stated plainly so nobody assumes otherwise:

- The project has **never been deployed**. Everything above is a plan plus the
  parts that could be checked locally: the production build, the smoke test against
  it, and the hardening in `security-checklist.md`.
- **The Postgres path has not been executed.** It is documented, not tested; the
  `@prisma/adapter-pg` dependency is deliberately not installed yet.
- **No reminder scheduler is installed** on any machine.
- **No real Google, Outlook or Apple calendar client** has been used against the
  feed.
