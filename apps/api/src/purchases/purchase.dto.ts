import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PURCHASE_ITEM_KINDS } from "./purchase.schemas";

const toNumber = (value: unknown): number | undefined =>
  value === undefined || value === null ? undefined : Number(value);

// Dòng hàng: backend chỉd tin nội số lượng/đơn giá; backend tính lại thành tiền.
export class PurchaseItemDto {
  @ApiProperty({ enum: PURCHASE_ITEM_KINDS })
  @IsEnum(PURCHASE_ITEM_KINDS)
  kind!: (typeof PURCHASE_ITEM_KINDS)[number];

  @ApiPropertyOptional() @IsOptional() @IsMongoId() deviceTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() partId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() modelId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() unitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  modelCode?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  spec?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  unitName?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(9_999_999)
  requestedQty!: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999)
  unitPrice!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;
}

export class CreatePurchaseDto {
  @ApiProperty() @IsDateString() requestDate!: string;

  @ApiPropertyOptional() @IsOptional() @IsMongoId() requestedBy?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  requestDepartmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() supplierId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;

  @ApiProperty() @IsString() @Length(1, 1000) reason!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999)
  @Type(() => Number)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999)
  @Type(() => Number)
  tax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999)
  @Type(() => Number)
  otherCost?: number;

  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];
}

// Cập update toàn bộ nội nháp (chỉ phiếu DRAFT); cùng cấu vơ với tạo.
export class UpdatePurchaseDto extends CreatePurchaseDto {}

// Lý do bắt buộc dành từ chối / hủy
export class ReasonDto {
  @ApiProperty() @IsString() @Length(1, 500) reason!: string;
}

// Nhận hàng nhiều lượt (dành phần): mảng dòng { index, receivedQty }
export class ReceiveItemDto {
  @IsInt() @Min(0) index!: number;
  @IsInt() @Min(0) receivedQty!: number;
}

export class ReceiveDto {
  @ApiProperty({ type: [ReceiveItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items!: ReceiveItemDto[];
}

// Biên bản in: empty body yêu cầu, chỉ dành marker
export class InPrintDto {
  @ValidateIf(() => false) value?: unknown;
}

export { toNumber };
