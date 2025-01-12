/*
  Warnings:

  - You are about to drop the column `emotion` on the `MessageModel` table. All the data in the column will be lost.
  - You are about to drop the column `innerThought` on the `MessageModel` table. All the data in the column will be lost.
  - You are about to drop the `AgentLlmMessageModel` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_AgentModelToLlmApiModel` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `content` on the `MessageModel` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "AgentLlmMessageModel" DROP CONSTRAINT "AgentLlmMessageModel_agent_id_fkey";

-- DropForeignKey
ALTER TABLE "AgentLlmMessageModel" DROP CONSTRAINT "AgentLlmMessageModel_location_id_fkey";

-- DropForeignKey
ALTER TABLE "_AgentModelToLlmApiModel" DROP CONSTRAINT "_AgentModelToLlmApiModel_A_fkey";

-- DropForeignKey
ALTER TABLE "_AgentModelToLlmApiModel" DROP CONSTRAINT "_AgentModelToLlmApiModel_B_fkey";

-- AlterTable
ALTER TABLE "AgentModel" ADD COLUMN     "state" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MessageModel" DROP COLUMN "emotion",
DROP COLUMN "innerThought",
DROP COLUMN "content",
ADD COLUMN     "content" JSONB NOT NULL;

-- DropTable
DROP TABLE "AgentLlmMessageModel";

-- DropTable
DROP TABLE "_AgentModelToLlmApiModel";

-- CreateTable
CREATE TABLE "_agentLlmApis" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_agentLlmApis_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_agentLlmApis_B_index" ON "_agentLlmApis"("B");

-- AddForeignKey
ALTER TABLE "_agentLlmApis" ADD CONSTRAINT "_agentLlmApis_A_fkey" FOREIGN KEY ("A") REFERENCES "AgentModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_agentLlmApis" ADD CONSTRAINT "_agentLlmApis_B_fkey" FOREIGN KEY ("B") REFERENCES "LlmApiModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
