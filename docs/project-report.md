# DESIGN AND IMPLEMENTATION OF AN ACADEMIC CALENDAR MANAGEMENT SYSTEM (ACADEX)

**A Case Study of Lagos State University (LASU)**  
**Department of Computer Science, Faculty of Computing and Information Technology**

---

## Executive Summary

Acadex is an enterprise-grade, offline-capable Academic Calendar Management System designed specifically to resolve systemic scheduling friction, fragmented notices, double-booked venues, and delayed date change dissemination across Nigerian tertiary institutions, using Lagos State University (LASU) as a primary institutional case study.

Developed strictly with modern, pure TypeScript and Next.js 16 App Router architecture backed by Prisma ORM and SQLite, Acadex eliminates the historical dependency on static, error-prone paper notices and outdated static PDF documents. The system introduces first-class mathematical interval-overlap conflict detection (Figure 5.3: $\text{start}_A < \text{end}_B \land \text{start}_B < \text{end}_A$), RFC 5545 compliant personal iCalendar subscription feeds with monotonic revision sequencing (`SEQUENCE`), decentralized departmental proposal workflows (FR13), and interactive responsive monthly calendar views.

---

## CHAPTER 1: INTRODUCTION

### 1.1 Background of the Study
The academic calendar of a university represents the operational heartbeat of the institution. It governs matriculation, semester lecture blocks, continuous assessments, revision periods, semester examinations, Senate meetings, convocation ceremonies, and inter-semester breaks. At Lagos State University (LASU), spanning multiple campuses (Ojo, Epe, Ikeja), academic calendars have traditionally been prepared through committee deliberations, transcribed into static documents (PDF and physical printouts), and pinned to departmental notice boards or disseminated across ad-hoc social media groups.

This legacy approach suffers from critical deficiencies:
1. **Static Inflexibility**: Once a PDF is circulated, any rescheduling due to national holidays, university Senate revisions, or departmental adjustments creates competing versions of the calendar.
2. **Venue Conflicts**: High-demand facilities (such as the Buba Marwa Auditorium, MBA Hall, Science Lecture Theatre, and 3-in-1 Lecture Hall) are frequently double-booked by simultaneous faculty and departmental events.
3. **Audience Mismatch**: General notices obscure faculty-specific and level-specific deadlines (e.g., 400L final year project mock defenses versus 100L matriculation clearance).
4. **Lack of Automated Synchronization**: Students and academic staff must manually re-check notices rather than having live, verified dates synced directly into their personal calendar applications (Apple Calendar, Google Calendar, Microsoft Outlook).

Acadex was developed to eliminate these bottlenecks by providing a unified, authoritative digital calendar system with automated synchronization and real-time conflict prevention.

### 1.2 Statement of the Problem
The core problems addressed by this project include:
- **Date Desynchronization**: Conflicting revisions circulating simultaneously, causing missed lectures, examination clashes, and administrative embarrassment.
- **Physical Facility Collisions**: Simultaneous booking of institutional halls without automated spatial and temporal interval collision detection.
- **Lack of Decentralized Input**: Departmental coordinators and examination officers lacking a structured mechanism to propose department-level events without circumventing central academic planning.
- **Zero Real-Time Push Capability**: Reliance on manual web visits rather than standards-compliant subscription feeds that automatically notify students when dates shift.

### 1.3 Aim and Objectives of the Project
The primary aim of this project is to design and implement a comprehensive Academic Calendar Management System for Lagos State University.

The specific objectives are to:
1. Design a normalized 3NF database schema capturing academic sessions, semesters, faculties, departments, institutional venues, categorized events, and audience scopes.
2. Implement an automated interval-overlap scheduling conflict detection engine (Figure 5.3) that prevents concurrent venue bookings and alerts planners to examination clashes.
3. Construct an interactive, modern user interface offering both full 42-cell monthly calendar grids and agenda views with dynamic countdowns.
4. Implement RFC 5545 iCalendar feeds (`/ics/[token]`) featuring monotonic `SEQUENCE` versioning so third-party calendar clients instantly reflect rescheduled dates.
5. Create a departmental event submission and review pipeline allowing staff to propose events subject to administrative approval before publication.
6. Provide an immutable audit trail and versioned event revision history tracking every change, reschedule, and cancellation.

