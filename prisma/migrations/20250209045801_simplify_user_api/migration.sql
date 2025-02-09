/*
  Warnings:

  - You are about to drop the `LlmApiModel` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserApiHistoryModel` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_agentLlmApis` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[key]` on the table `UserApiKeyModel` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "UserApiHistoryModel" DROP CONSTRAINT "UserApiHistoryModel_user_model_id_fkey";

-- DropForeignKey
ALTER TABLE "_agentLlmApis" DROP CONSTRAINT "_agentLlmApis_A_fkey";

-- DropForeignKey
ALTER TABLE "_agentLlmApis" DROP CONSTRAINT "_agentLlmApis_B_fkey";

-- DropTable
DROP TABLE "LlmApiModel";

-- DropTable
DROP TABLE "UserApiHistoryModel";

-- DropTable
DROP TABLE "_agentLlmApis";

-- CreateIndex
CREATE UNIQUE INDEX "UserApiKeyModel_key_key" ON "UserApiKeyModel"("key");
