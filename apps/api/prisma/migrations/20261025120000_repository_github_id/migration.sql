-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "githubId" BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "Repository_githubId_key" ON "Repository"("githubId");
