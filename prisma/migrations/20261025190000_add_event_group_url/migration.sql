-- Optional WhatsApp (or other) group link on an event. Only the host and the
-- people who joined the event may be shown it (enforced in lib/actions/events.ts).
-- AlterTable
ALTER TABLE "Event" ADD COLUMN "groupUrl" TEXT;
