-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER,
    "location" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "venueId" TEXT,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "createdById" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarEvent_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EventCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CalendarEvent_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalendarEvent_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CalendarEvent" ("allDay", "categoryId", "createdAt", "createdById", "description", "endAt", "id", "location", "publishedAt", "scope", "semesterId", "startAt", "status", "title", "updatedAt", "version", "visibility") SELECT "allDay", "categoryId", "createdAt", "createdById", "description", "endAt", "id", "location", "publishedAt", "scope", "semesterId", "startAt", "status", "title", "updatedAt", "version", "visibility" FROM "CalendarEvent";
DROP TABLE "CalendarEvent";
ALTER TABLE "new_CalendarEvent" RENAME TO "CalendarEvent";
CREATE INDEX "CalendarEvent_startAt_idx" ON "CalendarEvent"("startAt");
CREATE INDEX "CalendarEvent_endAt_idx" ON "CalendarEvent"("endAt");
CREATE INDEX "CalendarEvent_status_idx" ON "CalendarEvent"("status");
CREATE INDEX "CalendarEvent_status_startAt_idx" ON "CalendarEvent"("status", "startAt");
CREATE INDEX "CalendarEvent_visibility_status_idx" ON "CalendarEvent"("visibility", "status");
CREATE INDEX "CalendarEvent_semesterId_idx" ON "CalendarEvent"("semesterId");
CREATE INDEX "CalendarEvent_categoryId_idx" ON "CalendarEvent"("categoryId");
CREATE INDEX "CalendarEvent_venueId_idx" ON "CalendarEvent"("venueId");
CREATE INDEX "CalendarEvent_scope_idx" ON "CalendarEvent"("scope");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Venue_name_key" ON "Venue"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_code_key" ON "Venue"("code");

-- CreateIndex
CREATE INDEX "Venue_name_idx" ON "Venue"("name");
