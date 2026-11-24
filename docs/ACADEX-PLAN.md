# Acadex Academic Calendar Management System

**Type:** Final Year Diploma Project (Computer Science, Faculty of Computing and Information Technology)
**Institution context:** Lagos State University (LASU)
**Authors:** Aliu Rashidat Olayemi (24280591102), Akinola Oluwatimileyin Oluwadamilare (24280591110)
**Supervisor:** Dr. Aiyeniko Olukayode
**Workspace:** `C:\Users\RastaDev\Desktop\Acadex`
**Status:** Planning (awaiting stack + scope confirmation)

---

## 1. What the brief actually asks for

The stated problem is **information dissemination of academic dates**, not timetabling and not
course registration. The system must let the school:

1. **Create** academic sessions, semesters and events (registration, lectures, exams, holidays, breaks, convocation, matriculation, deadlines).
2. **Manage** them (edit, reschedule, postpone, cancel, draft → publish).
3. **Publish** them so students and staff see the same authoritative version.

The three stated benefits map to three hard engineering requirements:

| Stated problem | Real engineering requirement |
| --- | --- |
| Keeps everyone informed of academic schedules | Public/authenticated read views + notification dispatch |
| Reduces confusion about important dates | Single source of truth + change history when dates move |
| Makes updating and sharing easier | Admin CRUD UI + bulk import + shareable/exportable calendar (ICS/PDF) |

**Non-goals (state these explicitly in Chapter 1 to protect scope):** no course registration,
no result processing, no fee payment, no LMS/lecture materials, no timetable optimisation.
These become "future work".

---

## 2. Research findings

### 2.1 LASU's current public approach (observed)

LASU publishes the approved calendar as a **static page**, then re-announces **extensions as
separate announcements**:

- `lasu.edu.ng/home/pages/?id=calendar` static "Academic Calendar" page.
- `lasu.edu.ng/home/news/read.php?id=576` "Approved Calendar for the 2025/2026 Academic Session" posted as news.
- `x.com/LASUOfficial` / `facebook.com/lasuinfo` "EXTENSION OF APPROVED ACADEMIC CALENDAR BY ONE (1) WEEK"; "Sessional Break shall now run from Monday, 27th July".

That is the failure mode Acadex addresses: **the calendar is a document, not a system.** The
original date stays stale on the page while the correction lives in a social post, forcing the
student to reconcile both. This is a defensible problem statement backed by observed evidence.

### 2.2 Published 2025/2026 LASU dates (seed-data candidates)

| Semester | Period | Activity |
| --- | --- | --- |
| First | Mon 15 Sep – Fri 3 Oct 2025 | Registration for new students (3 weeks) |
| First | Mon 6 Oct – Fri 19 Dec 2025 | Resumption + registration for returning students; lectures commence |
| First | Mon 22 Dec 2025 – Fri 2 Jan 2026 | End-of-year break (2 weeks) |
| First | to Thu 26 Feb 2026 | First semester ends (reported span 6 Oct 2025 – 26 Feb 2026) |
| Second | Mon 2 Mar – Fri 22 May 2026 | Resumption, registration and lectures (12 weeks) |
| Second | to Fri 26 Jun 2026 | Reported second-semester end |
| Second | extended by 1 week | Senate-approved extension |
| Session | Mon 27 Jul 2026 | Sessional break commences |

> **Verify before submission.** Aggregated from LASU official channels and third-party reposts;
> the calendar was revised twice. Treat as **seed/demo data**, re-check the official page, and
> cite the source in the documentation.

### 2.3 Comparable products (feature benchmark)

Commercial academic-calendar tooling converges on a recognisable feature set:

- Calendar views: month grid, week, agenda/list, "next up" countdown.
- Categorised events: exams, holidays, registration, deadlines, colour-coded.
- Subscription/export: ICS feed subscribable from Google Calendar / Outlook, plus PDF/print.
- Targeted reminders: email/push before key dates.
- Change communication: the differentiator in reviews when a date changes, tell subscribers *what changed*.

### 2.4 Stack discussion

- **Next.js + Prisma + Postgres** one deployable, server-rendered public calendar (good for
  SEO/shareability), typed end-to-end, migrations give you a printable schema history.
- **MERN (React + Express + MongoDB)** maximum familiarity, but needs a separate API deploy
  and a hosted Mongo (Atlas) account, and its schemaless nature weakens the "database design"
  chapter examiners like to probe.

### 2.5 Local environment (observed on this machine)

```
node v22.22.0   npm 10.9.4   git OK   python OK   dotnet OK
docker  --      psql --       mysql --  mongod --  php --
```

