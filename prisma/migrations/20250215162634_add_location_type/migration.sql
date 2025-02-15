-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('PRIVATE', 'GROUP');

-- AlterTable
ALTER TABLE "LocationModel" ADD COLUMN     "type" "LocationType" NOT NULL DEFAULT 'PRIVATE';
