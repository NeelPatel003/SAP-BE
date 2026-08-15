import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApplyQcDto } from '../../store/dto/store.dto';

export { ApplyQcDto as QcInspectionDto };

export class CreateProductionOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsString()
  requiredDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateProductionOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priority?: number;
}

export class MaterialRequestLineDto {
  @IsString()
  materialId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  requestedQty: number;
}

export class CreateMaterialRequestDto {
  @IsOptional()
  @IsString()
  productionOrderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  requestedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MaterialRequestLineDto)
  lines: MaterialRequestLineDto[];
}

export class BomLineDto {
  @IsString()
  componentMaterialId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  scrapFactor?: number;
}

export class CreateBomDto {
  @IsString()
  materialId: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BomLineDto)
  lines: BomLineDto[];
}

export class UpdateBomDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BomLineDto)
  lines?: BomLineDto[];
}

export class ExplodeBomDto {
  @IsString()
  productionOrderId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  fgQty: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