**No database server and no Docker installed locally.** Decisive consequence: the stack must
run with **zero local DB infrastructure** or the student cannot demo offline at the defence.
SQLite (dev) -> Postgres (deployed) via Prisma satisfies both.

---

## 3. Recommended approach

**Recommendation: Next.js (App Router) + TypeScript + Tailwind + Prisma, SQLite for local dev
and Postgres for deployment.**

Why this is the best fit:

1. **Runs offline on this machine with no extra installs.** SQLite is a file; `npm run dev` just works.
2. **One codebase, one language** every layer is explainable, no separate API host to break.
3. **Server-side rendering** for the public calendar = shareable links, matching how universities publish.
4. **Prisma migrations + typed schema** give the ER diagram and database-design chapter almost for free.
5. **Free deployment** (Vercel + Neon/Supabase Postgres) so there is a live URL in the report and the demo.

### 3.1 Architecture

```
Browser (students, staff, admin)
        |
        v
Next.js App Router (React Server Components + Server Actions)
        |
        |-- Public:  /calendar, /calendar/[id], /ics/[token]      (no auth)
        |-- Auth:    /login, /register                            (students self-register)
        |-- Admin:   /admin/sessions, /admin/events, /admin/import, /admin/audit
        |-- Staff:   /staff (scoped to their faculty/department)
        |
        v
Service layer (pure TS: recurrence expansion, ICS builder, conflict checks, audience matching)
        |
        v
Prisma ORM  -->  SQLite (dev)  |  PostgreSQL (prod)
        |
        v
Scheduler (node-cron / Vercel Cron) --> Reminder dispatch --> Email (Nodemailer/Resend) + in-app notifications
```

### 3.2 Data model (draft)

| Entity | Key fields |
| --- | --- |
| `User` | id, name, email(unique), passwordHash, role(ADMIN\|STAFF\|STUDENT), facultyId, departmentId, level, isActive, createdAt |
| `Faculty` | id, name, code |
| `Department` | id, name, code, facultyId |
| `AcademicSession` | id, name (`2025/2026`), startDate, endDate, isActive |
| `Semester` | id, sessionId, type(FIRST\|SECOND), startDate, endDate |
| `EventCategory` | id, name, slug, color, icon |
| `CalendarEvent` | id, title, description, categoryId, semesterId, startAt, endAt, allDay, location, status(DRAFT\|PUBLISHED\|CANCELLED), visibility(PUBLIC\|STAFF_ONLY), scope(ALL\|FACULTY\|DEPARTMENT\|LEVEL), createdById, publishedAt, version |
| `EventTarget` | eventId, targetType, targetId many-to-many targeting of faculty/department/level |
| `EventRevision` | id, eventId, changedById, changedAt, changeType(CREATED\|UPDATED\|PUBLISHED\|RESCHEDULED\|CANCELLED), diff (JSON before/after) |
| `Subscription` | id, userId, icsToken, scope filters, createdAt |
| `Notification` | id, userId, eventId, type, channel, sentAt, status |
| `AuditLog` | id, actorId, action, entity, entityId, meta, createdAt |

The **`EventRevision` table is the technical heart of the project.** It turns "reduces confusion
about important dates" from a claim into a demonstrable feature: every reschedule keeps a
before/after snapshot, the public page shows a "changed" badge plus a change note, and the
reminder job can notify exactly the users affected by that change.

### 3.3 Feature set

**MVP must ship (this is what you demo):**

1. Auth + RBAC (admin / staff / student), hashed passwords, protected routes.
2. Admin CRUD: sessions -> semesters -> events, with draft -> publish workflow.
3. Conflict validation: end >= start; overlap detection within a semester; warn on clashing exam windows.
4. Audience targeting: whole school, or a specific faculty / department / level.
5. Student + staff views: **month grid**, **agenda list**, **upcoming countdown**, category colour coding, filters (semester, category, faculty, level, date range), search.
6. **ICS subscription feed** (`/ics/<token>.ics`) that works in Google Calendar / Outlook, plus per-event "Add to calendar" and whole-calendar `.ics` download.
7. **PDF/print export** of a semester calendar.
8. **Reminders:** scheduled dispatch at T-7 days / T-1 day for high-priority categories; in-app notification centre.
9. **Change notices:** reschedule/cancel an event -> affected subscribers notified, event shows its revision history.
10. Audit log + admin dashboard KPIs (events this week, next deadline, upcoming exams).

