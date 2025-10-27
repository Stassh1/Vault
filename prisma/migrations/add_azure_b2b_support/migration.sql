-- AlterTable
ALTER TABLE "User" ADD COLUMN "azureTenantId" TEXT,
ADD COLUMN "azureObjectId" TEXT,
ADD COLUMN "userType" TEXT DEFAULT 'Member',
ADD COLUMN "guestInviter" TEXT,
ADD COLUMN "externalEmail" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "azureTenantId" TEXT,
ADD COLUMN "azureGroupId" TEXT;

-- CreateIndex
CREATE INDEX "User_azureTenantId_idx" ON "User"("azureTenantId");

-- CreateIndex
CREATE INDEX "User_azureObjectId_idx" ON "User"("azureObjectId");

-- CreateIndex
CREATE INDEX "User_userType_idx" ON "User"("userType");

-- CreateIndex
CREATE INDEX "Team_azureTenantId_idx" ON "Team"("azureTenantId");