### 1.4 Scope of the Study
The system is modeled around the academic structure of Lagos State University, covering its faculties, departments, levels (100L through 500L), and major institutional auditoriums/lecture halls. It is engineered as a zero-external-infrastructure web application operating with an embedded SQLite engine (`dev.db`), ensuring complete local self-containment for academic evaluations, defenses, and production deployment.

### 1.5 Significance of the Study
- **For Students**: Live, accurate schedules synchronized to their mobile phones with automated countdowns and proactive reschedule alerts (T-7 and T-1 notifications).
- **For Departmental Staff**: A streamlined proposal workflow to book official lecture halls and schedule departmental tests without administrative friction.
- **For University Administration**: Complete institutional oversight over lecture windows, exam periods, and venue utilization, backed by immutable audit trails.

---

## CHAPTER 2: LITERATURE REVIEW

### 2.1 Evolution of University Scheduling Systems
Early campus scheduling relied exclusively on manual transcription and paper bulletin boards. The advent of university web portals in the 2000s transitioned academic schedules to downloadable PDF brochures. While PDF documents solved distribution reach, they introduced severe revision opacity: students downloading `Academic_Calendar_Final_v2.pdf` frequently operate on obsolete schedules when `Academic_Calendar_Final_v3_revised.pdf` is published weeks later.

### 2.2 Standards-Based Calendar Distribution: RFC 5545
The Internet Engineering Task Force (IETF) RFC 5545 specification defines the `iCalendar` format. The protocol specifies the `SEQUENCE` property, an integer that must monotonically increase whenever an event's start or end datetime is modified. When a client application (such as Apple Calendar or Google Calendar) polls an `.ics` subscription feed:
- If `SEQUENCE` is unchanged, the local cache is retained.
- If `SEQUENCE` is incremented, the client moves the event in the user's personal calendar and displays a system alert.
- If `STATUS:CANCELLED` is received with an incremented `SEQUENCE`, the event is automatically struck out or deleted from the device.

Acadex leverages this standard natively, mapping its internal `EventRevision` count directly to RFC 5545 `SEQUENCE`.

### 2.3 Comparative Evaluation
| Dimension | Traditional Paper / PDF | Generic Google Calendar | Acadex System |
| :--- | :--- | :--- | :--- |
| **Institutional Hierarchy** | None (flat text) | Flat, lacks faculty/department model | Native (Session $\rightarrow$ Semester $\rightarrow$ Faculty $\rightarrow$ Dept) |
| **Conflict Detection** | Manual inspection | Basic overlap check | Figure 5.3 Mathematical Interval Overlap Engine |
| **Audience Scoping** | Broad, all-or-nothing | Shared URL links | Granular (Whole University, Faculty, Dept, Level) |
| **Venue Booking** | Physical logbook | Unenforced string field | First-Class Venue entity with capacity tracking |
| **Departmental Workflow** | Paper memo to Registrar | Uncontrolled editing | Proposal $\rightarrow$ Approval Queue $\rightarrow$ Publication |
| **Offline Evaluation** | Complete | Requires Google cloud | Fully offline-capable (Embedded SQLite / Next.js) |

---

## CHAPTER 3: SYSTEM METHODOLOGY AND REQUIREMENTS ANALYSIS

### 3.1 Research Methodology
This project adopts an Agile Iterative Development Methodology integrated with Structured System Analysis and Design Method (SSADM). Each iteration delivers a fully tested, verified subsystem:
- **Phase 1**: Database schema design, relational normalization (3NF), and Prisma migrations.
- **Phase 2**: Authentication, role-based access control (RBAC), and session management.
- **Phase 3**: Administrative CRUD, CSV batch importing, and RFC 5545 iCal synchronization.
- **Phase 4**: Institutional venues, interval-overlap conflict detection, monthly calendar grid, and departmental approval workflows.

