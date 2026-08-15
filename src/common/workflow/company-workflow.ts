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
  industryTemplate?: string;
  workflow?: Partial<CompanyWorkflowSettings>;
  billing?: Partial<CompanyBillingSettings>;
};

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
