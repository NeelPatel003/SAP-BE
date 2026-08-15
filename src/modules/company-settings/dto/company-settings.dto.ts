import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const HEX = /^#[0-9A-Fa-f]{6}$/;

export class CompanyStoreSettingsDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  defaultWarehouseId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  defaultQcRequired?: boolean;

  @ApiPropertyOptional({ enum: ['comfortable', 'compact'] })
  @IsOptional()
  @IsIn(['comfortable', 'compact'])
  layoutDensity?: 'comfortable' | 'compact';
}

export class WorkflowSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  grnRequiresPurchaseOrder?: boolean;

  @ApiPropertyOptional({ enum: ['material', 'always', 'never'] })
  @IsOptional()
  @IsIn(['material', 'always', 'never'])
  qcMode?: 'material' | 'always' | 'never';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  issueRequiresProductionOrder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  accountsHandoffEnabled?: boolean;

  @ApiPropertyOptional({
    enum: ['permission', 'never', 'always_if_permitted'],
  })
  @IsOptional()
  @IsIn(['permission', 'never', 'always_if_permitted'])
  overReceivePolicy?: 'permission' | 'never' | 'always_if_permitted';
}

export class BillingSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aiEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  monthlyAiTokenCap?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  monthlyEmailCap?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reportsPdfEnabled?: boolean;
}

export class PatchCompanySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(12)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional({ example: '#f97316' })
  @IsOptional()
  @Matches(HEX, { message: 'primaryColor must be #RRGGBB' })
  primaryColor?: string | null;

  @ApiPropertyOptional({ example: '#0f172a' })
  @IsOptional()
  @Matches(HEX, { message: 'secondaryColor must be #RRGGBB' })
  secondaryColor?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string | null;

  @ApiPropertyOptional({ enum: ['comfortable', 'compact'] })
  @IsOptional()
  @IsIn(['comfortable', 'compact'])
  layoutDensity?: 'comfortable' | 'compact';

  @ApiPropertyOptional({ type: CompanyStoreSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompanyStoreSettingsDto)
  store?: CompanyStoreSettingsDto;

  @ApiPropertyOptional({ type: WorkflowSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowSettingsDto)
  workflow?: WorkflowSettingsDto;

  @ApiPropertyOptional({ type: BillingSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillingSettingsDto)
  billing?: BillingSettingsDto;
}

export class DocumentSeriesItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  docType: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  prefix: string;

  @IsOptional()
  @IsBoolean()
  includeYear?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  padLength?: number;

  @IsOptional()
  @IsIn(['yearly', 'never'])
  resetPolicy?: 'yearly' | 'never';
}

export class PutDocumentSeriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DocumentSeriesItemDto)
  items: DocumentSeriesItemDto[];
}