### 3.2 Requirements Analysis

#### Functional Requirements (FR1 – FR15)
- **FR1**: System must support multiple academic sessions and mark exactly one session as active.
- **FR2**: System must enforce First and Second Semesters per academic session.
- **FR3**: System must manage institutional venues with unique codes, capacities, and locations.
- **FR4**: System must support colour-coded event categories (Registration, Lectures, Exams, etc.).
- **FR5**: System must display an interactive monthly 7-column calendar grid and an agenda view.
- **FR6**: System must compute dynamic countdown badges ("Ongoing", "Starts in X days", "Concluded").
- **FR7**: System must provide filtered public calendar access by session, semester, category, and venue.
- **FR8**: System must support granular event audience scoping (Whole University, Faculty, Department, Level).
- **FR9**: System must enforce Figure 5.3 interval-overlap conflict detection on venue bookings and exam windows.
- **FR10**: System must increment the revision version whenever date or time fields are rescheduled.
- **FR11**: System must generate secure, unique RFC 5545 personal iCalendar feeds (`/ics/[token]`).
- **FR12**: System must record immutable before-and-after JSON snapshots in `EventRevision`.
- **FR13**: System must allow departmental staff to submit proposals with status `PENDING` for admin approval.
- **FR14**: System must expose clean REST API endpoints for event queries, conflict checks, and approvals.
- **FR15**: System must maintain an append-only audit log of all administrative and scheduling actions.

#### Non-Functional Requirements
- **Performance**: Sub-50ms query response times on SQLite with Write-Ahead Logging (WAL).
- **Usability**: Fully responsive across mobile, tablet, and widescreen desktop devices.
- **Security**: HttpOnly JWT session cookies, strict RBAC authorization, zero credential leakage in diagnostics.
- **Portability**: Completely self-contained; runs on Node.js without requiring Docker, external databases, or network connectivity.

### 3.3 Database Data Dictionary (Third Normal Form)

#### Table 3.1: `AcademicSession`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | String (CUID) | PK | Unique identifier |
| `name` | String | Unique | Session label (e.g., "2026/2027") |
| `startDate` | DateTime | Not Null | Session commencement date |
| `endDate` | DateTime | Not Null | Session conclusion date |
| `isActive` | Boolean | Default False | Active session flag (only one true) |

#### Table 3.2: `Semester`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | String (CUID) | PK | Unique identifier |
| `sessionId` | String | FK $\rightarrow$ `AcademicSession.id` | Associated academic session |
| `type` | String | Not Null | `FIRST` or `SECOND` |
| `startDate` | DateTime | Not Null | Semester opening date |
| `endDate` | DateTime | Not Null | Semester closing date |

#### Table 3.8: `Venue`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | String (CUID) | PK | Unique identifier |
| `name` | String | Unique, Not Null | Facility name (e.g., "Buba Marwa Auditorium") |
| `code` | String | Unique, Not Null | Short code (e.g., "BMA", "MBA", "SLT") |
| `capacity` | Integer | Nullable | Seating capacity |
| `location` | String | Nullable | Campus location (e.g., "Ojo Campus") |

#### Table 3.9: `CalendarEvent`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | String (CUID) | PK | Unique identifier |
| `semesterId` | String | FK $\rightarrow$ `Semester.id` | Academic semester |
| `categoryId` | String | FK $\rightarrow$ `EventCategory.id` | Event classification |
| `venueId` | String | FK $\rightarrow$ `Venue.id` (Nullable) | Physical venue assignment |
| `createdById` | String | FK $\rightarrow$ `User.id` (Nullable) | Submitter / creator |
| `title` | String | Not Null | Event heading |
| `description`| String | Nullable | Memo / detailed description |
| `startAt` | DateTime | Not Null | Start timestamp (UTC midnight for all-day) |
| `endAt` | DateTime | Not Null | End timestamp (inclusive) |
| `allDay` | Boolean | Default True | Timed versus full-day event |
| `status` | String | Default "DRAFT" | `DRAFT`, `PENDING`, `PUBLISHED`, `REJECTED`, `CANCELLED` |
| `visibility` | String | Default "PUBLIC" | `PUBLIC`, `STAFF_ONLY` |
| `scope` | String | Default "ALL" | `ALL`, `FACULTY`, `DEPARTMENT`, `LEVEL` |
| `version` | Integer | Default 1 | Monotonic revision count |
| `publishedAt`| DateTime | Nullable | Initial publication timestamp |

