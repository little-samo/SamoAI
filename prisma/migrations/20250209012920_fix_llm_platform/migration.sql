/*
  Warnings:

  - Changed the type of `platform` on the `LlmApiKeyModel` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `platform` on the `LlmApiModel` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "LlmPlatform" AS ENUM ('ANTHROPIC', 'OPENAI');

-- AlterTable
ALTER TABLE "LlmApiKeyModel" DROP COLUMN "platform",
ADD COLUMN     "platform" "LlmPlatform" NOT NULL;

-- AlterTable
ALTER TABLE "LlmApiModel" DROP COLUMN "platform",
ADD COLUMN     "platform" "LlmPlatform" NOT NULL;

-- DropEnum
DROP TYPE "LLMPlatform";

-- CreateIndex
CREATE UNIQUE INDEX "LlmApiKeyModel_user_model_id_platform_key" ON "LlmApiKeyModel"("user_model_id", "platform");
