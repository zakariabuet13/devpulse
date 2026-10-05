-- CreateEnum
CREATE TYPE "IssueState" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PrState" AS ENUM ('OPEN', 'CLOSED', 'MERGED');

-- AlterTable (hand-edited: cast in place instead of drop + re-add, so existing rows keep their state)
ALTER TABLE "Issue" ALTER COLUMN "state" TYPE "IssueState" USING upper("state")::"IssueState";

-- AlterTable
ALTER TABLE "PullRequest" ALTER COLUMN "state" TYPE "PrState" USING upper("state")::"PrState";
