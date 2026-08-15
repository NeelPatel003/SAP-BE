import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateMaterialDto {
  @IsString()
  @MaxLength(40)
  code: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  categoryId: string;

  @IsString()
  unitId: string;

  @IsOptional()
  @IsBoolean()
  qcRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  serialTracked?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  safetyStock?: number;

  @IsOptional()
  @IsString()
  defaultWarehouseId?: string;

  @IsOptional()
  @IsString()
  defaultLocationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  shelfLifeDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  hsn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  gstPercent?: number;
}

export class UpdateMaterialDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  qcRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  serialTracked?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: string;
}

export class GrnLineDto {
  @IsOptional()
  @IsString()
  purchaseOrderItemId?: string;

  @IsOptional()
  @IsString()
  materialId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  receivedQty: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  damageQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shortQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  excessQty?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  supplierBatch?: string;

  @IsOptional()
  @IsString()
  manufacturingDate?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lotNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  heatNumber?: string;
}

export class CreateGrnDto {
  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsString()
  warehouseId: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  supplierInvoice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  supplierChallan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  transport?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receivingPerson?: string;

  @IsOptional()
  @IsString()
  receiveDate?: string;

  @IsOptional()
  @IsBoolean()
  allowOverReceive?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GrnLineDto)
  lines: GrnLineDto[];
}

export class QcApplyItemDto {
  @IsString()
  goodsReceiptItemId: string;

  @IsIn(['accepted', 'rejected', 'hold', 'deviation'])
  result: 'accepted' | 'rejected' | 'hold' | 'deviation';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  acceptedQty: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rejectedQty: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deviationQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reworkQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inspectionPct?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class ApplyQcDto {
  @IsString()
  goodsReceiptId: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  inspectedBy?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QcApplyItemDto)
  items: QcApplyItemDto[];
}

export class IssueLineDto {
  @IsString()
  materialId: string;

  @IsString()
  batchId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serials?: string[];
}

export class CreateIssueDto {
  @IsString()
  warehouseId: string;

  @IsOptional()
  @IsString()
  productionOrderId?: string;

  @IsOptional()
  @IsString()
  materialRequestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  issuedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receivedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  allowFifoOverride?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IssueLineDto)
  lines: IssueLineDto[];
}

export class CreateSerialsDto {
  @IsString()
  materialId: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  serials: string[];
}

export class ReturnLineDto {
  @IsString()
  materialId: string;

  @IsString()
  batchId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsOptional()
  @IsIn(['good', 'damaged', 'rejected'])
  condition?: 'good' | 'damaged' | 'rejected';

  @IsOptional()
  @IsString()
  locationId?: string;
}

export class CreateReturnDto {
  @IsString()
  warehouseId: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  returnedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines: ReturnLineDto[];
}

export class TransferLineDto {
  @IsString()
  materialId: string;

  @IsString()
  batchId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsOptional()
  @IsString()
  fromLocationId?: string;

  @IsOptional()
  @IsString()
  toLocationId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateTransferDto {
  @IsString()
  fromWarehouseId: string;

  @IsString()
  toWarehouseId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines: TransferLineDto[];
}

export class CreateReservationDto {
  @IsString()
  materialId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsOptional()
  @IsString()
  productionOrderId?: string;

  @IsOptional()
  @IsString()
  productionDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;
}
