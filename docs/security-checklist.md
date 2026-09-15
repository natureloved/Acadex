# Acadex security checklist

An honest account of what this project protects, how, and what it does not do.
Every control below is implemented in the code as it stands; the claims that could
not be tested are listed at the end rather than left implied.

_Last reviewed: 15 September 2026, against commit `304299b` + the Phase 6 work._

---

## What is worth stealing

| Asset | Where it lives | Why it matters |
| --- | --- | --- |
| User credentials | `User.passwordHash` (bcrypt, cost 12) | Passwords are reused elsewhere; a leak is a breach of other accounts |
| Session tokens | signed JWT in an httpOnly cookie | Whoever holds one is that user until it expires (7 days) |
| The calendar's integrity | `CalendarEvent`, `EventRevision`, `AuditLog` | A false examination date is the damage this whole project exists to prevent |
| Subscription tokens | `Subscription.icsToken` | **A bearer credential**: anyone with the URL reads that person's feed |
| `AUTH_SECRET` | `.env` (never committed; `.env.example` documents it) | Forging any session token |

## Who the actors are

| Actor | Capability | Motivating control |
| --- | --- | --- |
| Anonymous visitor | Can read public pages and the public `.ics` feed | Nothing sensitive may be reachable without a session |
| Signed-in student | Own notifications, own feed, published calendar | Cannot reach `/admin`, cannot read another user's notices |
| Signed-in staff | Staff-only events | Same, plus the staff view |
| Administrator | Full calendar management | All admin actions re-check the role server-side |
| Opportunistic attacker | Guessing passwords, probing URLs, replaying tokens | Throttling, fail-closed endpoints, 404s that reveal nothing |
| Curious student | Changing an `id` in a URL or a form field | Ownership checks in the query, not the UI |

## Controls

### Authentication and sessions

| Control | Where |
| --- | --- |
| Passwords hashed with bcrypt (cost 12), never stored or logged in clear | `lib/password.ts` |
| Identical response for a wrong password and an unknown account (no account enumeration) | `lib/credentials.ts` |
| Session is a signed JWT (HS256) in an httpOnly, sameSite=lax cookie, `secure` in production | `lib/session.ts` |
| The role and active flag are re-read from the database on every request, so deactivating a user revokes access immediately rather than at token expiry | `lib/auth.ts` |
| `AUTH_SECRET` shorter than 16 characters refuses to issue or verify sessions (fail closed) | `lib/session.ts` |
| Brute-force throttling: 5 failures per identifier per 15 minutes, recorded in the database so it survives a restart; a success clears them; blocked attempts are audited but do not extend the window | `lib/services/login-attempts.ts`, `lib/actions/auth.ts` |
| Sign-in failures and refusals are audited without recording the attempted password | `AuditLog` rows `LOGIN_FAILED`, `LOGIN_BLOCKED`, `LOGIN_SUCCEEDED` |

### Authorisation

| Control | Where |
| --- | --- |
| Coarse route gate for `/admin/**` and `/staff/**` | `proxy.ts` |
| Every protected page and every server action re-checks the role server-side; the gate is never the only control | `requireUser` / `requireRole` in `lib/auth.ts` |
| Self-registration always creates a `STUDENT`; the role is never read from the submitted form | `registerAction` |
| A user's query results are filtered by an audience rule shared by the pages, the feeds and the reminders | `canViewEvent` + `audienceScopeConditions` in `lib/events.ts` |
| Notifications are scoped by `userId` in the `where` clause of every read and update | `lib/services/notifications.ts` |
| Open-redirect protection on the post-login `next` parameter | `safeInternalPath` |

### Input handling

| Control | Where |
| --- | --- |
| Server actions are treated as public HTTP endpoints: every one re-validates its own input | `lib/actions/*` |
| Enum-like fields validated against `lib/constants.ts`, never trusted | `lib/services/*` |
| Length caps: title 200, description 5000, category name 60, CSV import 500 rows, audience entries 60 | `lib/services/events.ts`, `shared.ts`, `imports.ts` |
| Server-action request bodies capped at 512 KB by the framework | `next.config.ts` |
| The CSV import previews, then re-parses the raw text on confirm — the browser never hands back rows to be trusted | `lib/services/imports.ts` |
| Prisma parameterises every query; no SQL is built by concatenation anywhere | throughout |

### Transport and browser

