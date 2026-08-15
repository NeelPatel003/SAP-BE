-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "address" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "display_name" TEXT,
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "primary_color" TEXT,
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "tax_id" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- CreateTable
CREATE TABLE "document_series" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "include_year" BOOLEAN NOT NULL DEFAULT true,
    "pad_length" INTEGER NOT NULL DEFAULT 5,
    "reset_policy" TEXT NOT NULL DEFAULT 'yearly',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_series_company_id_idx" ON "document_series"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_series_company_id_doc_type_key" ON "document_series"("company_id", "doc_type");

-- AddForeignKey
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
