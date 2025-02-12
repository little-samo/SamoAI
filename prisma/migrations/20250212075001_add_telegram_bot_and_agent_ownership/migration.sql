/*
  Warnings:

  - A unique constraint covering the columns `[telegramUsername]` on the table `AgentModel` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[telegramBotToken]` on the table `AgentModel` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AgentModel" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "owner_user_id" INTEGER,
ADD COLUMN     "telegramBotToken" TEXT,
ADD COLUMN     "telegramUsername" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AgentModel_telegramUsername_key" ON "AgentModel"("telegramUsername");

-- CreateIndex
CREATE UNIQUE INDEX "AgentModel_telegramBotToken_key" ON "AgentModel"("telegramBotToken");

-- CreateIndex
CREATE INDEX "AgentModel_owner_user_id_idx" ON "AgentModel"("owner_user_id");

-- AddForeignKey
ALTER TABLE "AgentModel" ADD CONSTRAINT "AgentModel_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "UserModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
