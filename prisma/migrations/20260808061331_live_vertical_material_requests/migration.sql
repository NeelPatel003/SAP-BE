-- AlterEnum
ALTER TYPE "PoStatus" ADD VALUE 'draft';

-- AlterTable
ALTER TABLE "goods_receipts" ADD COLUMN "accounts_booked_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "material_requests" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "production_order_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_by" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_request_lines" (
    "id" TEXT NOT NULL,
    "material_request_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "requested_qty" DOUBLE PRECISION NOT NULL,
    "issued_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "material_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "material_requests_company_id_idx" ON "material_requests"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_requests_company_id_number_key" ON "material_requests"("company_id", "number");

-- CreateIndex
CREATE INDEX "material_request_lines_material_request_id_idx" ON "material_request_lines"("material_request_id");

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_request_lines" ADD CONSTRAINT "material_request_lines_material_request_id_fkey" FOREIGN KEY ("material_request_id") REFERENCES "material_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_request_lines" ADD CONSTRAINT "material_request_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
