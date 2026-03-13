-- AlterTable
ALTER TABLE "CreditCardPurchase" ADD COLUMN "reimbursementAmountCents" INTEGER,
ADD COLUMN "reimbursementAccountId" INTEGER,
ADD COLUMN "reimbursementAt" TIMESTAMP(3),
ADD COLUMN "reimbursementMovementId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardPurchase_reimbursementMovementId_key" ON "CreditCardPurchase"("reimbursementMovementId");

-- AddForeignKey
ALTER TABLE "CreditCardPurchase" ADD CONSTRAINT "CreditCardPurchase_reimbursementAccountId_fkey"
  FOREIGN KEY ("reimbursementAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardPurchase" ADD CONSTRAINT "CreditCardPurchase_reimbursementMovementId_fkey"
  FOREIGN KEY ("reimbursementMovementId") REFERENCES "Movement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
