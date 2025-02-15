/*
  Warnings:

  - A unique constraint covering the columns `[telegram_id]` on the table `AgentModel` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AgentModel" ADD COLUMN     "telegram_id" BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "AgentModel_telegram_id_key" ON "AgentModel"("telegram_id");
