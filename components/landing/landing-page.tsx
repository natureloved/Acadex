"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import {
  currentSessionLabel,
  semesterForYearMonth,
} from "@/lib/academic-session";
import {
  ArrowDown,
  ArrowRight,
  Bell,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Download,
  Menu,
  MousePointerClick,
  Plus,
  X,
} from "lucide-react";

/* ---------------- Types & Data ---------------- */
type CategoryKey = "semester" | "exam" | "holiday" | "reg" | "deadline";

interface CalendarEvent {
  d: number;
  t: string;
  c: CategoryKey;
  time?: string;
  loc?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CAT: Record<CategoryKey, { l: string; c: string }> = {
  semester: { l: "Semester", c: "#2E8B67" },
  exam: { l: "Exams", c: "#B3402A" },
  holiday: { l: "Holiday", c: "#7A4F00" },
  reg: { l: "Registration", c: "#6D3B5E" },
  deadline: { l: "Deadline", c: "#3D372E" },
};

const EVENTS: Record<string, CalendarEvent[]> = {
  "2026-7": [
    { d: 17, t: "Senate Committee on Academic Planning", c: "deadline", time: "10:00 AM", loc: "Senate Chamber" },
    { d: 24, t: "Faculty Board of Science Preliminary Meeting", c: "deadline", time: "11:00 AM", loc: "Science Lecture Theatre" },
    { d: 31, t: "Release of 2026/2027 Provisional Admission Lists", c: "reg", time: "12:00 PM", loc: "University Portal" },
  ],
  "2026-8": [
    { d: 17, t: "First Semester Registration for New Students Opens", c: "reg", time: "8:00 AM", loc: "University Portal / Faculty Offices" },
    { d: 21, t: "Online Course Registration for Returning Students Opens", c: "reg", time: "8:00 AM", loc: "University Portal" },
    { d: 25, t: "Departmental Course Clearance & Screening", c: "reg", time: "9:00 AM", loc: "Department Offices" },
    { d: 28, t: "Faculty Board of Studies Meeting", c: "deadline", time: "10:00 AM", loc: "Senate Chamber" },
  ],
  "2026-9": [
    { d: 1, t: "National Independence Day : Public Holiday", c: "holiday" },
    { d: 2, t: "First Semester Registration for New Students Closes", c: "deadline", time: "11:59 PM" },
    { d: 9, t: "Online Course Registration for Returning Students Closes", c: "deadline", time: "11:59 PM" },
    { d: 12, t: "Resumption and Registration; Lectures Commence", c: "semester", time: "8:00 AM", loc: "All Faculties, LASU Ojo" },
    { d: 23, t: "2026/2027 Matriculation Ceremony for New Students", c: "reg", time: "10:00 AM", loc: "Buba Marwa Auditorium" },
  ],
  "2026-10": [
    { d: 9, t: "Faculty of Management Sciences Board of Studies", c: "deadline", time: "11:00 AM", loc: "MBA Hall" },
    { d: 16, t: "First Semester Continuous Assessment (CA) Week Begins", c: "exam", time: "8:00 AM", loc: "CBT Centres & Lecture Halls" },
    { d: 20, t: "First Semester Continuous Assessment Tests Conclude", c: "exam" },
    { d: 27, t: "Statutory University Senate Meeting", c: "deadline", time: "10:00 AM", loc: "Senate Chamber" },
  ],
  "2026-11": [
    { d: 11, t: "Harmattan Semester Late Course Registration Closes", c: "deadline", time: "11:59 PM" },
    { d: 18, t: "First Semester Lectures End for Year-End Break", c: "semester" },
    { d: 21, t: "Year-End Break Commences", c: "holiday" },
    { d: 25, t: "Christmas Day : Public Holiday", c: "holiday" },
    { d: 26, t: "Boxing Day : Public Holiday", c: "holiday" },
  ],
  "2027-0": [
    { d: 1, t: "New Year's Day : Public Holiday", c: "holiday" },
    { d: 4, t: "Resumption from Year-End Break; Revision Week Begins", c: "semester" },
    { d: 11, t: "First Semester (Harmattan) Examinations Begin", c: "exam", time: "8:30 AM", loc: "BMA & MBA Hall" },
    { d: 29, t: "First Semester Examinations Conclude", c: "exam" },
  ],
  "2027-1": [
    { d: 1, t: "First Semester Sessional Break Begins", c: "holiday" },
    { d: 8, t: "Faculty Board of Examiners Results Consideration", c: "deadline", time: "10:00 AM" },
    { d: 15, t: "Senate Meeting for Approval of First Semester Results", c: "deadline", time: "10:00 AM", loc: "Senate Chamber" },
    { d: 22, t: "Rain Semester (Second Semester) Lectures Commence", c: "semester", time: "8:00 AM", loc: "All Faculties" },
  ],
  "2027-2": [
    { d: 8, t: "Second Semester Add/Drop Registration Window Opens", c: "reg" },
    { d: 15, t: "28th LASU Annual Convocation Ceremonies", c: "reg", time: "10:00 AM", loc: "Buba Marwa Auditorium" },
    { d: 19, t: "Convocation Thanksgiving & Lecture", c: "holiday", time: "11:00 AM", loc: "3-in-1 Hall" },
    { d: 26, t: "Mid-Semester Continuous Assessment Tests", c: "exam" },
  ],
  "2027-3": [
    { d: 2, t: "Good Friday : Public Holiday", c: "holiday" },
    { d: 5, t: "Easter Monday : Public Holiday", c: "holiday" },
    { d: 16, t: "Second Semester Continuous Assessment Submissions Due", c: "deadline" },
    { d: 30, t: "Revision Week for Second Semester Begins", c: "semester" },
  ],
  "2027-4": [
    { d: 1, t: "Workers' Day : Public Holiday", c: "holiday" },
    { d: 10, t: "Second Semester (Rain) Examinations Begin", c: "exam", time: "8:30 AM", loc: "All Examination Venues" },
    { d: 28, t: "Second Semester Examinations Conclude", c: "exam" },
    { d: 31, t: "Sessional Break Commences", c: "holiday" },
  ],
};

/* The home faculty of the project, and the courses (departments) under it. */
const FACULTY_NAME = "Faculty of Computing and Information Technology";
const FACULTY_COURSES = [
  "Computer Science",
  "Data Science",
  "Cybersecurity",
  "Information and Communication Technology",
  "Software Engineering",
];

const AUTHORS = [
  { name: "Aliu Rashidat Olayemi", matric: "24280591102" },
  { name: "Anikola Oluwatimileyin Oluwadamilare", matric: "24280591110" },
];
const SUPERVISOR = "Dr. Aiyeniko Olukayode";

const pad = (n: number) => String(n).padStart(2, "0");

function generateAndDownloadICS(
  e: CalendarEvent,
  selectedDay: { y: number; m: number; d: number }
) {
  const base = `${selectedDay.y}${pad(selectedDay.m + 1)}${pad(selectedDay.d)}`;
  let dtStart = `DTSTART;VALUE=DATE:${base}`;
  let dtEnd = `DTEND;VALUE=DATE:${selectedDay.y}${pad(selectedDay.m + 1)}${pad(selectedDay.d + 1)}`;
  if (e.time) {
    const parts = e.time.split(" ");
    const hm = parts[0].split(":");
    let h = +hm[0];
    const min = hm[1];
    if (parts[1] === "PM" && h !== 12) h += 12;
    if (parts[1] === "AM" && h === 12) h = 0;
    dtStart = `DTSTART:${base}T${pad(h)}${min}00`;
    dtEnd = `DTEND:${base}T${pad((h + 2) % 24)}${min}00`;
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Acadex//Academic Calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@acadex.demo`,
    `DTSTAMP:${stamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${e.t}`,
    "DESCRIPTION:Exported from the Acadex live demo",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `acadex-${e.t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface LandingPageUser {
  id: string;
  name: string;
  role: string;
}

export function LandingPage({
  user,
  sessionLabel,
}: {
  user?: LandingPageUser | null;
  /** Active session from the database (app/page.tsx); falls back to the
   *  session computed from today's date, so the year rolls every session. */
  sessionLabel?: string;
}) {
  const session = sessionLabel ?? currentSessionLabel();
  /* State: Toast */
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMsg(null);
    }, 4200);
  };

  /* State: Nav & Mobile */
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  /* State: Calendar opens on today, not on a hardcoded session month.
   * The demo events cover Aug 2026–May 2027; months outside that range
   * simply show no demo events, and the visitor can navigate back to them. */
  const today = new Date();
  const [viewDate, setViewDate] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selectedDay, setSelectedDay] = useState({
    y: today.getFullYear(),
    m: today.getMonth(),
    d: today.getDate(),
  });
  const [animateEvents, setAnimateEvents] = useState(false);

  const calKey = `${viewDate.y}-${viewDate.m}`;
  const monthEvents = EVENTS[calKey] || [];
  const selectedEvents = (EVENTS[`${selectedDay.y}-${selectedDay.m}`] || []).filter(
    (e) => e.d === selectedDay.d
  );

  const handlePrevMonth = () => {
    setViewDate((prev) => {
      const newM = prev.m - 1;
      return newM < 0 ? { y: prev.y - 1, m: 11 } : { y: prev.y, m: newM };
    });
  };

  const handleNextMonth = () => {
    setViewDate((prev) => {
      const newM = prev.m + 1;
      return newM > 11 ? { y: prev.y + 1, m: 0 } : { y: prev.y, m: newM };
    });
  };

  const handleSelectDay = (y: number, m: number, d: number) => {
    setSelectedDay({ y, m, d });
    if (y !== viewDate.y || m !== viewDate.m) {
      setViewDate({ y, m });
    }
    setAnimateEvents(true);
    setTimeout(() => setAnimateEvents(false), 350);
  };

  const handleDownloadICS = (e: CalendarEvent) => {
    generateAndDownloadICS(e, selectedDay);
    showToast(`"${e.t}" exported as .ics - drop it into any calendar.`);
  };

  /* Calendar Grid Calculation (42 cells) */
  const startDay = (new Date(viewDate.y, viewDate.m, 1).getDay() + 6) % 7;
  const calendarCells = Array.from({ length: 42 }, (_, i) => {
    const dt = new Date(viewDate.y, viewDate.m, i + 1 - startDay);
    const out = dt.getMonth() !== viewDate.m;
    const d = dt.getDate();
    const dm = dt.getMonth();
    const dy = dt.getFullYear();
    const dayEvs = (EVENTS[`${dy}-${dm}`] || []).filter((e) => e.d === d);
    const isWknd = (i % 7) >= 5;
    const isSel = !out && selectedDay.y === dy && selectedDay.m === dm && selectedDay.d === d;
    const now = new Date();
    const isCurToday = now.getFullYear() === dy && now.getMonth() === dm && now.getDate() === d;
    return { dt, d, dm, dy, out, dayEvs, isWknd, isSel, isCurToday };
  });

  /* Selected Day Display */
  const selectedDateObj = new Date(selectedDay.y, selectedDay.m, selectedDay.d);
  const selectedWeekday = selectedDateObj.toLocaleDateString("en-US", { weekday: "long" });

  /* State: Features Accordion (single open) */
  const [openFeature, setOpenFeature] = useState<number>(0);

  /* State: Audience Pills Toggle */
  const [selectedAudience, setSelectedAudience] = useState("All students");

  /* State: Reminder Chips Toggle */
  const [activeReminders, setActiveReminders] = useState<string[]>(["3 days before", "24 hours"]);

  const toggleReminder = (tag: string) => {
    setActiveReminders((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  /* State: FAQ Accordion */
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="relative min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      {/* ============ NAVIGATION ============ */}
      <header className={`nav ${scrolled ? "scrolled" : ""}`} id="nav">
        <div className="container nav-inner">
          <Link className="brand" href="#top" aria-label="Acadex home">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <rect x="1.5" y="1.5" width="27" height="27" rx="7" fill="var(--green)" />
              <path d="M4.5 9.5h21" stroke="#F7F2E7" strokeWidth="2" strokeLinecap="round" />
              <path d="M9.5 1.5v8M20.5 1.5v8" stroke="#F7F2E7" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="10.5" cy="18.5" r="2.6" fill="#F7F2E7" />
              <circle cx="19" cy="18.5" r="2.6" stroke="#F7F2E7" strokeWidth="1.6" fill="none" />
            </svg>
            Acadex
          </Link>
          <nav className="nav-links" aria-label="Primary">
            <a href="#product">Features</a>
            <a href="#how">How it works</a>
            <a href="#story">Our Story</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="nav-right">
            {user ? (
              <Link className="btn btn-green btn-sm" href="/calendar">
                Open Calendar
              </Link>
            ) : (
              <Link className="btn btn-green btn-sm" href="/login">
                Sign in
              </Link>
            )}
            <button
              className="menu-btn"
              id="menuBtn"
              aria-label="Open menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Panel */}
      {mobileMenuOpen && (
        <div className="mobile-panel flex">
          <a href="#product" onClick={() => setMobileMenuOpen(false)}>
            Features
          </a>
          <a href="#how" onClick={() => setMobileMenuOpen(false)}>
            How it works
          </a>
          <a href="#story" onClick={() => setMobileMenuOpen(false)}>
            Our Story
          </a>
          <a href="#faq" onClick={() => setMobileMenuOpen(false)}>
            FAQ
          </a>
          {user ? (
            <Link className="btn btn-green" href="/calendar" onClick={() => setMobileMenuOpen(false)}>
              Open Calendar
            </Link>
          ) : (
            <Link className="btn btn-green" href="/login" onClick={() => setMobileMenuOpen(false)}>
              Sign in
            </Link>
          )}
        </div>
      )}

      <main>
        {/* ============ HERO ============ */}
        <section className="hero">
          <div className="container hero-inner">
            <div>
              <div className="hero-badge reveal-in">
                <span className="hero-dot" />
                Academic year {session} · Harmattan &amp; Rain Semesters
              </div>
              <h1 className="hero-h reveal-in">
                The academic year,
                <br />
                kept in{" "}
                <span className="sq-wrap">
                  <em className="accent">perfect order</em>
                  <svg className="squiggle" viewBox="0 0 170 13" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M3 10 C 32 2, 64 12, 95 7 S 148 3, 167 8" pathLength="1" />
                  </svg>
                </span>
                .
              </h1>
              <p className="hero-sub reveal-in">
                Acadex is one authoritative academic calendar for Lagos State University. Its purpose is simple:
                every student and staff member should always see the same, current dates registration,
                lectures, examinations, holidays and breaks in one place, instead of reconciling a stale PDF
                with a correction posted somewhere else. Registrars, deans and department admins draft, approve
                and publish the term here, and when a date moves, the change itself is shown, not hidden.
              </p>
              <div className="hero-ctas reveal-in">
                {user ? (
                  <Link className="btn btn-green" href="/calendar">
                    Open Calendar <ArrowRight className="size-4" />
                  </Link>
                ) : (
                  <Link className="btn btn-green" href="/login">
                    Sign in <ArrowRight className="size-4" />
                  </Link>
                )}
                <a className="btn btn-line" href="#how">
                  See how it works <ArrowDown className="size-4" />
                </a>
              </div>
              <p className="hero-proof reveal-in">
                Final-year diploma project<b>·</b>Lagos State University<b>·</b>{session} session
              </p>
            </div>

            {/* Live Interactive Calendar Demo */}
            <div className="demo reveal-in">
              <div className="demo-tag">
                <MousePointerClick className="size-3.5" />
                Live demo : click any date
              </div>
              <div className="sheet">
                <div className="sheet-head">
                  <div>
                    <div className="sh-term" id="calTerm">
                      {(() => {
                        const term = semesterForYearMonth(viewDate.y, viewDate.m);
                        return `${term.semester} · ${term.sessionLabel}`;
                      })()}
                    </div>
                    <div className="sh-month" id="calMonth">
                      {MONTHS[viewDate.m]} <span className="sh-yr">{viewDate.y}</span>
                    </div>
                  </div>
                  <div className="sh-right">
                    <span className="sh-count" id="calCount">
                      {monthEvents.length} {monthEvents.length === 1 ? "event" : "events"}
                    </span>
                    <div className="sh-nav">
                      <button
                        id="calPrev"
                        aria-label="Previous month"
                        onClick={handlePrevMonth}
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <button
                        id="calNext"
                        aria-label="Next month"
                        onClick={handleNextMonth}
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="cal-week" aria-hidden="true">
                  <span>Mo</span>
                  <span>Tu</span>
                  <span>We</span>
                  <span>Th</span>
                  <span>Fr</span>
                  <span>Sa</span>
                  <span>Su</span>
                </div>

                <div className="cal-grid" id="calGrid">
                  {calendarCells.map((cell, idx) => {
                    const { d, dm, dy, out, dayEvs, isWknd, isSel, isCurToday } = cell;
                    const cls = [
                      "cal-day",
                      out ? "out" : "",
                      isWknd ? "wknd" : "",
                      isCurToday ? "today" : "",
                      isSel ? "sel" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <button
                        key={idx}
                        type="button"
                        className={cls}
                        onClick={() => handleSelectDay(dy, dm, d)}
                        aria-label={`${MONTHS[dm]} ${d}, ${dayEvs.length} events`}
                      >
                        <span className="d">{d}</span>
                        {dayEvs.length > 0 && (
                          <span className="cal-dots">
                            {dayEvs.slice(0, 3).map((e, eIdx) => (
                              <i key={eIdx} style={{ background: CAT[e.c].c }} />
                            ))}
                            {dayEvs.length > 3 && <b>+{dayEvs.length - 3}</b>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="sheet-foot">
                  <div className="dd">
                    <div className="dd-big" id="ddBig">
                      {selectedDay.d}
                    </div>
                    <div className="dd-meta" id="ddMeta">
                      {selectedWeekday} · {MONTHS[selectedDay.m]} {selectedDay.y}
                    </div>
                  </div>

                  <div className={`day-events ${animateEvents ? "swap" : ""}`} id="dayEvents" aria-live="polite">
                    {selectedEvents.length === 0 ? (
                      <div className="ev-empty">
                        <Coffee className="size-4 flex-none" />
                        <span>No events : a quiet day on campus.</span>
                      </div>
                    ) : (
                      selectedEvents.map((e, i) => {
                        const cat = CAT[e.c];
                        const meta = [e.time ? e.time : "All day", e.loc].filter(Boolean).join(" · ");
                        return (
                          <div className="ev" key={i}>
                            <div className="ev-l">
                              <div className="ev-t">
                                <span className="chip" style={{ ["--c" as string]: cat.c }}>
                                  {cat.l}
                                </span>
                                <span className="ev-title">{e.t}</span>
                              </div>
                              <div className="ev-meta">{meta}</div>
                            </div>
                            <button
                              type="button"
                              className="ev-ics"
                              onClick={() => handleDownloadICS(e)}
                              aria-label={`Export ${e.t} as .ics`}
                            >
                              <Download className="size-3" />
                              .ics
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="sheet-legend">
                  <span className="lg" style={{ ["--c" as string]: "#2E8B67" }}>
                    <i />
                    Semester
                  </span>
                  <span className="lg" style={{ ["--c" as string]: "#B3402A" }}>
                    <i />
                    Exams
                  </span>
                  <span className="lg" style={{ ["--c" as string]: "#7A4F00" }}>
                    <i />
                    Holidays
                  </span>
                  <span className="lg" style={{ ["--c" as string]: "#6D3B5E" }}>
                    <i />
                    Registration
                  </span>
                  <span className="lg" style={{ ["--c" as string]: "#4C443A" }}>
                    <i />
                    Deadlines
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ TICKER ============ */}
        <div className="ticker" aria-hidden="true">
          <div className="ticker-track" id="tickerTrack">
            <div className="tk">
              <span className="tk-item"><b>AUG 31</b><span>Provisional Admission Lists Released</span></span>
              <span className="tk-item"><b>SEP 17</b><span>Fresh Students Registration Opens</span></span>
              <span className="tk-item"><b>SEP 21</b><span>Returning Students Course Registration</span></span>
              <span className="tk-item"><b>OCT 01</b><span>National Independence Day</span></span>
              <span className="tk-item"><b>OCT 12</b><span>Harmattan Resumption &amp; Lectures</span></span>
              <span className="tk-item"><b>OCT 23</b><span>Matriculation : Buba Marwa Auditorium</span></span>
              <span className="tk-item"><b>NOV 16</b><span>Continuous Assessment CA Week</span></span>
              <span className="tk-item"><b>DEC 18</b><span>Lectures End for Year-End Break</span></span>
              <span className="tk-item"><b>JAN 11</b><span>Harmattan Examinations Begin</span></span>
              <span className="tk-item"><b>FEB 15</b><span>Senate Results Approval : Senate Chamber</span></span>
              <span className="tk-item"><b>FEB 22</b><span>Rain Semester Lectures Commence</span></span>
              <span className="tk-item"><b>MAR 15</b><span>28th Annual Convocation Ceremonies</span></span>
              <span className="tk-item"><b>MAY 10</b><span>Rain Semester Examinations Begin</span></span>
            </div>
            {/* Duplicated for smooth infinite loop */}
            <div className="tk">
              <span className="tk-item"><b>AUG 31</b><span>Provisional Admission Lists Released</span></span>
              <span className="tk-item"><b>SEP 17</b><span>Fresh Students Registration Opens</span></span>
              <span className="tk-item"><b>SEP 21</b><span>Returning Students Course Registration</span></span>
              <span className="tk-item"><b>OCT 01</b><span>National Independence Day</span></span>
              <span className="tk-item"><b>OCT 12</b><span>Harmattan Resumption &amp; Lectures</span></span>
              <span className="tk-item"><b>OCT 23</b><span>Matriculation : Buba Marwa Auditorium</span></span>
              <span className="tk-item"><b>NOV 16</b><span>Continuous Assessment CA Week</span></span>
              <span className="tk-item"><b>DEC 18</b><span>Lectures End for Year-End Break</span></span>
              <span className="tk-item"><b>JAN 11</b><span>Harmattan Examinations Begin</span></span>
              <span className="tk-item"><b>FEB 15</b><span>Senate Results Approval : Senate Chamber</span></span>
              <span className="tk-item"><b>FEB 22</b><span>Rain Semester Lectures Commence</span></span>
              <span className="tk-item"><b>MAR 15</b><span>28th Annual Convocation Ceremonies</span></span>
              <span className="tk-item"><b>MAY 10</b><span>Rain Semester Examinations Begin</span></span>
            </div>
          </div>
        </div>

        {/* ============ PURPOSE what Acadex is for ============ */}
        <section className="section" id="purpose">
          <div className="container">
            <div className="sec-head">
              <div className="eyebrow">Why Acadex exists</div>
              <h2>
                The main purpose: <em className="accent">one calendar everyone can trust.</em>
              </h2>
              <p>
                At Lagos State University, the approved academic calendar was published as a static page, and
                corrections like the one-week extension of the 2025/2026 session were re-announced in
                separate news posts and social-media threads. The original date stayed stale on the page while
                the correction lived somewhere else, and students had to reconcile both. Acadex replaces that
                document with a living system.
              </p>
            </div>
            <div className="purpose-grid">
              <div className="purpose-card">
                <h3>One authoritative version</h3>
                <p>
                  Registration, lectures, examinations, holidays, breaks, matriculation and convocation all
                  live in one calendar. There is a single source of truth no competing PDFs, no notice-board
                  photocopy that is already out of date.
                </p>
              </div>
              <div className="purpose-card">
                <h3>Changes are shown, not hidden</h3>
                <p>
                  When a date moves, Acadex records the change with a before-and-after history, flags the event
                  as rescheduled, and notifies the people it affects. A moved date is an event in itself, not a
                  quiet edit.
                </p>
              </div>
              <div className="purpose-card">
                <h3>Dates that reach students</h3>
                <p>
                  Students see the calendar filtered to their faculty, department and level, subscribe to it
                  from Google, Outlook or Apple Calendar, download it, print it, and get reminded a week and a
                  day before the dates that matter to them.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ FEATURES ============ */}
        <section className="section" id="product">
          <div className="container feat-grid">
            <div className="feat-side">
              <div className="eyebrow">The system</div>
              <h2>
                Built for the people who <em className="accent">run the term.</em>
              </h2>
              <p>Five tools that quietly replace the spreadsheet, the shared inbox, and the eight-page PDF nobody reads. Open each one.</p>
            </div>

            <div className="feat-list">
              {/* Feature 01 */}
              <div className={`f-row ${openFeature === 0 ? "open" : ""}`}>
                <button
                  className="f-head"
                  aria-expanded={openFeature === 0}
                  onClick={() => setOpenFeature(openFeature === 0 ? -1 : 0)}
                >
                  <span className="f-num">01</span>
                  <span className="f-title">Term architecture</span>
                  <span className="f-x">
                    <Plus className="size-4" />
                  </span>
                </button>
                <div className="f-body">
                  <div className="f-inner">
                    <div className="f-inner-pad">
                      <p className="f-desc">
                        Semesters, trimesters, sessional breaks : nest periods inside terms and let events
                        inherit their dates. Move a semester&apos;s start and everything inside shifts with it, while
                        conflicts with holidays and exam windows are flagged as you draft.
                      </p>
                      <div className="vg">
                        <div className="vg-track">
                          <div className="vg-seg" style={{ ["--c" as string]: "#2E8B67", width: "58%" }}>
                            Harmattan · Oct - Dec
                          </div>
                          <div className="vg-seg" style={{ ["--c" as string]: "#B3402A", width: "22%" }}>
                            Exams · Jan 11 - 29
                          </div>
                          <div className="vg-seg" style={{ ["--c" as string]: "#8A6414", width: "20%" }}>
                            Breaks
                          </div>
                        </div>
                        <div className="vg-ruler">
                          <span>Oct</span>
                          <span>Nov</span>
                          <span>Dec</span>
                          <span>Jan</span>
                          <span>Feb</span>
                        </div>
                      </div>
                      <div className="vg-cap">One term object : every date inside knows where it belongs.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature 02 */}
              <div className={`f-row ${openFeature === 1 ? "open" : ""}`}>
                <button
                  className="f-head"
                  aria-expanded={openFeature === 1}
                  onClick={() => setOpenFeature(openFeature === 1 ? -1 : 1)}
                >
                  <span className="f-num">02</span>
                  <span className="f-title">One record, many audiences</span>
                  <span className="f-x">
                    <Plus className="size-4" />
                  </span>
                </button>
                <div className="f-body">
                  <div className="f-inner">
                    <div className="f-inner-pad">
                      <p className="f-desc">
                        Students, faculty, staff, and directorates each see a calendar filtered to what concerns them :
                        by faculty, department, level, or course. One master record powers every view, so there is never
                        a &quot;wrong PDF&quot; in circulation.
                      </p>
                      <div className="vg">
                        <div className="vg-chips">
                          {["All students", "Freshmen", "Final year", "Faculty", "Staff"].map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              className={`tgl ${selectedAudience === tag ? "on" : ""}`}
                              onClick={() => setSelectedAudience(tag)}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="vg-cap">Tap to preview each audience : same record, different lens.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature 03 */}
              <div className={`f-row ${openFeature === 2 ? "open" : ""}`}>
                <button
                  className="f-head"
                  aria-expanded={openFeature === 2}
                  onClick={() => setOpenFeature(openFeature === 2 ? -1 : 2)}
                >
                  <span className="f-num">03</span>
                  <span className="f-title">Change control, built in</span>
                  <span className="f-x">
                    <Plus className="size-4" />
                  </span>
                </button>
                <div className="f-body">
                  <div className="f-inner">
                    <div className="f-inner-pad">
                      <p className="f-desc">
                        Propose, review, approve. Department heads suggest changes; the academic planning directorate signs off. Every
                        version is preserved and diffable, so &quot;wait : when did that change?&quot; has a
                        one-click answer.
                      </p>
                      <div className="vg">
                        <div className="vg-log">
                          <div className="vg-line">
                            <span className="vg-ver">v14</span>
                            <span>Harmattan examinations</span>
                            <s>Jan 11</s>
                            <span>→</span>
                            <b>Jan 18</b>
                            <span className="vg-tag ok">Approved</span>
                          </div>
                          <div className="vg-line">
                            <span className="vg-ver">v13</span>
                            <span>Rain semester lectures extended one week</span>
                            <span className="vg-tag old">Superseded</span>
                          </div>
                          <div className="vg-line">
                            <span className="vg-ver">v12</span>
                            <span>Added Harmattan term : 14 dates</span>
                            <span className="vg-tag ok">Approved</span>
                          </div>
                        </div>
                      </div>
                      <div className="vg-cap">Full history, always diffable : with names, notes, and timestamps.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature 04 */}
              <div className={`f-row ${openFeature === 3 ? "open" : ""}`}>
                <button
                  className="f-head"
                  aria-expanded={openFeature === 3}
                  onClick={() => setOpenFeature(openFeature === 3 ? -1 : 3)}
                >
                  <span className="f-num">04</span>
                  <span className="f-title">Publishes everywhere at once</span>
                  <span className="f-x">
                    <Plus className="size-4" />
                  </span>
                </button>
                <div className="f-body">
                  <div className="f-inner">
                    <div className="f-inner-pad">
                      <p className="f-desc">
                        One publish refreshes your ICS feeds, Google and Outlook subscriptions, the LMS embed, the
                        portal widget, and the printable one-pager. Every channel shows the same dates within the
                        hour.
                      </p>
                      <div className="vg">
                        <div className="vg-pub">
                          <span className="vg-src">
                            <Calendar className="size-3.5 text-[var(--green-lite)]" />
                            Master calendar
                          </span>
                          <span className="vg-arr">
                            <ArrowRight className="size-4" />
                          </span>
                          <span className="pill">Portal</span>
                          <span className="pill">LMS</span>
                          <span className="pill">ICS feed</span>
                          <span className="pill">Google</span>
                          <span className="pill">Outlook</span>
                          <span className="pill">Print</span>
                        </div>
                      </div>
                      <div className="vg-cap">One click publishes everywhere : feeds refresh within the hour.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature 05 */}
              <div className={`f-row ${openFeature === 4 ? "open" : ""}`}>
                <button
                  className="f-head"
                  aria-expanded={openFeature === 4}
                  onClick={() => setOpenFeature(openFeature === 4 ? -1 : 4)}
                >
                  <span className="f-num">05</span>
                  <span className="f-title">Reminders that actually land</span>
                  <span className="f-x">
                    <Plus className="size-4" />
                  </span>
                </button>
                <div className="f-body">
                  <div className="f-inner">
                    <div className="f-inner-pad">
                      <p className="f-desc">
                        Timed announcements reach students where they already look : email, SMS, and portal notices : a
                        week before registration closes, the night before exams, whenever you decide.
                      </p>
                      <div className="vg">
                        <div className="vg-chips">
                          {["3 days before", "24 hours", "1 hour", "Morning of"].map((t) => (
                            <button
                              key={t}
                              type="button"
                              className={`tgl ${activeReminders.includes(t) ? "on" : ""}`}
                              onClick={() => toggleReminder(t)}
                            >
                              <Bell className="size-3.5" />
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="vg-cap">
                        Announcements go out through email, SMS, and portal : timed to each event.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ OUR STORY ============ */}
        <section className="section" id="story">
          <div className="container">
            <div className="sec-head">
              <div className="eyebrow">Our Story</div>
              <h2>
                Built by students, <em className="accent">for students.</em>
              </h2>
              <p>
                Acadex was created by two Computer Science diploma students who wanted to solve a simple
                problem we experienced as students: keeping track of important academic dates and activities.
                We developed Acadex as a centralized platform for managing and accessing academic calendar
                information, combining our knowledge of web development, database management, and system
                design to make academic planning easier and more organized.
              </p>
            </div>
            <div className="story-grid">
              {AUTHORS.map((author) => (
                <div className="story-card" key={author.matric}>
                  <div className="story-name">{author.name}</div>
                  <div className="story-meta">Computer Science · Diploma</div>
                  <div className="story-meta">Matric No: {author.matric}</div>
                </div>
              ))}
              <div className="story-card">
                <div className="story-name">{SUPERVISOR}</div>
                <div className="story-meta">Project Supervisor</div>
                <div className="story-meta">Lagos State University</div>
              </div>
            </div>
            <div className="faculty-card">
              <h3>{FACULTY_NAME}</h3>
              <p>
                Computer Science sits under the {FACULTY_NAME} at Lagos State University. The faculty
                offers:
              </p>
              <ul className="course-list">
                {FACULTY_COURSES.map((course) => (
                  <li key={course}>{course}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section className="dark" id="how">
          <div className="container">
            <div className="dark-head">
              <div>
                <div className="eyebrow">How it works</div>
                <h2>
                  From draft to <em className="accent">campus-wide</em> in four steps.
                </h2>
              </div>
              <p>A calendar is only as good as its last update : so Acadex makes updating the easy part of the job.</p>
            </div>
            <div className="steps">
              <div className="step reveal-in">
                <div className="step-n">01</div>
                <h3>Draft the term</h3>
                <p>Import previous session dates or start from a template. Arrange periods, exams, and lecture weeks : conflicts surface live while you work.</p>
              </div>
              <div className="step reveal-in">
                <div className="step-n">02</div>
                <h3>Review &amp; approve</h3>
                <p>Faculties propose, the Senate and academic planning directorate approve. Every change carries a comment, an officer name, and a version number you can audit.</p>
              </div>
              <div className="step reveal-in">
                <div className="step-n">03</div>
                <h3>Publish once</h3>
                <p>One click pushes to student portals, ICS feeds, faculty boards, and printable schedules. Every stakeholder reads the same verified truth.</p>
              </div>
              <div className="step reveal-in">
                <div className="step-n">04</div>
                <h3>Keep it current</h3>
                <p>A date moved? Change it once. Subscribed feeds refresh automatically, and instant notices alert all affected staff and students.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section className="section" id="faq" style={{ paddingTop: "40px" }}>
          <div className="container">
            <div className="sec-head center">
              <div className="eyebrow eyebrow-c">FAQ</div>
              <h2>
                Questions, <em className="accent">answered.</em>
              </h2>
            </div>
            <div className="faq-list">
              {[
                {
                  q: "How long does it take to move an existing calendar onto Acadex?",
                  a: "Most departments import previous dates from an ICS file, a spreadsheet, or the approved Senate PDF : and are drafting within an afternoon.",
                },
                {
                  q: "How do students and staff actually receive the calendar?",
                  a: "However they already work: a live ICS subscription in Google, Outlook, or Apple Calendar; an embed in the student portal and LMS; printable schedules; and optional notifications before key deadlines. No one has to 'check the notice board'.",
                },
                {
                  q: "What happens when a date changes mid-term?",
                  a: "Change it once, in one place. The new version is recorded, subscribers' calendars refresh within the hour, and an announcement goes out if you want one. There is no step two.",
                },
                {
                  q: "Who is allowed to edit the calendar?",
                  a: "Whoever you decide. Departments propose changes within their scope; the registrar's office and academic planning directorate approve and publish. Every edit carries a name, a timestamp, and a version number.",
                },
                {
                  q: "Does Acadex support semesters, trimesters, and multi-campus faculties?",
                  a: "Yes : terms are built from nested periods, so any university structure fits, including sessional breaks and sandwich programmes. Multi-campus hierarchies with SSO are fully supported.",
                },
                {
                  q: "Who built Acadex?",
                  a: "Two Computer Science diploma students Aliu Rashidat Olayemi (24280591102) and Anikola Oluwatimileyin Oluwadamilare (24280591110) of the Faculty of Computing and Information Technology, Lagos State University, supervised by Dr. Aiyeniko Olukayode.",
                },
              ].map((faq, idx) => (
                <div key={idx} className={`q-row ${openFaq === idx ? "open" : ""}`}>
                  <button
                    className="q-head"
                    aria-expanded={openFaq === idx}
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  >
                    <span className="q-title">{faq.q}</span>
                    <span className="q-x">
                      <Plus className="size-3.5" />
                    </span>
                  </button>
                  <div className="q-body">
                    <div className="q-binner">
                      <p className="q-bpad">{faq.a}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ CTA ============ */}
        <section className="cta-band" id="get-started">
          <div className="container cta-inner">
            <div className="eyebrow eyebrow-c reveal-in">Academic year {session} · Registration is open</div>
            <h2 className="reveal-in">Set the session in motion.</h2>
            <p className="reveal-in">
              See the {session} calendar registration, lectures, examinations and breaks in one place,
              with every change shown as it happens.
            </p>

            <div className="reveal-in flex flex-col items-center gap-4 text-center mt-6">
              {user ? (
                <p className="text-base font-medium text-[var(--paper-2)]">
                  Signed in as <strong className="text-[#FBF8F0] font-semibold">{user.name}</strong> ({user.role})
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link className="btn btn-cream" href="/calendar">
                  Open Calendar <ArrowRight className="size-4" />
                </Link>
                {user ? null : (
                  <Link className="btn btn-line" href="/login">
                    Sign in
                  </Link>
                )}
              </div>
            </div>

            <div className="cta-note reveal-in">
              Final-year diploma project · {FACULTY_NAME} · Lagos State University
            </div>
          </div>
        </section>
      </main>

      {/* ============ FOOTER ============ */}
      <footer>
        <div className="container">
          <div className="foot-grid">
            <div className="foot-brand">
              <a className="brand" href="#top" aria-label="Acadex home">
                <svg width="28" height="28" viewBox="0 0 30 30" fill="none" aria-hidden="true">
                  <rect x="1.5" y="1.5" width="27" height="27" rx="7" fill="var(--green)" />
                  <path d="M4.5 9.5h21" stroke="#F7F2E7" strokeWidth="2" strokeLinecap="round" />
                  <path d="M9.5 1.5v8M20.5 1.5v8" stroke="#F7F2E7" strokeWidth="2.4" strokeLinecap="round" />
                  <circle cx="10.5" cy="18.5" r="2.6" fill="#F7F2E7" />
                </svg>
                Acadex
              </a>
              <p>
                One authoritative academic calendar for Lagos State University built by Aliu Rashidat
                Olayemi and Anikola Oluwatimileyin Oluwadamilare, Computer Science diploma students,
                supervised by {SUPERVISOR}.
              </p>
              <div className="foot-loc">Lagos State University, Badagry Expressway, Ojo, Lagos, Nigeria : est. 1983</div>
            </div>
            <div className="foot-col">
              <h4>Product</h4>
              <a href="#product">Features</a>
              <a href="#how">How it works</a>
              <a href="#story">Our Story</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="foot-col">
              <h4>Resources</h4>
              <button
                type="button"
                className="text-left"
                onClick={() => showToast("The help center lives inside your workspace : meanwhile, contact registry@lasu.edu.ng")}
              >
                Help center
              </button>
              <button
                type="button"
                className="text-left"
                onClick={() => showToast("Harmattan and Rain semester templates : included in every workspace.")}
              >
                Term templates
              </button>
              <button
                type="button"
                className="text-left"
                onClick={() => showToast("ICS feeds, REST & webhooks : documented in your workspace.")}
              >
                API documentation
              </button>
              <button
                type="button"
                className="text-left"
                onClick={() => showToast("v3.4 : the 'squash the semester' release. Full notes ship with your workspace.")}
              >
                Changelog
              </button>
            </div>
            <div className="foot-col">
              <h4>Institution</h4>
              <button
                type="button"
                className="text-left"
                onClick={() => showToast("Acadex Academic Calendar System for Lagos State University and Higher Education.")}
              >
                About
              </button>
              <button
                type="button"
                className="text-left"
                onClick={() => showToast("Academic session scheduling updates go directly on the university calendar.")}
              >
                Registry
              </button>
              <a href="mailto:registry@lasu.edu.ng">Contact</a>
              <button
                type="button"
                className="text-left"
                onClick={() => showToast("All systems operational : 99.98% uptime this academic session.")}
              >
                System status
              </button>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© {new Date().getFullYear()} Acadex · Lagos State University Academic Calendar System</span>
            <span>
              <button
                type="button"
                onClick={() => showToast("Short version: your dates are yours : export or delete anytime.")}
              >
                Privacy
              </button>
              <button
                type="button"
                onClick={() => showToast("The fair-use kind. Full text lives in your workspace.")}
              >
                Terms
              </button>
            </span>
          </div>
        </div>
      </footer>

      {/* ============ TOAST ============ */}
      <div className={`toast ${toastMsg ? "show" : ""}`} role="status" aria-live="polite">
        <Check className="size-4 text-[var(--green-lite)] flex-none" />
        <span id="toastMsg">{toastMsg}</span>
      </div>
    </div>
  );
}
