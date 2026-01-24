/*
  Warnings:

  - Added the required column `billingCycleOffset` to the `CreditCardInstallment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `firstStatementSequence` to the `CreditCardPurchase` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CreditCardInstallment" ADD COLUMN     "billingCycleOffset" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "CreditCardPurchase" ADD COLUMN     "firstStatementSequence" INTEGER NOT NULL;
