/**
 * Bulk CSV import of an approved calendar.
 *
 * Registries publish the approved calendar as a table, so the real workflow is
 * "paste the senate calendar in" rather than "type 40 events by hand".
 *
 * Two invariants:
 *  �?� Nothing is written until the administrator confirms the preview.
 *  �?� The service re-parses and re-validates on confirm; the browser never gets
 *    to hand back a set of rows and have them trusted.
 */
import { prisma } from "../db";
import type { SemesterType } from "../constants";
import { parseCsv } from "./csv";
import {
  fail,
  parseDateOnly,
  succeed,
  writeAudit,
  writeRevision,
  type Actor,
  type ServiceResult,
} from "./shared";

export const IMPORT_HEADERS = [
  "title",
  "category",
  "semester",
  "start",
  "end",
  "location",
  "description",
] as const;

const MAX_ROWS = 500;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;

export type ImportRow = {
  line: number;
  title: string;
  categoryName: string;
  semester: SemesterType;
  location: string;
  description: string;
  startAt: Date;
  endAt: Date;
};

export type ImportIssue = { line: number; reason: string };

export type ImportPreview = {
  sessionId: string;
  sessionName: string;
  valid: ImportRow[];
  invalid: ImportIssue[];
};

function key(semester: string, title: string, startAt: Date): string {
  return `${semester}|${title.trim().toLowerCase()}|${startAt.toISOString().slice(0, 10)}`;
}

/** Parse and validate without writing anything. */
export async function previewImport(
  sessionId: string,
  csvText: string,
): Promise<ServiceResult<ImportPreview>> {
  if (!csvText.trim()) {
    return fail("Upload or paste a CSV file first.");
  }

  const session = sessionId
    ? await prisma.academicSession.findUnique({
        where: { id: sessionId },
        select: { id: true, name: true },
      })
    : null;
  if (!session) return fail("Choose the session these events belong to.");

  const table = parseCsv(csvText);

  if (table.header.length === 0) {
    return fail("That file looks empty.");
  }

  const expected = IMPORT_HEADERS.join(",");
  if (table.header.join(",") !== expected) {
    return fail(
      `The header row must be exactly: ${expected} (found: ${table.header.join(",") || "nothing"}).`,
    );
  }

  if (table.rows.length === 0) {
    return fail("The file has a header row but no events.");
  }
  if (table.rows.length > MAX_ROWS) {
    return fail(`That is ${table.rows.length} rows; imports are capped at ${MAX_ROWS}.`);
  }

  const [categories, semesters, existing] = await Promise.all([
    prisma.eventCategory.findMany({ select: { id: true, name: true } }),
    prisma.semester.findMany({
      where: { sessionId: session.id },
      select: { id: true, type: true },
    }),
    prisma.calendarEvent.findMany({
      where: { semester: { sessionId: session.id } },
      select: { title: true, startAt: true, semester: { select: { type: true } } },
    }),
  ]);

  const categoryByName = new Map(
    categories.map((category) => [category.name.trim().toLowerCase(), category]),
  );
  const semesterByType = new Map(semesters.map((semester) => [semester.type, semester]));
  const existingKeys = new Set(
    existing.map((event) => key(event.semester.type, event.title, event.startAt)),
  );
  const seenKeys = new Set<string>();

  const valid: ImportRow[] = [];
  const invalid: ImportIssue[] = [];

  for (const row of table.rows) {
    const [rawTitle = "", rawCategory = "", rawSemester = "", rawStart = "", rawEnd = "", rawLocation = "", rawDescription = ""] =
      row.values;

    if (row.values.length !== IMPORT_HEADERS.length) {
      invalid.push({
        line: row.line,
        reason: `Expected ${IMPORT_HEADERS.length} columns, found ${row.values.length}.`,
      });
      continue;
    }

    const title = rawTitle.trim();
    if (!title) {
      invalid.push({ line: row.line, reason: "A title is required." });
      continue;
    }
    if (title.length > MAX_TITLE) {
      invalid.push({ line: row.line, reason: `Title is longer than ${MAX_TITLE} characters.` });
      continue;
    }

    const category = categoryByName.get(rawCategory.trim().toLowerCase());
    if (!category) {
      invalid.push({
        line: row.line,
        reason: `Unknown category "${rawCategory.trim()}".`,
      });
      continue;
    }

    const semesterType = rawSemester.trim().toUpperCase() as SemesterType;
    if (semesterType !== "FIRST" && semesterType !== "SECOND") {
      invalid.push({ line: row.line, reason: 'Semester must be "FIRST" or "SECOND".' });
      continue;
    }
    if (!semesterByType.has(semesterType)) {
      invalid.push({
        line: row.line,
        reason: `${session.name} has no ${semesterType.toLowerCase()} semester.`,
      });
      continue;
    }

    const startAt = parseDateOnly(rawStart);
    const endAt = parseDateOnly(rawEnd);
    if (!startAt) {
      invalid.push({ line: row.line, reason: `Unreadable start date "${rawStart.trim()}".` });
      continue;
    }
    if (!endAt) {
      invalid.push({ line: row.line, reason: `Unreadable end date "${rawEnd.trim()}".` });
      continue;
    }
    if (endAt.getTime() < startAt.getTime()) {
      invalid.push({ line: row.line, reason: "The end date is before the start date." });
      continue;
    }

    const rowKey = key(semesterType, title, startAt);
    if (seenKeys.has(rowKey)) {
      invalid.push({ line: row.line, reason: "Duplicate of an earlier row in this file." });
      continue;
    }
    if (existingKeys.has(rowKey)) {
      invalid.push({
        line: row.line,
        reason: "An event with this title and start date already exists in this session.",
      });
      continue;
    }
    seenKeys.add(rowKey);

    valid.push({
      line: row.line,
      title,
      categoryName: category.name,
      semester: semesterType,
      location: rawLocation.trim(),
      description: rawDescription.trim().slice(0, MAX_DESCRIPTION),
      startAt,
      endAt,
    });
  }

  return succeed({ sessionId: session.id, sessionName: session.name, valid, invalid });
}

