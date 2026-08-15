-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('PLATFORM', 'COMPANY');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('ZONE', 'RACK', 'SHELF', 'BIN');

-- CreateEnum
CREATE TYPE "GrnStatus" AS ENUM ('draft', 'pending_qc', 'partial', 'approved', 'rejected', 'completed');

-- CreateEnum
CREATE TYPE "PoStatus" AS ENUM ('open', 'partial', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "QcResult" AS ENUM ('accepted', 'rejected', 'hold', 'deviation');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('draft', 'posted', 'cancelled');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('draft', 'posted', 'cancelled');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('active', 'released', 'consumed', 'cancelled');

-- CreateEnum
CREATE TYPE "TraceLinkType" AS ENUM ('grn_to_batch', 'batch_to_issue', 'issue_to_production', 'batch_to_return', 'batch_to_transfer');

-- AlterTable
ALTER TABLE "permissions" ADD COLUMN     "module_id" TEXT;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "scope" "RoleScope" NOT NULL DEFAULT 'COMPANY';

-- CreateTable
CREATE TABLE "modules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_categories" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subcategory" TEXT,
    "hsn" TEXT,
    "gst_percent" DOUBLE PRECISION,
    "drawing_number" TEXT,
    "revision" TEXT,
    "min_stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorder_level" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorder_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "safety_stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "default_warehouse_id" TEXT,
    "default_location_id" TEXT,
    "shelf_life_days" INTEGER,
    "lead_time_days" INTEGER,
    "preferred_supplier_id" TEXT,
    "qc_required" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "type" "LocationType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_quality_metrics" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "quality_pct" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "rejection_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ppm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complaint_count" INTEGER NOT NULL DEFAULT 0,
    "inspected_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accepted_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rejected_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_quality_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "PoStatus" NOT NULL DEFAULT 'open',
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "ordered_qty" DOUBLE PRECISION NOT NULL,
    "received_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit_price" DOUBLE PRECISION,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "required_date" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 5,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "purchase_order_id" TEXT,
    "supplier_id" TEXT NOT NULL,
    "status" "GrnStatus" NOT NULL DEFAULT 'draft',
    "receive_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier_invoice" TEXT,
    "supplier_challan" TEXT,
    "vehicle_number" TEXT,
    "transport" TEXT,
    "receiving_person" TEXT,
    "ready_for_accounts" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "id" TEXT NOT NULL,
    "goods_receipt_id" TEXT NOT NULL,
    "purchase_order_item_id" TEXT,
    "material_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "location_id" TEXT,
    "ordered_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "received_qty" DOUBLE PRECISION NOT NULL,
    "damage_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "short_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "excess_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accepted_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rejected_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rework_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qc_required" BOOLEAN NOT NULL DEFAULT true,
    "qc_status" TEXT NOT NULL DEFAULT 'pending',
    "batch_id" TEXT,
    "supplier_batch" TEXT,
    "manufacturing_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "lot_number" TEXT,
    "heat_number" TEXT,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_inspections" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "goods_receipt_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "inspected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspected_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qc_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_inspection_items" (
    "id" TEXT NOT NULL,
    "qc_inspection_id" TEXT NOT NULL,
    "goods_receipt_item_id" TEXT NOT NULL,
    "result" "QcResult" NOT NULL,
    "accepted_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rejected_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deviation_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rework_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inspection_pct" DOUBLE PRECISION,
    "remarks" TEXT,

    CONSTRAINT "qc_inspection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_batches" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "goods_receipt_id" TEXT,
    "batch_number" TEXT NOT NULL,
    "supplier_batch" TEXT,
    "manufacturing_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "lot_number" TEXT,
    "heat_number" TEXT,
    "barcode" TEXT,
    "qr_payload" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_stock" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "location_id" TEXT,
    "status" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "warehouse_id" TEXT,
    "location_id" TEXT,
    "transaction_type" TEXT NOT NULL,
    "status" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "balance_after" DOUBLE PRECISION,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_issues" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "production_order_id" TEXT,
    "warehouse_id" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'posted',
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by" TEXT,
    "received_by" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_issue_items" (
    "id" TEXT NOT NULL,
    "material_issue_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "fifo_override" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "material_issue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_returns" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returned_by" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_return_items" (
    "id" TEXT NOT NULL,
    "material_return_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'good',

    CONSTRAINT "material_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "from_warehouse_id" TEXT NOT NULL,
    "to_warehouse_id" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'posted',
    "transfer_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_lines" (
    "id" TEXT NOT NULL,
    "stock_transfer_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "from_location_id" TEXT,
    "to_location_id" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',

    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_reservations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "production_order_id" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'active',
    "production_date" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 5,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_traceability_links" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "link_type" "TraceLinkType" NOT NULL,
    "from_batch_id" TEXT,
    "to_batch_id" TEXT,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_traceability_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fifo_override_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "approved_by" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fifo_override_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "modules_code_key" ON "modules"("code");

-- CreateIndex
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");

-- CreateIndex
CREATE INDEX "material_categories_company_id_idx" ON "material_categories"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_categories_company_id_code_key" ON "material_categories"("company_id", "code");

-- CreateIndex
CREATE INDEX "materials_company_id_idx" ON "materials"("company_id");

-- CreateIndex
CREATE INDEX "materials_category_id_idx" ON "materials"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "materials_company_id_code_key" ON "materials"("company_id", "code");

-- CreateIndex
CREATE INDEX "warehouses_company_id_idx" ON "warehouses"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_company_id_code_key" ON "warehouses"("company_id", "code");

-- CreateIndex
CREATE INDEX "locations_company_id_idx" ON "locations"("company_id");

-- CreateIndex
CREATE INDEX "locations_warehouse_id_idx" ON "locations"("warehouse_id");

-- CreateIndex
CREATE INDEX "locations_parent_id_idx" ON "locations"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "locations_company_id_warehouse_id_code_key" ON "locations"("company_id", "warehouse_id", "code");

-- CreateIndex
CREATE INDEX "suppliers_company_id_idx" ON "suppliers"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_code_key" ON "suppliers"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_quality_metrics_supplier_id_key" ON "supplier_quality_metrics"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_quality_metrics_company_id_idx" ON "supplier_quality_metrics"("company_id");

-- CreateIndex
CREATE INDEX "purchase_orders_company_id_idx" ON "purchase_orders"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_company_id_number_key" ON "purchase_orders"("company_id", "number");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_material_id_idx" ON "purchase_order_items"("material_id");

-- CreateIndex
CREATE INDEX "production_orders_company_id_idx" ON "production_orders"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_company_id_number_key" ON "production_orders"("company_id", "number");

-- CreateIndex
CREATE INDEX "goods_receipts_company_id_idx" ON "goods_receipts"("company_id");

-- CreateIndex
CREATE INDEX "goods_receipts_status_idx" ON "goods_receipts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_company_id_number_key" ON "goods_receipts"("company_id", "number");

-- CreateIndex
CREATE INDEX "goods_receipt_items_goods_receipt_id_idx" ON "goods_receipt_items"("goods_receipt_id");

-- CreateIndex
CREATE INDEX "goods_receipt_items_material_id_idx" ON "goods_receipt_items"("material_id");

-- CreateIndex
CREATE INDEX "qc_inspections_company_id_idx" ON "qc_inspections"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_inspections_company_id_number_key" ON "qc_inspections"("company_id", "number");

-- CreateIndex
CREATE INDEX "qc_inspection_items_qc_inspection_id_idx" ON "qc_inspection_items"("qc_inspection_id");

-- CreateIndex
CREATE INDEX "inventory_batches_company_id_material_id_idx" ON "inventory_batches"("company_id", "material_id");

-- CreateIndex
CREATE INDEX "inventory_batches_received_at_idx" ON "inventory_batches"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_batches_company_id_batch_number_key" ON "inventory_batches"("company_id", "batch_number");

-- CreateIndex
CREATE INDEX "inventory_stock_company_id_material_id_status_idx" ON "inventory_stock"("company_id", "material_id", "status");

-- CreateIndex
CREATE INDEX "inventory_stock_warehouse_id_idx" ON "inventory_stock"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_company_id_material_id_batch_id_warehouse_i_key" ON "inventory_stock"("company_id", "material_id", "batch_id", "warehouse_id", "location_id", "status");

-- CreateIndex
CREATE INDEX "inventory_transactions_company_id_created_at_idx" ON "inventory_transactions"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_material_id_idx" ON "inventory_transactions"("material_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_batch_id_idx" ON "inventory_transactions"("batch_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_reference_type_reference_id_idx" ON "inventory_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "material_issues_company_id_idx" ON "material_issues"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_issues_company_id_number_key" ON "material_issues"("company_id", "number");

-- CreateIndex
CREATE INDEX "material_issue_items_material_issue_id_idx" ON "material_issue_items"("material_issue_id");

-- CreateIndex
CREATE INDEX "material_returns_company_id_idx" ON "material_returns"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_returns_company_id_number_key" ON "material_returns"("company_id", "number");

-- CreateIndex
CREATE INDEX "material_return_items_material_return_id_idx" ON "material_return_items"("material_return_id");

-- CreateIndex
CREATE INDEX "stock_transfers_company_id_idx" ON "stock_transfers"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_company_id_number_key" ON "stock_transfers"("company_id", "number");

-- CreateIndex
CREATE INDEX "stock_transfer_lines_stock_transfer_id_idx" ON "stock_transfer_lines"("stock_transfer_id");

-- CreateIndex
CREATE INDEX "planning_reservations_company_id_status_idx" ON "planning_reservations"("company_id", "status");

-- CreateIndex
CREATE INDEX "planning_reservations_material_id_idx" ON "planning_reservations"("material_id");

-- CreateIndex
CREATE INDEX "batch_traceability_links_company_id_idx" ON "batch_traceability_links"("company_id");

-- CreateIndex
CREATE INDEX "batch_traceability_links_from_batch_id_idx" ON "batch_traceability_links"("from_batch_id");

-- CreateIndex
CREATE INDEX "batch_traceability_links_to_batch_id_idx" ON "batch_traceability_links"("to_batch_id");

-- CreateIndex
CREATE INDEX "fifo_override_logs_company_id_idx" ON "fifo_override_logs"("company_id");

-- CreateIndex
CREATE INDEX "permissions_module_id_idx" ON "permissions"("module_id");

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_categories" ADD CONSTRAINT "material_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "material_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_default_warehouse_id_fkey" FOREIGN KEY ("default_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_default_location_id_fkey" FOREIGN KEY ("default_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_preferred_supplier_id_fkey" FOREIGN KEY ("preferred_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quality_metrics" ADD CONSTRAINT "supplier_quality_metrics_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quality_metrics" ADD CONSTRAINT "supplier_quality_metrics_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspection_items" ADD CONSTRAINT "qc_inspection_items_qc_inspection_id_fkey" FOREIGN KEY ("qc_inspection_id") REFERENCES "qc_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspection_items" ADD CONSTRAINT "qc_inspection_items_goods_receipt_item_id_fkey" FOREIGN KEY ("goods_receipt_item_id") REFERENCES "goods_receipt_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issues" ADD CONSTRAINT "material_issues_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issues" ADD CONSTRAINT "material_issues_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issues" ADD CONSTRAINT "material_issues_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issue_items" ADD CONSTRAINT "material_issue_items_material_issue_id_fkey" FOREIGN KEY ("material_issue_id") REFERENCES "material_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issue_items" ADD CONSTRAINT "material_issue_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issue_items" ADD CONSTRAINT "material_issue_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_return_items" ADD CONSTRAINT "material_return_items_material_return_id_fkey" FOREIGN KEY ("material_return_id") REFERENCES "material_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_return_items" ADD CONSTRAINT "material_return_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_return_items" ADD CONSTRAINT "material_return_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_stock_transfer_id_fkey" FOREIGN KEY ("stock_transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_reservations" ADD CONSTRAINT "planning_reservations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_reservations" ADD CONSTRAINT "planning_reservations_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_reservations" ADD CONSTRAINT "planning_reservations_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_reservations" ADD CONSTRAINT "planning_reservations_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_traceability_links" ADD CONSTRAINT "batch_traceability_links_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_traceability_links" ADD CONSTRAINT "batch_traceability_links_from_batch_id_fkey" FOREIGN KEY ("from_batch_id") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_traceability_links" ADD CONSTRAINT "batch_traceability_links_to_batch_id_fkey" FOREIGN KEY ("to_batch_id") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifo_override_logs" ADD CONSTRAINT "fifo_override_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifo_override_logs" ADD CONSTRAINT "fifo_override_logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
