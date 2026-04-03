/*
  Warnings:

  - A unique constraint covering the columns `[creditCardPurchaseId]` on the table `RecurringExpensePayment` will be added. If there are existing duplicate values, this will fail.

*/

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

  -- AddForeignKey
  ALTER TABLE "CreditCardStatementExtra" ADD CONSTRAINT "CreditCardStatementExtra_statementId_fkey"
  FOREIGN KEY ("statementId") REFERENCES "CreditCardStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;