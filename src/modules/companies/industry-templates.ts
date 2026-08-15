import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_WORKFLOW,
  parseSettingsBlob,
  CompanySettingsBlob,
} from '../../common/workflow/company-workflow';

export type IndustryTemplateCode = 'cotton' | 'steel' | 'machines';

export const INDUSTRY_TEMPLATE_CODES: IndustryTemplateCode[] = [
  'cotton',
  'steel',
  'machines',
];

const BASE_MODULES = [
  'store',
  'purchase',
  'qc',
  'production',
  'accounts',
] as const;

type TemplateDef = {
  code: IndustryTemplateCode;
  modules: string[];
  workflow: Partial<typeof DEFAULT_WORKFLOW>;
  defaultQcRequired: boolean;
  warehouse: { code: string; name: string };
  categories: { code: string; name: string }[];
  materials: {
    code: string;
    name: string;
    categoryCode: string;
    unitCode: string;
    qcRequired: boolean;
    serialTracked?: boolean;
    minStock?: number;
    maxStock?: number;
    isFg?: boolean;
  }[];
  /** component material codes + qty for FG (machines); applied if BOM tables exist */
  bom?: {
    fgCode: string;
    version: string;
    lines: { componentCode: string; quantity: number }[];
  };
};

const TEMPLATES: Record<IndustryTemplateCode, TemplateDef> = {
  cotton: {
    code: 'cotton',
    modules: [...BASE_MODULES],
    workflow: {
      grnRequiresPurchaseOrder: true,
      qcMode: 'material',
      issueRequiresProductionOrder: false,
      accountsHandoffEnabled: true,
      overReceivePolicy: 'permission',
    },
    defaultQcRequired: true,
    warehouse: { code: 'WH-COTTON', name: 'Cotton plant warehouse' },
    categories: [
      { code: 'RM', name: 'Raw Material' },
      { code: 'YARN', name: 'Yarn' },
      { code: 'FAB', name: 'Fabric' },
    ],
    materials: [
      {
        code: 'YARN-CTN-30S',
        name: 'Cotton Yarn 30s',
        categoryCode: 'YARN',
        unitCode: 'KG',
        qcRequired: true,
        minStock: 50,
        maxStock: 2000,
      },
      {
        code: 'GREIGE-CTN-58',
        name: 'Greige Cloth 58"',
        categoryCode: 'FAB',
        unitCode: 'MTR',
        qcRequired: true,
        minStock: 100,
        maxStock: 5000,
      },
    ],
  },
  steel: {
    code: 'steel',
    modules: [...BASE_MODULES],
    workflow: {
      grnRequiresPurchaseOrder: true,
      qcMode: 'always',
      issueRequiresProductionOrder: false,
      accountsHandoffEnabled: true,
      overReceivePolicy: 'permission',
    },
    defaultQcRequired: true,
    warehouse: { code: 'WH-STEEL', name: 'Steel warehouse' },
    categories: [
      { code: 'RM', name: 'Raw Material' },
      { code: 'METAL', name: 'Metal stock' },
    ],
    materials: [
      {
        code: 'PLT-MS-3MM',
        name: 'Mild Steel Plate 3mm',
        categoryCode: 'METAL',
        unitCode: 'KG',
        qcRequired: true,
        minStock: 200,
        maxStock: 10000,
      },
      {
        code: 'WIR-MS-4',
        name: 'MS Wire 4mm',
        categoryCode: 'METAL',
        unitCode: 'KG',
        qcRequired: true,
        minStock: 50,
        maxStock: 3000,
      },
      {
        code: 'FST-BOLT-M12',
        name: 'Hex Bolt M12',
        categoryCode: 'RM',
        unitCode: 'PCS',
        qcRequired: false,
        minStock: 500,
        maxStock: 20000,
      },
    ],
  },
  machines: {
    code: 'machines',
    modules: [...BASE_MODULES, 'dispatch'],
    workflow: {
      grnRequiresPurchaseOrder: true,
      qcMode: 'material',
      issueRequiresProductionOrder: true,
      accountsHandoffEnabled: true,
      overReceivePolicy: 'permission',
    },
    defaultQcRequired: true,
    warehouse: { code: 'WH-ASM', name: 'Assembly warehouse' },
    categories: [
      { code: 'COMP', name: 'Components' },
      { code: 'FG', name: 'Finished Goods' },
    ],
    materials: [
      {
        code: 'MOT-1HP',
        name: 'Motor 1HP',
        categoryCode: 'COMP',
        unitCode: 'PCS',
        qcRequired: true,
        serialTracked: true,
        minStock: 5,
        maxStock: 100,
      },
      {
        code: 'FRM-ASM-01',
        name: 'Machine Frame ASM-01',
        categoryCode: 'COMP',
        unitCode: 'PCS',
        qcRequired: true,
        minStock: 5,
        maxStock: 80,
      },
      {
        code: 'CTL-PANEL-A',
        name: 'Control Panel A',
        categoryCode: 'COMP',
        unitCode: 'PCS',
        qcRequired: true,
        serialTracked: true,
        minStock: 5,
        maxStock: 50,
      },
      {
        code: 'FG-ASM-KIT-1',
        name: 'Assembly Kit Machine Unit',
        categoryCode: 'FG',
        unitCode: 'PCS',
        qcRequired: false,
        serialTracked: true,
        isFg: true,
        minStock: 0,
        maxStock: 50,
      },
    ],
    bom: {
      fgCode: 'FG-ASM-KIT-1',
      version: 'v1',
      lines: [
        { componentCode: 'MOT-1HP', quantity: 1 },
        { componentCode: 'FRM-ASM-01', quantity: 1 },
        { componentCode: 'CTL-PANEL-A', quantity: 1 },
      ],
    },
  },
};

