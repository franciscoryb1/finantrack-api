/*
  Warnings:

  - You are about to drop the column `accountId` on the `RecurringExpense` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "RecurringExpense" DROP CONSTRAINT "RecurringExpense_accountId_fkey";

-- DropIndex
DROP INDEX "RecurringExpense_accountId_idx";

-- AlterTable
ALTER TABLE "RecurringExpense" DROP COLUMN "accountId";
