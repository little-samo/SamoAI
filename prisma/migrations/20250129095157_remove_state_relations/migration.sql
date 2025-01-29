/*
  Warnings:

  - You are about to drop the column `state` on the `AgentModel` table. All the data in the column will be lost.
  - You are about to drop the column `owner_agent_id` on the `LocationModel` table. All the data in the column will be lost.
  - You are about to drop the column `owner_user_id` on the `LocationModel` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `LocationModel` table. All the data in the column will be lost.
  - You are about to drop the `AgentUserMemoryModel` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MessageModel` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AgentUserMemoryModel" DROP CONSTRAINT "AgentUserMemoryModel_agent_id_fkey";

-- DropForeignKey
ALTER TABLE "AgentUserMemoryModel" DROP CONSTRAINT "AgentUserMemoryModel_user_id_fkey";

-- DropForeignKey
ALTER TABLE "LocationModel" DROP CONSTRAINT "LocationModel_owner_agent_id_fkey";

-- DropForeignKey
ALTER TABLE "LocationModel" DROP CONSTRAINT "LocationModel_owner_user_id_fkey";

-- DropForeignKey
ALTER TABLE "MessageModel" DROP CONSTRAINT "MessageModel_location_id_fkey";

-- DropForeignKey
ALTER TABLE "MessageModel" DROP CONSTRAINT "MessageModel_receiver_agent_id_fkey";

-- DropForeignKey
ALTER TABLE "MessageModel" DROP CONSTRAINT "MessageModel_receiver_user_id_fkey";

-- DropForeignKey
ALTER TABLE "MessageModel" DROP CONSTRAINT "MessageModel_sender_agent_id_fkey";

-- DropForeignKey
ALTER TABLE "MessageModel" DROP CONSTRAINT "MessageModel_sender_user_id_fkey";

-- AlterTable
ALTER TABLE "AgentModel" DROP COLUMN "state";

-- AlterTable
ALTER TABLE "LocationModel" DROP COLUMN "owner_agent_id",
DROP COLUMN "owner_user_id",
DROP COLUMN "state";

-- DropTable
DROP TABLE "AgentUserMemoryModel";

-- DropTable
DROP TABLE "MessageModel";
