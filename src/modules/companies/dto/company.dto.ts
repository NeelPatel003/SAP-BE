import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { IsStrongPassword } from '../../../common/validators/password.validator';

export enum CompanyStatusDto {
  active = 'active',
  suspended = 'suspended',
  trial = 'trial',
}

export class CreateCompanyDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'acme-corp' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  slug: string;

  @ApiPropertyOptional({ enum: CompanyStatusDto, default: CompanyStatusDto.trial })
  @IsOptional()
  @IsEnum(CompanyStatusDto)
  status?: CompanyStatusDto;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModules?: string[];

  @ApiPropertyOptional({ example: 'starter' })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({
    enum: ['cotton', 'steel', 'machines'],
    description: 'Industry starter pack applied on create',
  })
  @IsOptional()
  @IsIn(['cotton', 'steel', 'machines'])
  industryTemplate?: 'cotton' | 'steel' | 'machines';

  @ApiProperty({ example: 'Admin User' })
  @IsString()
  @IsNotEmpty()
  adminName: string;

  @ApiProperty({ example: 'admin@acme.com' })
  @IsEmail()
  adminEmail: string;

  @ApiProperty({ example: 'TempPass123!', minLength: 10 })
  @IsString()
  @IsStrongPassword()
  adminPassword: string;
}

export class UpdateCompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: CompanyStatusDto })
  @IsOptional()
  @IsEnum(CompanyStatusDto)
  status?: CompanyStatusDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModules?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plan?: string;
}
