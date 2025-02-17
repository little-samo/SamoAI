-- DropIndex
DROP INDEX "LocationModel_telegram_chat_id_key";

-- CreateIndex
CREATE INDEX "LocationModel_telegram_chat_id_idx" ON "LocationModel"("telegram_chat_id");
