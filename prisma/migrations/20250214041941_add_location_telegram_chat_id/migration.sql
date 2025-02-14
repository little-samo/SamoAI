/*
  Warnings:

  - A unique constraint covering the columns `[telegram_chat_id]` on the table `LocationModel` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "LocationModel" ADD COLUMN     "telegram_chat_id" BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "LocationModel_telegram_chat_id_key" ON "LocationModel"("telegram_chat_id");
