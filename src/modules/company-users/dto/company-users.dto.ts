import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsStrongPassword } from '../../../common/validators/password.validator';

export enum UserStatusDto {
  active = 'active',
  inactive = 'inactive',
  suspended = 'suspended',
}

export class ListCompanyUsersQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional({ description: 'Search name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UserStatusDto })
  @IsOptional()
  @IsEnum(UserStatusDto)
  status?: UserStatusDto;
}

export class CreateCompanyUserDto {
  @ApiProperty({ example: 'store.ops@acme.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Store Operator' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ minLength: 10, description: 'Min 10 chars, letter + number' })
  @IsString()
  @IsStrongPassword()
  password: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Role IDs (scope COMPANY). Defaults to COMPANY_MEMBER if empty.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roleIds?: string[];
}

export class UpdateCompanyUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ enum: UserStatusDto })
  @IsOptional()
  @IsEnum(UserStatusDto)
  status?: UserStatusDto;

  @ApiPropertyOptional({ minLength: 10, description: 'Min 10 chars, letter + number' })
  @IsOptional()
  @IsString()
  @IsStrongPassword()
  password?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roleIds?: string[];
}
