import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { RECEIPT_LINE_TYPES, RECEIPT_SOURCES } from "./receipt.schemas";

class AttachmentDto {
  @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsString() @Length(1, 500) url?: string;
}
class DeviceLineDto {
  @IsOptional() @IsMongoId() deviceId?: string;
  @IsOptional() @IsString() @Length(1, 80) assetCode?: string;
  @IsOptional() @IsString() @Length(1, 120) serial?: string;
  @IsOptional() @IsMongoId() modelId?: string;
  @IsOptional() @IsMongoId() deviceTypeId?: string;
  @IsOptional() @IsMongoId() supplierId?: string;
  @IsOptional() @IsMongoId() locationId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(99_999_999_999) purchasePrice?: number;
  @IsOptional() @IsDateString() warrantyUntil?: string;
  @IsEnum(["GOOD", "DEGRADED", "BROKEN"]) techCondition!:
    "GOOD" | "DEGRADED" | "BROKEN";
  @IsOptional() @IsString() @Length(1, 1000) notes?: string;
}
class PartLineDto {
  @IsMongoId() partId!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Length(1, 120, { each: true })
  serials?: string[];
}
export class ReceiptLineDto {
  @IsEnum(RECEIPT_LINE_TYPES) type!: (typeof RECEIPT_LINE_TYPES)[number];
  @IsInt() @Min(1) @Max(99_999_999) quantity!: number;
  @ValidateIf(
    (value: unknown) => (value as { type?: unknown }).type === "DEVICE",
  )
  @ValidateNested()
  @Type(() => DeviceLineDto)
  device?: DeviceLineDto;
  @ValidateIf((value: unknown) => (value as { type?: unknown }).type === "PART")
  @ValidateNested()
  @Type(() => PartLineDto)
  part?: PartLineDto;
  @IsOptional() @IsString() @Length(1, 500) note?: string;
}
export class CreateInboundReceiptDto {
  @IsString() @Length(1, 80) code!: string;
  @IsDateString() receiptDate!: string;
  @IsMongoId() warehouseId!: string;
  @IsEnum(RECEIPT_SOURCES) source!: (typeof RECEIPT_SOURCES)[number];
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
  @ValidateIf(
    (value: unknown) => (value as { source?: unknown }).source === "OPENING",
  )
  @IsString()
  @Length(1, 500)
  openingSource?: string;
  @ValidateIf(
    (value: unknown) => (value as { source?: unknown }).source === "OPENING",
  )
  @IsString()
  @Length(1, 1000)
  openingReason?: string;
}

// Sửa phiếu nháp: cùng cấu trúc với phiếu tạo mới (ghi đè toàn bộ dữ liệu nháp)
export class UpdateInboundReceiptDto extends CreateInboundReceiptDto {}

export class ReverseReceiptDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}