**Stretch only if time allows (otherwise "future work"):**
SMS via Termii/Twilio, PWA + offline caching, two-way Google Calendar API sync, department-authored
events with approval workflow, analytics dashboard, multi-institution (tenant) support.

### 3.4 Non-functional requirements to state and test

- **Mobile-first responsive** the primary user is a student on a phone.
- **Low-bandwidth friendly** minimal client bundle, works on 3G; server-rendered public page.
- **Accessibility** WCAG AA contrast, keyboard-navigable calendar grid, semantic markup.
- **Performance target** public calendar first paint < 2.5s on throttled 3G.
- **Security** bcrypt/argon2 hashes, httpOnly/sameSite session cookies, server-side validation on every mutation, rate-limited login, role checks in the service layer (not just the UI).
- **Data integrity** Prisma migrations as versioned schema history.

---

## 4. Deliverables

### 4.1 Working software
- Source repository in this workspace (Next.js app, seeded demo data, README with setup steps).
- Seeded with a realistic LASU 2025/2026 calendar so the demo is instantly convincing.
- Deployed live URL (Vercel + Neon/Supabase free tier).

### 4.2 Project documentation (the examinable artefact)
Standard Nigerian CS final-year structure, written from the real implementation:

- **Front matter:** title page, declaration, certification, dedication, acknowledgements, abstract, TOC, list of figures/tables.
- **Chapter 1 Introduction:** background, problem statement (use the observed LASU re-announcement evidence), aim and objectives, scope and limitations, significance, definition of terms.
- **Chapter 2 Literature Review:** academic calendar systems, existing LASU process, comparable platforms, the iCalendar/ICS standard, RBAC, notification systems, summary and gap.
- **Chapter 3 System Analysis & Design:** methodology (Agile/incremental), data collection (questionnaire + interview + observation of the registry process), existing-system analysis, requirements, **Use Case, ERD, DFD level 0/1/2, class diagram, sequence diagram, architecture, UI mockups**, database schema, input/output design.
- **Chapter 4 Implementation & Testing:** stack justification, key code excerpts (ICS builder, reminder scheduler, revision tracking), screenshots, **test tables**: unit, integration, UAT with real students/staff, performance, security; usability evaluation (SUS score) examiners like numbers.
- **Chapter 5 Summary, Conclusion & Recommendation:** achievements vs objectives, limitations, future work.
- **Back matter:** references (APA), appendices (source code listing, questionnaire, sample output, user guide).

### 4.3 Diagrams
Diagram sources committed under `docs/diagrams/` so they can be exported to PNG for the report.

---

## 5. Delivery plan

| Phase | Output |
| --- | --- |
| 0. Confirm decisions | Stack, DB, deployment, deadline |
| 1. Scaffold | Next.js + Tailwind + Prisma + SQLite, auth, layout, local dev working |
| 2. Core data | Schema, migrations, seed (LASU 2025/2026), faculties/departments |
| 3. Admin | Session/semester/event CRUD, draft->publish, targeting, conflict checks, CSV import, audit |
| 4. Public + student | Calendar grid, agenda, filters, search, event detail with revision history |
| 5. Interop | ICS feed, download, "add to calendar", PDF/print export |
| 6. Notifications | Scheduler, reminder rules, in-app centre, email, change notices |
| 7. Hardening + tests | Validation, security pass, test suite, usability run, performance check |
| 8. Docs + deploy | Chapters 1-5, diagrams, screenshots, live deploy, demo script |

Roughly **6–8 weeks part-time**, or 3–4 weeks full-time.

---

## 6. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Scope creep into registration/results/LMS | Non-goals section in Chapter 1; stretch list parked as future work |
| No local DB / Docker | SQLite for dev, Postgres only in deployment |
| Email delivery unreliable during demo | In-app notification centre is primary; email secondary and logged |
| LASU dates change again | That is the *feature* revision history + change notices |
| Supervisor expects PHP/Laravel or MERN | Architecture is stack-portable; confirm before Phase 1 (decision D1) |
| "It's just a CRUD app" criticism | Revision tracking, ICS/calendar interop, audience targeting, scheduling and evaluation are the depth |

---

## 7. Decisions needed

| # | Decision | Recommended default |
| --- | --- | --- |
| D1 | Stack | Next.js + TypeScript + Tailwind + Prisma |
| D2 | Database | SQLite (dev) + Postgres (deployed) |
| D3 | Deployment | Vercel + Neon/Supabase free tier |
| D4 | Documentation | Full Chapters 1–5 + diagrams committed in `docs/` |
| D5 | Deadline | Needed to sequence the phases |
| D6 | Supervisor constraints | Any department-mandated stack, format, or chapter template |
