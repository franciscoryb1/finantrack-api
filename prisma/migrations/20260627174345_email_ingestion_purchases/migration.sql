-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "PurchaseSource" AS ENUM ('MANUAL', 'EMAIL');

-- CreateEnum
CREATE TYPE "ParserConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "CreditCardPurchase" ADD COLUMN     "emailMessageId" TEXT,
ADD COLUMN     "parserConfidence" "ParserConfidence",
ADD COLUMN     "rawEmailData" JSONB,
ADD COLUMN     "source" "PurchaseSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "status" "PurchaseStatus" NOT NULL DEFAULT 'CONFIRMED',
ALTER COLUMN "creditCardId" DROP NOT NULL,
ALTER COLUMN "firstStatementSequence" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardPurchase_emailMessageId_key" ON "CreditCardPurchase"("emailMessageId");

-- CreateIndex
CREATE INDEX "CreditCardPurchase_userId_status_idx" ON "CreditCardPurchase"("userId", "status");
