/*
  Warnings:

  - You are about to drop the column `temperature` on the `AgentModel` table. All the data in the column will be lost.
  - Made the column `nickname` on table `UserModel` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "LocationModel" DROP CONSTRAINT "LocationModel_owner_agent_id_fkey";

-- DropForeignKey
ALTER TABLE "LocationModel" DROP CONSTRAINT "LocationModel_owner_user_id_fkey";

-- AlterTable
ALTER TABLE "AgentModel" DROP COLUMN "temperature",
ADD COLUMN     "meta" JSONB NOT NULL DEFAULT '{}',
ALTER COLUMN "core" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "LocationModel" ADD COLUMN     "meta" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "state" JSONB NOT NULL DEFAULT '{}',
ALTER COLUMN "owner_agent_id" DROP NOT NULL,
ALTER COLUMN "owner_user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UserModel" ALTER COLUMN "nickname" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "LocationModel" ADD CONSTRAINT "LocationModel_owner_agent_id_fkey" FOREIGN KEY ("owner_agent_id") REFERENCES "AgentModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationModel" ADD CONSTRAINT "LocationModel_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "UserModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
