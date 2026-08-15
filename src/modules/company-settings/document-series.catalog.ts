export const DOCUMENT_SERIES_CATALOG = [
  {
    docType: 'purchase_order',
    prefix: 'PO',
    includeYear: true,
    padLength: 5,
    resetPolicy: 'yearly',
    label: 'Purchase order',
  },
  {
    docType: 'goods_receipt',
    prefix: 'GRN',
    includeYear: true,
    padLength: 5,
    resetPolicy: 'yearly',
    label: 'Goods receipt (GRN)',
  },
  {
    docType: 'batch',
    prefix: 'BATCH',
    includeYear: true,
    padLength: 6,
    resetPolicy: 'yearly',
    label: 'Stock batch',
  },
  {
    docType: 'material_issue',
    prefix: 'MI',
    includeYear: true,
    padLength: 5,
    resetPolicy: 'yearly',
    label: 'Material issue',
  },
  {
    docType: 'material_return',
    prefix: 'MRTN',
    includeYear: true,
    padLength: 5,
    resetPolicy: 'yearly',
    label: 'Material return',
  },
  {
    docType: 'stock_transfer',
    prefix: 'ST',
    includeYear: true,
    padLength: 5,
    resetPolicy: 'yearly',
    label: 'Stock transfer',
  },
  {
    docType: 'qc_inspection',
    prefix: 'QC',
    includeYear: true,
    padLength: 5,
    resetPolicy: 'yearly',
    label: 'QC inspection',
  },
  {
    docType: 'production_order',
    prefix: 'PR',
    includeYear: true,
    padLength: 5,
    resetPolicy: 'yearly',
    label: 'Production order',
  },
  {
    docType: 'material_request',
    prefix: 'MR',
    includeYear: true,
    padLength: 5,
    resetPolicy: 'yearly',
    label: 'Material request',
  },
  {
    docType: 'dispatch',
    prefix: 'DN',
    includeYear: true,
    padLength: 5,
    resetPolicy: 'yearly',
    label: 'Dispatch note',
  },
] as const;

export type DocType = (typeof DOCUMENT_SERIES_CATALOG)[number]['docType'];

export const DOC_TYPES = DOCUMENT_SERIES_CATALOG.map((c) => c.docType);

/** Map doc type → Prisma model number/batch field for scanning existing numbers */
export const DOC_TYPE_SCAN: Record<
  DocType,
  {
    model:
      | 'purchaseOrder'
      | 'goodsReceipt'
      | 'inventoryBatch'
      | 'materialIssue'
      | 'materialReturn'
      | 'stockTransfer'
      | 'qcInspection'
      | 'productionOrder'
      | 'materialRequest'
      | 'dispatchOrder';
    field: 'number' | 'batchNumber';
  }
> = {
  purchase_order: { model: 'purchaseOrder', field: 'number' },
  goods_receipt: { model: 'goodsReceipt', field: 'number' },
  batch: { model: 'inventoryBatch', field: 'batchNumber' },
  material_issue: { model: 'materialIssue', field: 'number' },
  material_return: { model: 'materialReturn', field: 'number' },
  stock_transfer: { model: 'stockTransfer', field: 'number' },
  qc_inspection: { model: 'qcInspection', field: 'number' },
  production_order: { model: 'productionOrder', field: 'number' },
  material_request: { model: 'materialRequest', field: 'number' },
  dispatch: { model: 'dispatchOrder', field: 'number' },
};
