-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "serial_tracked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "feature_usage_events" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "feature" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "input_units" INTEGER NOT NULL DEFAULT 0,
    "output_units" INTEGER NOT NULL DEFAULT 0,
    "cost_micros" INTEGER NOT NULL DEFAULT 0,
    "request_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "meta" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_headers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_headers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_lines" (
    "id" TEXT NOT NULL,
    "bom_header_id" TEXT NOT NULL,
    "component_material_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "scrap_factor" DOUBLE PRECISION,

    CONSTRAINT "bom_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_serials" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "serial_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "material_issue_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_serials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_orders" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customer_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "ship_date" TIMESTAMP(3),
    "warehouse_id" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_lines" (
    "id" TEXT NOT NULL,
    "dispatch_order_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "serial_ids" JSONB,

    CONSTRAINT "dispatch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feature_usage_events_company_id_created_at_idx" ON "feature_usage_events"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "feature_usage_events_company_id_feature_idx" ON "feature_usage_events"("company_id", "feature");

-- CreateIndex
CREATE INDEX "feature_usage_events_user_id_idx" ON "feature_usage_events"("user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_company_id_created_at_idx" ON "notifications"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "bom_headers_company_id_idx" ON "bom_headers"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "bom_headers_company_id_material_id_version_key" ON "bom_headers"("company_id", "material_id", "version");

-- CreateIndex
CREATE INDEX "bom_lines_bom_header_id_idx" ON "bom_lines"("bom_header_id");

-- CreateIndex
CREATE INDEX "inventory_serials_company_id_material_id_idx" ON "inventory_serials"("company_id", "material_id");

-- CreateIndex
CREATE INDEX "inventory_serials_batch_id_idx" ON "inventory_serials"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_serials_company_id_serial_number_key" ON "inventory_serials"("company_id", "serial_number");

-- CreateIndex
CREATE INDEX "dispatch_orders_company_id_idx" ON "dispatch_orders"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_orders_company_id_number_key" ON "dispatch_orders"("company_id", "number");

-- CreateIndex
CREATE INDEX "dispatch_lines_dispatch_order_id_idx" ON "dispatch_lines"("dispatch_order_id");

-- AddForeignKey
ALTER TABLE "feature_usage_events" ADD CONSTRAINT "feature_usage_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_usage_events" ADD CONSTRAINT "feature_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_headers" ADD CONSTRAINT "bom_headers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_headers" ADD CONSTRAINT "bom_headers_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bom_header_id_fkey" FOREIGN KEY ("bom_header_id") REFERENCES "bom_headers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_component_material_id_fkey" FOREIGN KEY ("component_material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_serials" ADD CONSTRAINT "inventory_serials_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_serials" ADD CONSTRAINT "inventory_serials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_serials" ADD CONSTRAINT "inventory_serials_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_serials" ADD CONSTRAINT "inventory_serials_material_issue_item_id_fkey" FOREIGN KEY ("material_issue_item_id") REFERENCES "material_issue_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_orders" ADD CONSTRAINT "dispatch_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_orders" ADD CONSTRAINT "dispatch_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_dispatch_order_id_fkey" FOREIGN KEY ("dispatch_order_id") REFERENCES "dispatch_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