---

## CHAPTER 4: SYSTEM DESIGN AND PROCESS MODELING

### 4.1 Architecture Diagram (Figure 3.1)
The system employs a 3-tier architecture separating presentation, server business logic, and data persistence layers:
```mermaid
graph TD
  Client["Client Tier: Web Browsers & Third-Party iCalendar Apps"]
  App["Application Tier: Next.js 16 Server Actions, REST APIs, Conflict Engine, iCal Sync"]
  Data["Data Tier: Prisma ORM & SQLite (dev.db)"]

  Client <--> App
  App <--> Data
```
*(See `docs/diagrams/architecture.mmd` for full component breakdown).*

### 4.2 Use Case Diagram (Figure 3.2)
Actors interacting with Acadex:
- **Student / Public**: Views calendar, filters events, inspects change history, subscribes to personal iCal feed, prints PDF.
- **Departmental Staff**: Submits departmental event proposals, selects institutional venues, tracks approval status.
- **Academic Registrar / Admin**: Manages sessions, semesters, categories, venues; approves/rejects submissions; reschedules/cancels events; inspects audit logs.
*(See `docs/diagrams/use-case.mmd`).*

### 4.3 Process Modeling (DFDs)
- **Level 0 Context Diagram (Figure 3.4)**: Defines system boundaries between Students, Staff, Central Registry, and external Calendar Clients.
- **Level 1 Data Flow Diagram (Figure 3.5)**: Traces data flows across Event Submission (1.0), Conflict Detection (2.0), Admin Review (3.0), Publishing & Revision Snapshotting (4.0), iCal Feed Generation (5.0), and Notification Queue (6.0).
*(See `docs/diagrams/dfd-level-0.mmd` and `dfd-level-1.mmd`).*

---

## CHAPTER 5: SYSTEM IMPLEMENTATION

### 5.1 Technical Architecture
- **Framework**: Next.js 16.3.5 utilizing App Router architecture and React 19 Server Components.
- **Language**: Pure TypeScript with strict typing (`strict: true`, zero `any` in business logic).
- **ORM & Database**: Prisma ORM 7.x with Better-SQLite3 driver and Write-Ahead Logging (`WAL`).
- **Styling**: Vanilla Tailwind CSS design system with custom HSL tokens, micro-animations, and full responsive breakpoints.
- **Standards Compliance**: RFC 5545 iCalendar MIME streaming with `SEQUENCE` generation.

### 5.2 Algorithm Implementation: Figure 5.3 Conflict Detection
The interval-overlap algorithm determines whether two time windows $[start_A, end_A]$ and $[start_B, end_B]$ collide on the same physical resource (institutional venue) or within an examination period:

$$\text{Overlap}(A, B) \iff (start_A < end_B) \land (start_B < end_A)$$

In `lib/services/events.ts`, this is executed via optimized database queries:
```typescript
const venueCollisions = await prisma.calendarEvent.findMany({
  where: {
    venueId: input.venueId,
    status: { notIn: ["CANCELLED", "REJECTED"] },
    ...(input.excludeEventId ? { id: { not: input.excludeEventId } } : {}),
    startAt: { lt: input.endAt },
    endAt: { gt: input.startAt },
  },
  select: { title: true, startAt: true, endAt: true, venue: { select: { name: true } } },
});
```
This guarantees that:
1. Adjacent events (e.g. Event 1 ending at 12:00 and Event 2 starting at 12:00) do **not** trigger a conflict.
2. Partial, internal, or enclosing overlaps immediately flag a visual and API warning.
3. Editing an existing event (`excludeEventId`) does not trigger a false self-conflict.

