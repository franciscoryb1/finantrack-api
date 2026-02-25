/*
  Warnings:

  - You are about to drop the column `closingDay` on the `CreditCard` table. All the data in the column will be lost.
  - You are about to drop the column `dueDay` on the `CreditCard` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CreditCard" DROP COLUMN "closingDay",
DROP COLUMN "dueDay";
