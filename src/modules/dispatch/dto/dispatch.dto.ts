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

export class DispatchLineDto {
  @IsString()
  materialId: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serialIds?: string[];
}

export class CreateDispatchDto {
  @IsString()
  warehouseId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DispatchLineDto)
  lines: DispatchLineDto[];
}
