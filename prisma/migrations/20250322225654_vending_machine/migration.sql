-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "discordId" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendingMachine_Product" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VendingMachine_Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendingMachine_Buy" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "VendingMachine_Buy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "VendingMachine_Product_name_key" ON "VendingMachine_Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "VendingMachine_Buy_userId_key" ON "VendingMachine_Buy"("userId");

-- AddForeignKey
ALTER TABLE "VendingMachine_Buy" ADD CONSTRAINT "VendingMachine_Buy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendingMachine_Buy" ADD CONSTRAINT "VendingMachine_Buy_productId_fkey" FOREIGN KEY ("productId") REFERENCES "VendingMachine_Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
