-- AlterTable
ALTER TABLE "Category" ADD COLUMN "parentId" INTEGER;

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- DropIndex
DROP INDEX "Category_name_userId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_userId_parentId_key" ON "Category"("name", "userId", "parentId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
