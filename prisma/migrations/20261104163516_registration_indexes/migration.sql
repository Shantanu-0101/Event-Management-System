-- CreateIndex
CREATE INDEX "registrations_user_id_status_idx" ON "registrations"("user_id", "status");

-- CreateIndex
CREATE INDEX "registrations_team_id_idx" ON "registrations"("team_id");
