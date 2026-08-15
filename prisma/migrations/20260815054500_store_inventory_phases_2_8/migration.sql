ALTER TABLE "goods_receipts" ADD COLUMN "supplier_invoice_id" TEXT;
ALTER TABLE "goods_receipts" ADD COLUMN "draft_payload" JSONB;

CREATE TABLE "stock_verifications" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "warehouse_id" TEXT,
  "location_id" TEXT,
  "system_qty" DOUBLE PRECISION NOT NULL,
  "counted_qty" DOUBLE PRECISION NOT NULL,
  "variance" DOUBLE PRECISION NOT NULL,
  "notes" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_invoices" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "invoice_number" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "verification_status" TEXT NOT NULL DEFAULT 'pending',
  "attachment_url" TEXT,
  "verified_at" TIMESTAMP(3),
  "verified_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounts_bookings" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "supplier_invoice_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'booked',
  "debit_lines" JSONB NOT NULL,
  "credit_lines" JSONB NOT NULL,
  "booked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "booked_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounts_bookings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_invoices_company_id_invoice_number_key"
  ON "supplier_invoices"("company_id", "invoice_number");
CREATE INDEX "stock_verifications_company_id_created_at_idx"
  ON "stock_verifications"("company_id", "created_at");
CREATE INDEX "stock_verifications_batch_id_idx" ON "stock_verifications"("batch_id");
CREATE INDEX "supplier_invoices_company_id_verification_status_idx"
  ON "supplier_invoices"("company_id", "verification_status");
CREATE INDEX "accounts_bookings_company_id_status_idx"
  ON "accounts_bookings"("company_id", "status");
CREATE INDEX "accounts_bookings_supplier_invoice_id_idx"
  ON "accounts_bookings"("supplier_invoice_id");
CREATE INDEX "goods_receipts_supplier_invoice_id_idx"
  ON "goods_receipts"("supplier_invoice_id");

ALTER TABLE "stock_verifications"
  ADD CONSTRAINT "stock_verifications_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_verifications"
  ADD CONSTRAINT "stock_verifications_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_invoices"
  ADD CONSTRAINT "supplier_invoices_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts_bookings"
  ADD CONSTRAINT "accounts_bookings_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts_bookings"
  ADD CONSTRAINT "accounts_bookings_supplier_invoice_id_fkey"
  FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts"
  ADD CONSTRAINT "goods_receipts_supplier_invoice_id_fkey"
  FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
