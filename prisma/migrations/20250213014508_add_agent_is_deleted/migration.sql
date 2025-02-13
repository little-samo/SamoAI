/*
  Warnings:

  - You are about to drop the column `isActive` on the `AgentModel` table. All the data in the column will be lost.
  - You are about to drop the column `telegramBotToken` on the `AgentModel` table. All the data in the column will be lost.
  - You are about to drop the column `telegramUsername` on the `AgentModel` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[telegram_username]` on the table `AgentModel` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[telegram_bot_token]` on the table `AgentModel` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "AgentModel_telegramBotToken_key";

-- DropIndex
DROP INDEX "AgentModel_telegramUsername_key";

-- AlterTable
ALTER TABLE "AgentModel" DROP COLUMN "isActive",
DROP COLUMN "telegramBotToken",
DROP COLUMN "telegramUsername",
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "telegram_bot_token" TEXT,
ADD COLUMN     "telegram_username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AgentModel_telegram_username_key" ON "AgentModel"("telegram_username");

-- CreateIndex
CREATE UNIQUE INDEX "AgentModel_telegram_bot_token_key" ON "AgentModel"("telegram_bot_token");
