# Seed data sources where every demo date came from

**Status: DEMONSTRATION DATA ONLY.** Nothing in `prisma/seed.ts` should be
treated as the official LASU calendar. This file records the provenance of
every seeded date, the places where sources disagree, and what must be
re-verified against the official published calendar before the project is
submitted or demonstrated.

---

## 1. The 2025/2026 session (seeded as the archive)

The archived session's dates were transcribed during the research phase of
this project (see `docs/ACADEX-PLAN.md`, section 2.1–2.2) from LASU's own
publications:

| Source | What it provided |
| --- | --- |
| LASU academic calendar page `lasu.edu.ng/home/pages/?id=calendar` | The static "Academic Calendar" page; the primary reference for the session's structure. |
| LASU news post `lasu.edu.ng/home/news/read.php?id=576` "Approved Calendar for the 2025/2026 Academic Session" | The session-level approved calendar as announced in the news section. |
| LASU official social channels `x.com/LASUOfficial` and `facebook.com/lasuinfo` "EXTENSION OF APPROVED ACADEMIC CALENDAR BY ONE (1) WEEK" | The one-week extension: sessional break moved to Monday, 27 July 2026. |

Seeded 2025/2026 events and their provenance:

| Seeded event | Dates | Provenance |
| --- | --- | --- |
| Registration for New Students (First Semester) | 15 Sep – 3 Oct 2025 | Published calendar (as transcribed from the sources above) |
| Resumption and Registration for Returning Students; Lectures Commence | 6 Oct – 19 Dec 2025 | Published calendar |
| End-of-Year Break | 22 Dec 2025 – 2 Jan 2026 | Published calendar |
| Matriculation Ceremony for 2025/2026 Fresh Students | 14 Jan 2026 | `[ASSUMED]` plausible date, not found in a published source |
| First Semester Examinations | 19 Jan – 6 Feb 2026 | `[ASSUMED]` window inside the published semester span |
| 400 Level Project Defence Orientation | 10 Feb 2026 | `[ASSUMED]` invented to demonstrate LEVEL targeting |
| First Semester Ends | 26 Feb 2026 | Published calendar (reported semester span) |
| Second Semester Resumption, Registration and Lectures | 2 Mar – 22 May 2026 | Published calendar |
| Senate Meeting: Consideration of First Semester Results | 10 Mar 2026 | `[ASSUMED]` invented to demonstrate STAFF_ONLY visibility |
| Convocation Ceremony and Award of Degrees | 13 – 15 May 2026 | `[ASSUMED]` plausible date, not found in a published source |
| Second Semester Examinations | 1 – 19 Jun 2026 (after two reschedules) | `[ASSUMED]` window; the two recorded reschedules demonstrate revision tracking |
| Second Semester Ends | 26 Jun 2026 | Published calendar (reported span) |
| Sessional Break Commences | 27 Jul 2026 (moved from 20 Jul 2026) | Social-channel extension announcement the project's central exhibit |
| Faculty of Science Board Meeting | 5 Nov 2025 | `[ASSUMED]` invented to demonstrate FACULTY targeting |
| Department of Computer Science Seminar Series | 19 Nov 2025 | `[ASSUMED]` invented to demonstrate DEPARTMENT targeting |
| Release of First Semester Examination Timetable | 5 Jan 2026 | DRAFT seed entry; the DRAFT workflow itself is the demo |

> Live re-verification note: at the time this file was written (14 September
> 2026), the LASU pages above could not be reached from the development
> machine (requests timed out), so the transcripts above stand as recorded
> during the research phase. **They must be re-checked against the live
> pages before submission.**

## 2. The 2026/2027 session (seeded as current PROVISIONAL)

The current session is seeded so the demo has upcoming events and the
reminder feature has something to act on. **Every one of its dates is a
placeholder.**

### 2.1 The conflicting commencement claims

As of 14 September 2026, published reporting on when LASU's 2026/2027
academic session starts is contradictory. The commencement dates that appear
in public sources include:

| Claimed start | Stated by | Check |
| --- | --- | --- |
| Monday 31 August 2026 | Some public announcements | Already in the past relative to today (14 Sep 2026) cannot be the current start |
| Monday 6 October 2026 | Other announcements | 6 October 2026 is actually a **Tuesday**, not a Monday the claim itself is internally inconsistent |
| Monday 26 October 2026 | Further announcements | The only claimed date that is both in the future and a real Monday |

No single authoritative date can be established from these sources, and the
Senate-approved 2026/2027 calendar could not be confirmed from an official
LASU page at seed time. **This conflict is the evidence for the problem
Acadex exists to solve**: when the calendar lives in scattered announcements
instead of one managed system, even the start of the session is a matter of
debate.

### 2.2 What the seed does with this

`prisma/seed.ts` seeds a *plausible demonstration timeline* for 2026/2027
that begins with registration opening within a week of 14 September 2026:

- First Semester Registration for New Students 17 Sep – 2 Oct 2026
- Online Course Registration for Returning Students 21 Sep – 9 Oct 2026
- Resumption and Registration for Returning Students; Lectures Commence 12 Oct – 18 Dec 2026
- End-of-Year Break 21 Dec 2026 – 1 Jan 2027
- Matriculation 20 Jan 2027 `[ASSUMED]`
- First Semester Examinations 25 Jan – 12 Feb 2027 `[ASSUMED]`
- First Semester Ends 19 Feb 2027
- Second Semester Resumption, Registration and Lectures 1 Mar – 21 May 2027
- Second Semester Examinations 24 May – 11 Jun 2027 `[ASSUMED]`
- Convocation 16 – 18 Jun 2027 `[ASSUMED]`
- Second Semester Ends 25 Jun 2027
- Sessional Break Commences 28 Jun 2027

This timeline matches **none** of the three claimed commencement dates, which
is deliberate: the seed's own header marks the section
`PROVISIONAL UNVERIFIED` and states plainly that the dates must be replaced
with the official Senate-approved calendar before submission.

## 3. Verification checklist before submission

1. Re-open `lasu.edu.ng/home/pages/?id=calendar` and capture the published
   2026/2027 calendar (or the latest revision).
2. Check the LASU news section and the official X / Facebook accounts for the
   Senate-approved 2026/2027 dates, and record the exact post URLs in this
   file.
3. Replace the `EVENTS_2026_2027` dates in `prisma/seed.ts` with the official
   dates and delete the `PROVISIONAL UNVERIFIED` block.
4. Re-verify the 2025/2026 transcript against the live pages (they were
   unreachable from the development machine on 14 Sep 2026).
5. Re-run `npm run db:reset` and confirm the seed output.

Until then, treat every date in the seed as what it is: demonstration data
with the provenance documented here.