@Injectable()
export class IndustryTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return INDUSTRY_TEMPLATE_CODES.map((code) => ({
      code,
      modules: TEMPLATES[code].modules,
      label:
        code === 'cotton'
          ? 'Cotton / textiles'
          : code === 'steel'
            ? 'Steel / metals'
            : 'Machines / OEM',
    }));
  }

  async apply(companyId: string, code: IndustryTemplateCode) {
    const tpl = TEMPLATES[code];
    if (!tpl) return;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return;

    const blob: CompanySettingsBlob = {
      ...parseSettingsBlob(company.settings),
      industryTemplate: code,
      defaultQcRequired: tpl.defaultQcRequired,
      workflow: {
        ...DEFAULT_WORKFLOW,
        ...(parseSettingsBlob(company.settings).workflow || {}),
        ...tpl.workflow,
      },
    };

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        enabledModules: tpl.modules as object,
        settings: blob as object,
      },
    });

    const unitByCode = Object.fromEntries(
      (
        await this.prisma.unit.findMany({
          where: { code: { in: ['PCS', 'KG', 'MTR'] } },
        })
      ).map((u) => [u.code, u.id]),
    );

    const catIds: Record<string, string> = {};
    for (const c of tpl.categories) {
      let cat = await this.prisma.materialCategory.findFirst({
        where: { companyId, code: c.code },
      });
      if (!cat) {
        cat = await this.prisma.materialCategory.create({
          data: {
            companyId,
            code: c.code,
            name: c.name,
          },
        });
      }
      catIds[c.code] = cat.id;
    }

    let wh = await this.prisma.warehouse.findFirst({
      where: { companyId, code: tpl.warehouse.code },
    });
    if (!wh) {
      wh = await this.prisma.warehouse.create({
        data: {
          companyId,
          code: tpl.warehouse.code,
          name: tpl.warehouse.name,
        },
      });
    }

    let bin = await this.prisma.location.findFirst({
      where: { companyId, warehouseId: wh.id, type: 'BIN' },
    });
    if (!bin) {
      const zone = await this.prisma.location.create({
        data: {
          companyId,
          warehouseId: wh.id,
          type: 'ZONE',
          code: 'Z-MAIN',
          name: 'Main zone',
        },
      });
      const rack = await this.prisma.location.create({
        data: {
          companyId,
          warehouseId: wh.id,
          parentId: zone.id,
          type: 'RACK',
          code: 'R-01',
          name: 'Rack 01',
        },
      });
      bin = await this.prisma.location.create({
        data: {
          companyId,
          warehouseId: wh.id,
          parentId: rack.id,
          type: 'BIN',
          code: 'B-01',
          name: 'Bin 01',
        },
      });
    }

    const matIds: Record<string, string> = {};
    for (const m of tpl.materials) {
      const unitId = unitByCode[m.unitCode] || unitByCode.PCS;
      const categoryId = catIds[m.categoryCode];
      if (!unitId || !categoryId) continue;

      let mat = await this.prisma.material.findFirst({
        where: { companyId, code: m.code },
      });
      if (!mat) {
        mat = await this.prisma.material.create({
          data: {
            companyId,
            code: m.code,
            name: m.name,
            categoryId,
            unitId,
            qcRequired: m.qcRequired,
            serialTracked: !!m.serialTracked,
            minStock: m.minStock ?? 0,
            maxStock: m.maxStock ?? 0,
            reorderLevel: m.minStock ?? 0,
            defaultWarehouseId: wh.id,
            defaultLocationId: bin.id,
            status: 'active',
          },
        });
      } else {
        mat = await this.prisma.material.update({
          where: { id: mat.id },
          data: {
            serialTracked: !!m.serialTracked,
            qcRequired: m.qcRequired,
          },
        });
      }
      matIds[m.code] = mat.id;
    }

    // Merge store defaults into settings
    const refreshed = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (refreshed) {
      const next: CompanySettingsBlob = {
        ...parseSettingsBlob(refreshed.settings),
        defaultWarehouseId: wh.id,
        defaultQcRequired: tpl.defaultQcRequired,
        industryTemplate: code,
      };
      await this.prisma.company.update({
        where: { id: companyId },
        data: { settings: next as object },
      });
    }

    // BOM for machines
    if (tpl.bom && matIds[tpl.bom.fgCode]) {
      const existing = await this.prisma.bomHeader.findFirst({
        where: {
          companyId,
          materialId: matIds[tpl.bom.fgCode],
          version: tpl.bom.version,
        },
      });
      if (!existing) {
        const header = await this.prisma.bomHeader.create({
          data: {
            companyId,
            materialId: matIds[tpl.bom.fgCode],
            version: tpl.bom.version,
            status: 'active',
            notes: `Starter BOM (${code})`,
            lines: {
              create: tpl.bom.lines
                .filter((l) => matIds[l.componentCode])
                .map((l) => ({
                  componentMaterialId: matIds[l.componentCode],
                  quantity: l.quantity,
                })),
            },
          },
        });
        void header;
      }
    }
  }
}
