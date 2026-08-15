import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const STORE_PERMISSIONS = [
  { code: 'store.dashboard.read', name: 'Store dashboard' },
  { code: 'store.masters.read', name: 'Read store masters' },
  { code: 'store.masters.write', name: 'Write store masters' },
  { code: 'store.grn.read', name: 'Read GRN' },
  { code: 'store.grn.create', name: 'Create GRN' },
  { code: 'store.grn.post', name: 'Post GRN' },
  { code: 'store.grn.over_receive', name: 'Over-receive against PO' },
  { code: 'store.qc.receive', name: 'Apply QC to store' },
  { code: 'store.stock.read', name: 'Read stock' },
  { code: 'store.issue.create', name: 'Create material issue' },
  { code: 'store.return.create', name: 'Create material return' },
  { code: 'store.transfer.create', name: 'Create transfer' },
  { code: 'store.reservation.read', name: 'Read reservations' },
  { code: 'store.reservation.write', name: 'Write reservations' },
  { code: 'store.reports.read', name: 'Store reports' },
  { code: 'store.fifo.override', name: 'FIFO override' },
  { code: 'store.serial.read', name: 'Read material serials' },
  { code: 'store.serial.write', name: 'Write material serials' },
] as const;

const PURCHASE_PERMISSIONS = [
  { code: 'purchase.orders.read', name: 'Read purchase orders' },
  { code: 'purchase.orders.write', name: 'Write purchase orders' },
  { code: 'purchase.suppliers.read', name: 'Read suppliers' },
  { code: 'purchase.suppliers.write', name: 'Write suppliers' },
] as const;

const QC_PERMISSIONS = [
  { code: 'qc.queue.read', name: 'Read QC queue' },
  { code: 'qc.inspect', name: 'Perform QC inspection' },
] as const;

const PRODUCTION_PERMISSIONS = [
  { code: 'production.orders.read', name: 'Read production orders' },
  { code: 'production.orders.write', name: 'Write production orders' },
  { code: 'production.requests.read', name: 'Read material requests' },
  { code: 'production.requests.write', name: 'Write material requests' },
  { code: 'production.bom.read', name: 'Read BOMs' },
  { code: 'production.bom.write', name: 'Write BOMs' },
] as const;

const ACCOUNTS_PERMISSIONS = [
  { code: 'accounts.grn.read', name: 'Read GRN accounts queue' },
  { code: 'accounts.grn.book', name: 'Mark GRN booked' },
] as const;

const DISPATCH_PERMISSIONS = [
  { code: 'dispatch.read', name: 'Read dispatches' },
  { code: 'dispatch.create', name: 'Create dispatches' },
  { code: 'dispatch.ship', name: 'Ship dispatches' },
] as const;

const MODULE_SCOPED = [
  ...STORE_PERMISSIONS,
  ...PURCHASE_PERMISSIONS,
  ...QC_PERMISSIONS,
  ...PRODUCTION_PERMISSIONS,
  ...ACCOUNTS_PERMISSIONS,
  ...DISPATCH_PERMISSIONS,
] as const;

const BASE_PERMISSIONS = [
  { code: 'auth.login', name: 'Login', description: 'Authenticate' },
  { code: 'admin.dashboard.read', name: 'Admin dashboard' },
  { code: 'admin.companies.read', name: 'Read companies' },
  { code: 'admin.companies.write', name: 'Write companies' },
  { code: 'admin.logs.read', name: 'Read logs' },
  { code: 'company.users.read', name: 'Read company users' },
  { code: 'company.users.write', name: 'Write company users' },
  { code: 'company.settings.read', name: 'Read company settings' },
  { code: 'company.settings.write', name: 'Write company settings' },
  ...MODULE_SCOPED.map((p) => ({
    ...p,
    description: p.name,
  })),
] as const;

