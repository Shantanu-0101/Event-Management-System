-- DropIndex
DROP INDEX "results_event_id_idx";

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "certificate_template_url" TEXT,
ADD COLUMN     "reminder_sent_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "results_event_id_position_key" ON "results"("event_id", "position");

