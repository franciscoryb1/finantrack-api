-- CreateTable
CREATE TABLE "_CreditCardPurchaseToTag" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CreditCardPurchaseToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_CreditCardPurchaseToTag_B_index" ON "_CreditCardPurchaseToTag"("B");

-- AddForeignKey
ALTER TABLE "_CreditCardPurchaseToTag" ADD CONSTRAINT "_CreditCardPurchaseToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "CreditCardPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CreditCardPurchaseToTag" ADD CONSTRAINT "_CreditCardPurchaseToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
