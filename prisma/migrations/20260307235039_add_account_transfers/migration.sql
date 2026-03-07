-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MovementType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "MovementType" ADD VALUE 'TRANSFER_IN';

-- CreateTable
CREATE TABLE "AccountTransfer" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "fromAccountId" INTEGER NOT NULL,
    "toAccountId" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT,
    "transferredAt" TIMESTAMP(3) NOT NULL,
    "fromMovementId" INTEGER NOT NULL,
    "toMovementId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountTransfer_fromMovementId_key" ON "AccountTransfer"("fromMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountTransfer_toMovementId_key" ON "AccountTransfer"("toMovementId");

-- CreateIndex
CREATE INDEX "AccountTransfer_userId_idx" ON "AccountTransfer"("userId");

-- CreateIndex
CREATE INDEX "AccountTransfer_fromAccountId_idx" ON "AccountTransfer"("fromAccountId");

-- CreateIndex
CREATE INDEX "AccountTransfer_toAccountId_idx" ON "AccountTransfer"("toAccountId");

-- AddForeignKey
ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_fromMovementId_fkey" FOREIGN KEY ("fromMovementId") REFERENCES "Movement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_toMovementId_fkey" FOREIGN KEY ("toMovementId") REFERENCES "Movement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