| Control | Value | Notes |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `connect-src 'self'` | `script-src`/`style-src` allow `'unsafe-inline'` — see accepted risks |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Production only; sending it over plain-HTTP localhost would pin other local projects to HTTPS |
| `X-Content-Type-Options` | `nosniff` | |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | |
| `X-Frame-Options` | `DENY` | For browsers that predate `frame-ancestors` |
| `Permissions-Policy` | camera, microphone, geolocation, payment, usb all denied | |
| Feed responses | `Cache-Control: public, max-age=900` | The token is in the URL, so a cached response is scoped to one subscriber |

### Data integrity

| Control | Where |
| --- | --- |
| Every event change writes an append-only `EventRevision` with before/after snapshots | `lib/services/events.ts` |
| Every mutation writes an `AuditLog` row with actor, action and metadata | `lib/services/*` |
| Cancellations are never deleted; only drafts can be removed, and the removal is audited | `deleteDraftEvent` |
| Exactly one academic session may be active; enforced in a transaction | `lib/services/sessions.ts` |
| Multi-write operations run in a transaction | `$transaction` in the services |

### Operational

| Control | Where |
| --- | --- |
| The reminder job's endpoint fails closed: 503 when `CRON_SECRET` is unset, 401 otherwise, timing-safe comparison | `app/api/reminders/run/route.ts` |
| The diagnostics endpoint returns 404 in production and to non-administrators | `app/api/diagnostics/route.ts` |
| Unknown feed tokens return 404 with no confirmation that a token exists | `app/ics/[token]/route.ts` |
| Errors render a digest only — no message, no stack, no file paths | `app/error.tsx` |

## Accepted risks and deliberate limits

| Accepted | Why | What would fix it |
| --- | --- | --- |
| `script-src 'unsafe-inline'` | Next.js streams the App Router payload as inline scripts; without it the page is an empty shell. The codebase has no `dangerouslySetInnerHTML` and builds no HTML by concatenation, so there is no injection point | A nonce-based policy via `proxy.ts` on every document route (documented in `next.config.ts`) |
| `style-src 'unsafe-inline'` | Tailwind ships one stylesheet and `CategoryChip` sets a per-category colour through a `style` attribute | Move category colours to CSS custom properties |
| The subscription URL is a bearer credential | Calendar clients cannot log in; this is the same model Google and Outlook use for "secret addresses" | Short-lived, revocable tokens per device — the rotate button is the first step |
| Throttling is per-identifier, not per-address | `x-forwarded-for` is attacker-controlled without a trusted proxy in front | Add a per-address limit at the edge, where the address is trustworthy |
| A distributed attack across many addresses | Out of scope for a single-instance project | Shared counters (Redis) plus edge rate limiting |
| No email verification on registration | University accounts are issued and reconciled out of band | Verification flow, which needs a mail dependency |
| No CSRF token on server actions | Next.js verifies the `Origin` header for server-action requests; the session cookie is `sameSite=lax` | An explicit token if actions ever accept cross-origin posts |
| Email and SMS delivery | Out of scope by design (needs a provider dependency and credentials); the iCalendar feed covers "be told without visiting the site" | A mail provider plus templates, bounce handling and unsubscribe |

## What a production deployment still needs

1. **TLS termination and a real hostname.** HSTS is written but only takes effect over HTTPS.
2. **Secrets from a secret manager**, not a `.env` file, and a rotated `AUTH_SECRET`.
3. **PostgreSQL** instead of SQLite — `prisma/schema.prisma` documents the change — plus scheduled backups and tested restores.
4. **A scheduler** for the reminder job, and an alert if it stops firing (the `REMINDERS_RUN` audit row exists to make a silent scheduler visible).
5. **Monitoring and log retention.** `AuditLog` and `LoginAttempt` both grow forever today; both need a retention policy.
6. **The demo accounts removed.** `prisma/seed.ts` creates `admin@acadex.lasu.edu.ng` with a published password and the sign-in page advertises it. That is deliberate for marking and must not ship.
7. **An independent review** of the authorisation rules in `lib/events.ts`, which are the single place where "who may see what" is decided.

## Not verified

- Nothing was tested against a real Google, Outlook or Apple calendar client; the feed is verified as valid RFC 5545 by structure and by our own assertions.
- The 700 KB body-limit test observes a refusal in development (the framework logs `statusCode: 413` and the action never runs); the 413 status itself was not observed over HTTPS in production.
- The error boundary is asserted by source inspection (it never renders `error.message` or `error.stack`) rather than by contriving a runtime failure.
- No penetration test, no dependency audit beyond `npm audit` output, and no load testing.