const ALL_STORE_PERMS = STORE_PERMISSIONS.map((p) => p.code);
const ALL_PURCHASE = PURCHASE_PERMISSIONS.map((p) => p.code);
const ALL_QC = QC_PERMISSIONS.map((p) => p.code);
const ALL_PRODUCTION = PRODUCTION_PERMISSIONS.map((p) => p.code);
const ALL_ACCOUNTS = ACCOUNTS_PERMISSIONS.map((p) => p.code);
const ALL_DISPATCH = DISPATCH_PERMISSIONS.map((p) => p.code);
const LIVE_VERTICAL_PERMS = [
  ...ALL_STORE_PERMS,
  ...ALL_PURCHASE,
  ...ALL_QC,
  ...ALL_PRODUCTION,
  ...ALL_ACCOUNTS,
  ...ALL_DISPATCH,
];

const ROLES = [
  {
    code: 'PLATFORM_SUPER_ADMIN',
    name: 'Platform Super Admin',
    scope: 'PLATFORM' as const,
    isSystem: true,
    permissions: [
      'auth.login',
      'admin.dashboard.read',
      'admin.companies.read',
      'admin.companies.write',
      'admin.logs.read',
    ],
  },
  {
    code: 'COMPANY_ADMIN',
    name: 'Company Admin',
    scope: 'COMPANY' as const,
    isSystem: true,
    permissions: [
      'auth.login',
      'company.users.read',
      'company.users.write',
      'company.settings.read',
      'company.settings.write',
      ...LIVE_VERTICAL_PERMS,
    ],
  },
  {
    code: 'COMPANY_MEMBER',
    name: 'Company Member',
    scope: 'COMPANY' as const,
    isSystem: true,
    permissions: ['auth.login'],
  },
  {
    code: 'STORE_MANAGER',
    name: 'Store Manager',
    scope: 'COMPANY' as const,
    isSystem: true,
    permissions: ['auth.login', ...ALL_STORE_PERMS],
  },
  {
    code: 'STORE_EXECUTIVE',
    name: 'Store Executive',
    scope: 'COMPANY' as const,
    isSystem: true,
    permissions: [
      'auth.login',
      'store.dashboard.read',
      'store.masters.read',
      'store.grn.read',
      'store.grn.create',
      'store.grn.post',
      'store.stock.read',
      'store.issue.create',
      'store.return.create',
      'store.transfer.create',
      'store.reservation.read',
    ],
  },
  {
    code: 'QC',
    name: 'Quality Control',
    scope: 'COMPANY' as const,
    isSystem: true,
    permissions: [
      'auth.login',
      'store.stock.read',
      'store.qc.receive',
      'store.grn.read',
      ...ALL_QC,
    ],
  },
  {
    code: 'PURCHASE',
    name: 'Purchase',
    scope: 'COMPANY' as const,
    isSystem: true,
    permissions: [
      'auth.login',
      'store.grn.read',
      'store.stock.read',
      ...ALL_PURCHASE,
    ],
  },
  {
    code: 'PRODUCTION',
    name: 'Production',
    scope: 'COMPANY' as const,
    isSystem: true,
    permissions: [
      'auth.login',
      'store.stock.read',
      'store.issue.create',
      'store.return.create',
      ...ALL_PRODUCTION,
    ],
  },
  {
    code: 'PLANNING',
    name: 'Production Planning',
    scope: 'COMPANY' as const,
    isSystem: true,
    permissions: [
      'auth.login',
      'store.stock.read',
      'store.reservation.read',
      'store.reservation.write',
      'production.orders.read',
      'production.requests.read',
      'production.bom.read',
    ],
  },
  {
    code: 'ACCOUNTS',
    name: 'Accounts',
    scope: 'COMPANY' as const,
    isSystem: true,
    permissions: [
      'auth.login',
      'store.grn.read',
      'store.reports.read',
      ...ALL_ACCOUNTS,
    ],
  },
  {
    code: 'DISPATCH',
    name: 'Dispatch',
    scope: 'COMPANY' as const,
    isSystem: true,
    permissions: [
      'auth.login',
      'store.stock.read',
      ...ALL_DISPATCH,
    ],
  },
];

