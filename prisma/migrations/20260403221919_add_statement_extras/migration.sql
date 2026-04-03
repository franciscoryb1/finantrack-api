/*
  Warnings:

  - A unique constraint covering the columns `[creditCardPurchaseId]` on the table `RecurringExpensePayment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "RecurringExpensePayment" ADD COLUMN     "creditCardPurchaseId" INTEGER,
ALTER COLUMN "movementId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CreditCardStatementExtra" (
    "id" SERIAL NOT NULL,
    "statementId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "CreditCardStatementExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditCardStatementExtra_statementId_idx" ON "CreditCardStatementExtra"("statementId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringExpensePayment_creditCardPurchaseId_key" ON "RecurringExpensePayment"("creditCardPurchaseId");

-- AddForeignKey
ALTER TABLE "CreditCardStatementExtra" ADD CONSTRAINT "CreditCardStatementExtra_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CreditCardStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpensePayment" ADD CONSTRAINT "RecurringExpensePayment_creditCardPurchaseId_fkey" FOREIGN KEY ("creditCardPurchaseId") REFERENCES "CreditCardPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
