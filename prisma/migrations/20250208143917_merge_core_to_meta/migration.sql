/*
  Warnings:

  - You are about to drop the column `core` on the `AgentModel` table. All the data in the column will be lost.
  - You are about to drop the column `core` on the `LocationModel` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AgentModel" DROP COLUMN "core";

-- AlterTable
ALTER TABLE "LocationModel" DROP COLUMN "core";
