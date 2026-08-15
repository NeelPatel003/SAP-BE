export type QcMode = 'material' | 'always' | 'never';
export type OverReceivePolicy = 'permission' | 'never' | 'always_if_permitted';

export type CompanyWorkflowSettings = {
  grnRequiresPurchaseOrder: boolean;
  qcMode: QcMode;
  issueRequiresProductionOrder: boolean;
  accountsHandoffEnabled: boolean;
  overReceivePolicy: OverReceivePolicy;
};

export type CompanyBillingSettings = {
  aiEnabled: boolean;
  monthlyAiTokenCap: number;
  emailEnabled: boolean;
  monthlyEmailCap: number;
  reportsPdfEnabled: boolean;
};

export type CompanySettingsBlob = {
  defaultWarehouseId?: string | null;
  defaultQcRequired?: boolean;
  layoutDensity?: 'comfortable' | 'compact';
  agingBands?: number[];
  nearExpiryDays?: number;
  deadStockDays?: number;
  slowStockDays?: number;
  fefoEnabled?: boolean;
  industryTemplate?: string;
  workflow?: Partial<CompanyWorkflowSettings>;
  billing?: Partial<CompanyBillingSettings>;
};

export type CompanyStorePolicy = {
  agingBands: number[];
  nearExpiryDays: number;
  deadStockDays: number;
  slowStockDays: number;
  fefoEnabled: boolean;
};

export const DEFAULT_STORE_POLICY: CompanyStorePolicy = {
  agingBands: [30, 60, 90, 180, 365],
  nearExpiryDays: 30,
  deadStockDays: 180,
  slowStockDays: 90,
  fefoEnabled: false,
};

export function resolveStorePolicy(raw: unknown): CompanyStorePolicy {
  const blob = parseSettingsBlob(raw);
  const bands = Array.isArray(blob.agingBands)
    ? [...new Set(blob.agingBands.filter((n) => Number.isInteger(n) && n > 0))]
        .sort((a, b) => a - b)
        .slice(0, 8)
    : [];
  const deadStockDays =
    typeof blob.deadStockDays === 'number' && blob.deadStockDays >= 0
      ? Math.floor(blob.deadStockDays)
      : DEFAULT_STORE_POLICY.deadStockDays;
  const slowStockDays =
    typeof blob.slowStockDays === 'number' && blob.slowStockDays >= 0
      ? Math.floor(blob.slowStockDays)
      : Math.min(
          DEFAULT_STORE_POLICY.slowStockDays,
          Math.max(1, Math.floor(deadStockDays / 2)),
        );
  return {
    agingBands: bands.length ? bands : DEFAULT_STORE_POLICY.agingBands,
    nearExpiryDays:
      typeof blob.nearExpiryDays === 'number' && blob.nearExpiryDays >= 0
        ? Math.floor(blob.nearExpiryDays)
        : DEFAULT_STORE_POLICY.nearExpiryDays,
    deadStockDays,
    slowStockDays: Math.min(slowStockDays, deadStockDays),
    fefoEnabled:
      typeof blob.fefoEnabled === 'boolean'
        ? blob.fefoEnabled
        : DEFAULT_STORE_POLICY.fefoEnabled,
  };
}

export const DEFAULT_WORKFLOW: CompanyWorkflowSettings = {
  grnRequiresPurchaseOrder: true,
  qcMode: 'material',
  issueRequiresProductionOrder: false,
  accountsHandoffEnabled: true,
  overReceivePolicy: 'permission',
};

export const DEFAULT_BILLING: CompanyBillingSettings = {
  aiEnabled: false,
  monthlyAiTokenCap: 100_000,
  emailEnabled: false,
  monthlyEmailCap: 200,
  reportsPdfEnabled: true,
};

export function parseSettingsBlob(raw: unknown): CompanySettingsBlob {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as CompanySettingsBlob;
  }
  return {};
}

export function resolveWorkflow(raw: unknown): CompanyWorkflowSettings {
  const blob = parseSettingsBlob(raw);
  const w = blob.workflow || {};
  return {
    grnRequiresPurchaseOrder:
      typeof w.grnRequiresPurchaseOrder === 'boolean'
        ? w.grnRequiresPurchaseOrder
        : DEFAULT_WORKFLOW.grnRequiresPurchaseOrder,
    qcMode:
      w.qcMode === 'always' || w.qcMode === 'never' || w.qcMode === 'material'
        ? w.qcMode
        : DEFAULT_WORKFLOW.qcMode,
    issueRequiresProductionOrder:
      typeof w.issueRequiresProductionOrder === 'boolean'
        ? w.issueRequiresProductionOrder
        : DEFAULT_WORKFLOW.issueRequiresProductionOrder,
    accountsHandoffEnabled:
      typeof w.accountsHandoffEnabled === 'boolean'
        ? w.accountsHandoffEnabled
        : DEFAULT_WORKFLOW.accountsHandoffEnabled,
    overReceivePolicy:
      w.overReceivePolicy === 'never' ||
      w.overReceivePolicy === 'always_if_permitted' ||
      w.overReceivePolicy === 'permission'
        ? w.overReceivePolicy
        : DEFAULT_WORKFLOW.overReceivePolicy,
  };
}

export function resolveBilling(raw: unknown): CompanyBillingSettings {
  const blob = parseSettingsBlob(raw);
  const b = blob.billing || {};
  return {
    aiEnabled:
      typeof b.aiEnabled === 'boolean' ? b.aiEnabled : DEFAULT_BILLING.aiEnabled,
    monthlyAiTokenCap:
      typeof b.monthlyAiTokenCap === 'number' && b.monthlyAiTokenCap >= 0
        ? Math.floor(b.monthlyAiTokenCap)
        : DEFAULT_BILLING.monthlyAiTokenCap,
    emailEnabled:
      typeof b.emailEnabled === 'boolean'
        ? b.emailEnabled
        : DEFAULT_BILLING.emailEnabled,
    monthlyEmailCap:
      typeof b.monthlyEmailCap === 'number' && b.monthlyEmailCap >= 0
        ? Math.floor(b.monthlyEmailCap)
        : DEFAULT_BILLING.monthlyEmailCap,
    reportsPdfEnabled:
      typeof b.reportsPdfEnabled === 'boolean'
        ? b.reportsPdfEnabled
        : DEFAULT_BILLING.reportsPdfEnabled,
  };
}

export function resolveLineQcRequired(
  materialQcRequired: boolean,
  qcMode: QcMode,
): boolean {
  if (qcMode === 'always') return true;
  if (qcMode === 'never') return false;
  return !!materialQcRequired;
}
