/*
  Warnings:

  - Added the required column `balanceSnapshotCents` to the `Movement` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "balanceSnapshotCents" INTEGER NOT NULL,
ALTER COLUMN "categoryId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Movement_userId_isDeleted_idx" ON "Movement"("userId", "isDeleted");
