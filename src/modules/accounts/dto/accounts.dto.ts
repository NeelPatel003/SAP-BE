import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AttachSupplierInvoiceDto {
  @IsString() @MaxLength(80) invoiceNumber: string;
  @Type(() => Number) @IsNumber() @Min(0) amount: number;
  @Type(() => Number) @IsNumber() @Min(0) taxAmount: number;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) grnIds: string[];
  @IsOptional() @IsString() @MaxLength(500) attachmentUrl?: string;
}

export class VerifySupplierInvoiceDto {
  @IsIn(['verified', 'rejected'])
  status: 'verified' | 'rejected';
}

export class BookingLineDto {
  @IsString() @MaxLength(80) account: string;
  @Type(() => Number) @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() @MaxLength(300) narration?: string;
}

export class CreateAccountsBookingDto {
  @IsString() supplierInvoiceId: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => BookingLineDto)
  debitLines: BookingLineDto[];
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => BookingLineDto)
  creditLines: BookingLineDto[];
}
