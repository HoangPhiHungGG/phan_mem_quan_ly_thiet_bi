import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
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
  ArrayMaxSize,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PART_TRACKING_MODES, TECH_CONDITIONS } from "./equipment.schemas";
import { INVENTORY_TYPES } from "../inventory/inventory.dto";

export class CreateDeviceDto {
  @ApiProperty()
  @IsString()
  @Length(1, 80)
  assetCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  serial?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  modelId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  deviceTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(99_999_999_999)
  purchasePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  warrantyUntil?: string;

  @ApiProperty({ enum: TECH_CONDITIONS })
  @IsEnum(TECH_CONDITIONS)
  techCondition!: (typeof TECH_CONDITIONS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  notes?: string;
}

// Không cho sửa trực tiếp: người giữ, bộ phận, kho/vị trí, trạng thái sử dụng
// (chỉ thay đổi qua nghiệp vụ cấp phát/thu hồi/điều chuyển ở bước sau)
export class UpdateDeviceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  serial?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  modelId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  deviceTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(99_999_999_999)
  purchasePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  warrantyUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(TECH_CONDITIONS)
  techCondition?: (typeof TECH_CONDITIONS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  notes?: string;
}

export class InitialPartStockDto {
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99_999_999)
  quantity?: number;

  @IsOptional()
  @IsEnum(INVENTORY_TYPES)
  type?: (typeof INVENTORY_TYPES)[number];

  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Length(1, 120, { each: true })
  serials?: string[];
}

export class CreatePartDto {
  @ApiProperty()
  @IsString()
  @Length(1, 80)
  code!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 150)
  name!: string;

  @ApiProperty({ enum: PART_TRACKING_MODES })
  @IsEnum(PART_TRACKING_MODES)
  trackingMode!: (typeof PART_TRACKING_MODES)[number];

  @ApiProperty()
  @IsMongoId()
  unitId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  deviceTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  modelId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  spec?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99_999_999)
  minQty?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => InitialPartStockDto)
  initialStock?: InitialPartStockDto;
}

// Không cho sửa: code, trackingMode, stockQty (tồn kho chỉ qua nghiệp vụ)
export class UpdatePartDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  unitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  deviceTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  modelId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  spec?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99_999_999)
  minQty?: number;
}

export class UpdatePartStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class UpdateDeviceAttachmentsDto {
  @ApiProperty({ type: [Object] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments!: AttachmentDto[];
}

export class AttachmentDto {
  @ApiProperty()
  @IsString()
  @Length(1, 150)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 300)
  note?: string;
}
