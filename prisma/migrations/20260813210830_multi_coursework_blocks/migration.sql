-- DropIndex
DROP INDEX "ScheduleEvent_assignmentId_key";

-- AlterTable
ALTER TABLE "ScheduleEvent" ADD COLUMN     "isAutoScheduled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing auto-scheduled coursework blocks
UPDATE "ScheduleEvent"
SET "isAutoScheduled" = true
WHERE "assignmentId" IS NOT NULL AND "type" = 'coursework';

-- CreateIndex
CREATE INDEX "ScheduleEvent_assignmentId_idx" ON "ScheduleEvent"("assignmentId");
