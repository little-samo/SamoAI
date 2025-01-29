/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `LocationModel` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "LocationModel_name_key" ON "LocationModel"("name");
