/*
  Warnings:

  - A unique constraint covering the columns `[platform,pid]` on the table `UserModel` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "UserModel_pid_key";

-- CreateIndex
CREATE UNIQUE INDEX "UserModel_platform_pid_key" ON "UserModel"("platform", "pid");