/**
 * Import the valid rows of a CSV. Re-parses from the raw text so a tampered
 * browser payload cannot inject unvalidated events.
 */
export async function importEvents(
  actor: Actor,
  sessionId: string,
  csvText: string,
  publish: boolean,
): Promise<ServiceResult<{ imported: number; skipped: number; sessionName: string }>> {
  const preview = await previewImport(sessionId, csvText);
  if (!preview.ok) return fail(...preview.errors);

  const { valid, invalid, sessionName } = preview.data;
  if (valid.length === 0) {
    return fail("None of the rows in that file passed validation, so nothing was imported.");
  }

  const [categories, semesters] = await Promise.all([
    prisma.eventCategory.findMany({ select: { id: true, name: true } }),
    prisma.semester.findMany({
      where: { sessionId },
      select: { id: true, type: true },
    }),
  ]);

  const categoryByName = new Map(
    categories.map((category) => [category.name.trim().toLowerCase(), category.id]),
  );
  const semesterByType = new Map(semesters.map((semester) => [semester.type, semester.id]));

  await prisma.$transaction(
    async (tx) => {
      for (const row of valid) {
        const categoryId = categoryByName.get(row.categoryName.trim().toLowerCase());
        const semesterId = semesterByType.get(row.semester);
        if (!categoryId || !semesterId) continue;

        const created = await tx.calendarEvent.create({
          data: {
            title: row.title,
            description: row.description || null,
            categoryId,
            semesterId,
            startAt: row.startAt,
            endAt: row.endAt,
            allDay: true,
            location: row.location || null,
            status: publish ? "PUBLISHED" : "DRAFT",
            visibility: "PUBLIC",
            scope: "ALL",
            createdById: actor.id,
            publishedAt: publish ? new Date() : null,
            version: 1,
          },
          select: { id: true },
        });

        const snapshot = {
          title: row.title,
          description: row.description || null,
          categoryId,
          semesterId,
          startAt: row.startAt.toISOString(),
          endAt: row.endAt.toISOString(),
          allDay: true,
          location: row.location || null,
          status: publish ? "PUBLISHED" : "DRAFT",
          visibility: "PUBLIC",
          scope: "ALL",
          targets: [] as string[],
        };

        await writeRevision(tx, {
          eventId: created.id,
          changedById: actor.id,
          changeType: "CREATED",
          note: `Imported from CSV (line ${row.line}).`,
          before: null,
          after: snapshot,
        });

        if (publish) {
          await writeRevision(tx, {
            eventId: created.id,
            changedById: actor.id,
            changeType: "PUBLISHED",
            note: "Imported and published.",
            before: snapshot,
            after: snapshot,
          });
        }
      }

      await writeAudit(tx, {
        actorId: actor.id,
        action: "EVENTS_IMPORTED",
        entity: "CalendarEvent",
        meta: {
          sessionId,
          sessionName,
          imported: valid.length,
          skipped: invalid.length,
          published: publish,
        },
      });
    },
    { timeout: 30000, maxWait: 10000 },
  );

  return succeed(
    { imported: valid.length, skipped: invalid.length, sessionName },
    invalid.length > 0
      ? [`${invalid.length} row${invalid.length === 1 ? "" : "s"} were skipped as invalid.`]
      : [],
  );
}