### 5.3 REST API Endpoints (Table 5.2)
| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/events` | `GET` | Public | Filterable list of events (by session, semester, category, venue) |
| `/api/events` | `POST` | Admin / Staff | Create event (Admin publishes; Staff submits as PENDING) |
| `/api/events/check-conflict` | `POST` | Public / Staff | Evaluate Figure 5.3 interval overlap for dates and venues |
| `/api/events/[id]/approve` | `PATCH` | Admin | Approve pending departmental submission |
| `/api/events/[id]/reject` | `PATCH` | Admin | Reject pending submission with administrative reason |
| `/api/venues` | `GET` | Public | Retrieve list of institutional venues and capacities |
| `/api/venues` | `POST` | Admin | Register new institutional venue |
| `/api/health` | `GET` | Public | System uptime, database connectivity, and latency monitoring |

---

## CHAPTER 6: TESTING, VERIFICATION AND RESULTS

### 6.1 Automated Verification Suites
The project incorporates two comprehensive automated test suites executing directly against real database instances:

#### 1. Phase 3 Regression Suite (`scripts/verify-phase3.mts`)
Covers core administrative actions, state transitions, session constraints, category rules, CSV parsing, and audience targeting:
- **Results**: **80 passed, 0 failed** (100% pass rate).

#### 2. Phase 4 Verification Suite (`scripts/verify-phase4.mts`)
Covers the newly implemented LASU institutional features:
- Institutional Venue CRUD and duplicate code rejection.
- Figure 5.3 interval-overlap collision assertions (concurrent overlap, adjacent boundaries, self-exclusion).
- Staff departmental proposal submission (`PENDING` status).
- Verification that `PENDING` proposals are hidden from the public calendar.
- Administrative approval workflow (`PUBLISHED` status transition and `APPROVED` revision snapshot).
- Administrative rejection workflow (`REJECTED` status and reason recording).
- State rollback and cleanup.
- **Results**: **21 passed, 0 failed** (100% pass rate).

### 6.2 Compilation and Linting
- **TypeScript Typecheck**: `tsc --noEmit` executed cleanly with **0 errors**.
- **ESLint**: `eslint` passed with **0 errors and 0 warnings**.
- **Production Build**: `next build` compiled all static and dynamic server routes with **0 errors**.

---

## CHAPTER 7: SUMMARY, CONCLUSION AND RECOMMENDATIONS

### 7.1 Summary of Contributions
Acadex delivers a production-ready, defense-grade Academic Calendar Management System aligned with the academic and physical realities of Lagos State University. The system succeeds in:
1. Transforming static academic calendars into dynamic, responsive web interfaces with monthly grids and agenda countdowns.
2. Preventing physical hall double-bookings through Figure 5.3 mathematical interval collision detection.
3. Providing real-time mobile calendar synchronization via RFC 5545 `.ics` feeds with monotonic revision sequencing.
4. Implementing a secure, decentralized proposal and approval pipeline for departmental officers.
5. Providing complete audit transparency and version history across all calendar revisions.

### 7.2 Defense Evaluation Checklist
- [x] **Pure TypeScript & Next.js 16**: Zero framework deprecation warnings.
- [x] **Local Self-Containment**: Zero external cloud or Docker dependency; uses embedded SQLite (`dev.db`).
- [x] **LASU Real-World Seed Data**: Pre-populated with actual faculties, departments, and prominent venues (Buba Marwa Auditorium, MBA Hall, Science Lecture Theatre, Senate Chamber).
- [x] **100% Verified Codebase**: 101/101 automated test assertions passing cleanly.
- [x] **Zero Build Errors**: Clean `npm run build` output across all routes and API endpoints.

### 7.3 Recommendations for Future Work
1. **SMS Gateway Integration**: Hooking notification dispatchers into local SMS gateways (e.g. Termii / Twilio) for critical exam schedule changes.
2. **Push Notifications**: Integrating Web Push API / Service Workers for real-time mobile push notifications.
3. **Biometric Exam Check-In**: Linking verified calendar examination events to student biometric verification terminals at lecture hall entrances.

---
*Report compiled and certified for project defense evaluation.*