const MODULES = [
  { code: 'store', name: 'Store & Inventory', sortOrder: 10 },
  { code: 'purchase', name: 'Purchase', sortOrder: 20 },
  { code: 'qc', name: 'Quality Control', sortOrder: 30 },
  { code: 'ppc', name: 'Production Planning', sortOrder: 40 },
  { code: 'production', name: 'Production', sortOrder: 50 },
  { code: 'accounts', name: 'Accounts', sortOrder: 60 },
  { code: 'dispatch', name: 'Dispatch', sortOrder: 70 },
  { code: 'ai', name: 'AI Assist', sortOrder: 80 },
];

const UNITS = [
  { code: 'PCS', name: 'Pieces' },
  { code: 'KG', name: 'Kilogram' },
  { code: 'LTR', name: 'Litre' },
  { code: 'MTR', name: 'Meter' },
  { code: 'BOX', name: 'Box' },
];

async function main() {
  for (const m of MODULES) {
    await prisma.appModule.upsert({
      where: { code: m.code },
      update: { name: m.name, sortOrder: m.sortOrder },
      create: m,
    });
  }

  const moduleByCode = Object.fromEntries(
    (
      await prisma.appModule.findMany({
        where: {
          code: { in: ['store', 'purchase', 'qc', 'production', 'accounts'] },
        },
      })
    ).map((m) => [m.code, m.id]),
  );

  function moduleIdForPermission(code: string): string | null {
    if (code.startsWith('store.')) return moduleByCode.store ?? null;
    if (code.startsWith('purchase.')) return moduleByCode.purchase ?? null;
    if (code.startsWith('qc.')) return moduleByCode.qc ?? null;
    if (code.startsWith('production.')) return moduleByCode.production ?? null;
    if (code.startsWith('accounts.')) return moduleByCode.accounts ?? null;
    return null;
  }

  for (const p of BASE_PERMISSIONS) {
    const moduleId = moduleIdForPermission(p.code);
    await prisma.permission.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        description: 'description' in p ? (p as { description?: string }).description : p.name,
        moduleId,
      },
      create: {
        code: p.code,
        name: p.name,
        description: 'description' in p ? (p as { description?: string }).description : p.name,
        moduleId,
      },
    });
  }

  for (const u of UNITS) {
    await prisma.unit.upsert({
      where: { code: u.code },
      update: { name: u.name },
      create: u,
    });
  }

  const allPerms = await prisma.permission.findMany();
  const permByCode = Object.fromEntries(
    allPerms.map((p: { code: string; id: string }) => [p.code, p.id]),
  );

  for (const roleDef of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: roleDef.code },
      update: {
        name: roleDef.name,
        isSystem: roleDef.isSystem,
        scope: roleDef.scope,
      },
      create: {
        code: roleDef.code,
        name: roleDef.name,
        isSystem: roleDef.isSystem,
        scope: roleDef.scope,
      },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const code of roleDef.permissions) {
      const permissionId = permByCode[code];
      if (!permissionId) continue;
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId },
      });
    }
  }

  // Platform admin
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@teamora.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin123!ChangeMe';
  const name = process.env.SEED_ADMIN_NAME || 'Platform Super Admin';
  const passwordHash = await bcrypt.hash(password, 12);
  const platformRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'PLATFORM_SUPER_ADMIN' },
  });

  const admin = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, status: 'active', companyId: null },
    create: {
      email,
      name,
      passwordHash,
      status: 'active',
      companyId: null,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: platformRole.id } },
    update: {},
    create: { userId: admin.id, roleId: platformRole.id },
  });

  // Acme Corp
  const acme = await prisma.company.upsert({
    where: { slug: 'acme-corp' },
    update: {
      name: 'Acme Corp',
      status: 'active',
      enabledModules: ['store', 'purchase', 'qc', 'production', 'ppc', 'accounts'],
      primaryColor: '#f97316',
      secondaryColor: '#0f172a',
    },
    create: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      status: 'active',
      enabledModules: ['store', 'purchase', 'qc', 'production', 'ppc', 'accounts'],
      plan: 'starter',
      displayName: 'Acme Corp',
      primaryColor: '#f97316',
      secondaryColor: '#0f172a',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    },
  });

  const SERIES_DEFAULTS = [
    { docType: 'purchase_order', prefix: 'PO', includeYear: true, padLength: 5, resetPolicy: 'yearly' },
    { docType: 'goods_receipt', prefix: 'GRN', includeYear: true, padLength: 5, resetPolicy: 'yearly' },
    { docType: 'batch', prefix: 'BATCH', includeYear: true, padLength: 6, resetPolicy: 'yearly' },
    { docType: 'material_issue', prefix: 'MI', includeYear: true, padLength: 5, resetPolicy: 'yearly' },
    { docType: 'material_return', prefix: 'MRTN', includeYear: true, padLength: 5, resetPolicy: 'yearly' },
    { docType: 'stock_transfer', prefix: 'ST', includeYear: true, padLength: 5, resetPolicy: 'yearly' },
    { docType: 'qc_inspection', prefix: 'QC', includeYear: true, padLength: 5, resetPolicy: 'yearly' },
    { docType: 'production_order', prefix: 'PR', includeYear: true, padLength: 5, resetPolicy: 'yearly' },
    { docType: 'material_request', prefix: 'MR', includeYear: true, padLength: 5, resetPolicy: 'yearly' },
  ] as const;

  for (const s of SERIES_DEFAULTS) {
    await prisma.documentSeries.upsert({
      where: {
        companyId_docType: { companyId: acme.id, docType: s.docType },
      },
      update: {},
      create: {
        companyId: acme.id,
        docType: s.docType,
        prefix: s.prefix,
        includeYear: s.includeYear,
        padLength: s.padLength,
        resetPolicy: s.resetPolicy,
      },
    });
  }

  const acmePassword = await bcrypt.hash('TempPass123!', 12);
  const companyAdminRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'COMPANY_ADMIN' },
  });
  const storeManagerRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'STORE_MANAGER' },
  });

  const acmeAdmin = await prisma.user.upsert({
    where: { email: 'admin@acme.com' },
    update: {
      name: 'Acme Admin',
      passwordHash: acmePassword,
      status: 'active',
      companyId: acme.id,
    },
    create: {
      email: 'admin@acme.com',
      name: 'Acme Admin',
      passwordHash: acmePassword,
      status: 'active',
      companyId: acme.id,
    },
  });

  for (const roleId of [companyAdminRole.id, storeManagerRole.id]) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: acmeAdmin.id, roleId } },
      update: {},
      create: { userId: acmeAdmin.id, roleId },
    });
  }

  // Sample units link masters for Acme bootstrap data
  const unitPcs = await prisma.unit.findUniqueOrThrow({ where: { code: 'PCS' } });
  const unitKg = await prisma.unit.findUniqueOrThrow({ where: { code: 'KG' } });

  let catRm = await prisma.materialCategory.findFirst({
    where: { companyId: acme.id, code: 'RM' },
  });
  if (!catRm) {
    catRm = await prisma.materialCategory.create({
      data: {
        companyId: acme.id,
        code: 'RM',
        name: 'Raw Material',
        description: 'Raw materials',
      },
    });
  }

  let wh = await prisma.warehouse.findFirst({
    where: { companyId: acme.id, code: 'WH-A' },
  });
  if (!wh) {
    wh = await prisma.warehouse.create({
      data: {
        companyId: acme.id,
        code: 'WH-A',
        name: 'Warehouse A',
        address: 'Main plant',
      },
    });
  }

  let loc = await prisma.location.findFirst({
    where: { companyId: acme.id, warehouseId: wh.id, code: 'BIN-12' },
  });
  if (!loc) {
    const zone = await prisma.location.create({
      data: {
        companyId: acme.id,
        warehouseId: wh.id,
        type: 'ZONE',
        code: 'RM-ZONE',
        name: 'Raw Material Zone',
      },
    });
    const rack = await prisma.location.create({
      data: {
        companyId: acme.id,
        warehouseId: wh.id,
        parentId: zone.id,
        type: 'RACK',
        code: 'RACK-02',
        name: 'Rack 02',
      },
    });
    loc = await prisma.location.create({
      data: {
        companyId: acme.id,
        warehouseId: wh.id,
        parentId: rack.id,
        type: 'BIN',
        code: 'BIN-12',
        name: 'Bin 12',
      },
    });
  }

  let steel = await prisma.material.findFirst({
    where: { companyId: acme.id, code: 'MAT-STEEL-001' },
  });
  if (!steel) {
    steel = await prisma.material.create({
      data: {
        companyId: acme.id,
        categoryId: catRm.id,
        unitId: unitKg.id,
        code: 'MAT-STEEL-001',
        name: 'Mild Steel Sheet',
        minStock: 100,
        maxStock: 5000,
        reorderLevel: 200,
        reorderQty: 500,
        safetyStock: 50,
        defaultWarehouseId: wh.id,
        defaultLocationId: loc.id,
        qcRequired: true,
        shelfLifeDays: 365,
      },
    });
  }

  let bolt = await prisma.material.findFirst({
    where: { companyId: acme.id, code: 'MAT-BOLT-001' },
  });
  if (!bolt) {
    bolt = await prisma.material.create({
      data: {
        companyId: acme.id,
        categoryId: catRm.id,
        unitId: unitPcs.id,
        code: 'MAT-BOLT-001',
        name: 'Hex Bolt M10',
        minStock: 500,
        maxStock: 50000,
        reorderLevel: 1000,
        reorderQty: 5000,
        defaultWarehouseId: wh.id,
        defaultLocationId: loc.id,
        qcRequired: false,
      },
    });
  }

  let supplier = await prisma.supplier.findFirst({
    where: { companyId: acme.id, code: 'SUP-01' },
  });
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: {
        companyId: acme.id,
        code: 'SUP-01',
        name: 'Steel Traders Pvt Ltd',
        email: 'orders@steeltraders.example',
      },
    });
    await prisma.supplierQualityMetric.create({
      data: { companyId: acme.id, supplierId: supplier.id },
    });
  }

  let po = await prisma.purchaseOrder.findFirst({
    where: { companyId: acme.id, number: 'PO-2026-001' },
  });
  if (!po) {
    po = await prisma.purchaseOrder.create({
      data: {
        companyId: acme.id,
        supplierId: supplier.id,
        number: 'PO-2026-001',
        status: 'open',
        items: {
          create: [
            {
              materialId: steel.id,
              orderedQty: 1000,
              receivedQty: 0,
              unitPrice: 55,
            },
            {
              materialId: bolt.id,
              orderedQty: 10000,
              receivedQty: 0,
              unitPrice: 2.5,
            },
          ],
        },
      },
    });
  }

  let prod = await prisma.productionOrder.findFirst({
    where: { companyId: acme.id, number: 'PRD-2026-001' },
  });
  if (!prod) {
    await prisma.productionOrder.create({
      data: {
        companyId: acme.id,
        number: 'PRD-2026-001',
        status: 'open',
        requiredDate: new Date(Date.now() + 7 * 86400000),
        priority: 1,
      },
    });
  }

  console.log(`Seed complete.
  Super admin: ${email} / ${password}
  Acme admin:  admin@acme.com / TempPass123!  (modules: store enabled, STORE_MANAGER + COMPANY_ADMIN)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
