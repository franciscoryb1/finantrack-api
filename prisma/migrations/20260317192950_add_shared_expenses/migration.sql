-- AlterTable
ALTER TABLE "CreditCardPurchase" ADD COLUMN     "sharedAmountCents" INTEGER;

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "sharedAmountCents" INTEGER,
ADD COLUMN     "sharedFromCreditCardPurchaseId" INTEGER,
ADD COLUMN     "sharedFromMovementId" INTEGER;

-- CreateIndex
CREATE INDEX "Movement_sharedFromMovementId_idx" ON "Movement"("sharedFromMovementId");

-- CreateIndex
CREATE INDEX "Movement_sharedFromCreditCardPurchaseId_idx" ON "Movement"("sharedFromCreditCardPurchaseId");

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_sharedFromMovementId_fkey" FOREIGN KEY ("sharedFromMovementId") REFERENCES "Movement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_sharedFromCreditCardPurchaseId_fkey" FOREIGN KEY ("sharedFromCreditCardPurchaseId") REFERENCES "CreditCardPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
