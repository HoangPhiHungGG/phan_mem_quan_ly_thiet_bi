import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from "class-validator";
import {
  REPAIR_OUTCOMES,
  REPAIR_SEVERITIES,
  REPAIR_TARGET_KINDS,
  REPAIR_TYPES,
} from "./repairs.schemas";

export class RepairPartLineDto {
  @IsMongoId() partId!: string;
  @IsOptional() @IsMongoId() partSerialId?: string;
  @IsOptional() @IsString() @Length(1, 120) serial?: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class CreateRepairDto {
  @IsDateString() repairDate!: string;
  @IsEnum(REPAIR_TARGET_KINDS)
  targetKind!: (typeof REPAIR_TARGET_KINDS)[number];
  @IsOptional() @IsMongoId() deviceId?: string;
  @IsOptional() @IsMongoId() partSerialId?: string;
  @IsEnum(["GOOD", "DEGRADED", "BROKEN"]) conditionBefore!:
    "GOOD" | "DEGRADED" | "BROKEN";
  @IsString() @Length(1, 2000) issueDescription!: string;
  @IsEnum(REPAIR_SEVERITIES) severity!: (typeof REPAIR_SEVERITIES)[number];
  @IsEnum(REPAIR_TYPES) repairType!: (typeof REPAIR_TYPES)[number];
  @IsOptional() @IsString() @Length(0, 200) vendor?: string;
  @IsOptional() @IsString() @Length(0, 150) vendorContact?: string;
  @IsOptional() @IsString() @Length(0, 150) responsiblePerson?: string;
  @IsOptional() @IsDateString() sentAt?: string;
  @IsOptional() @IsDateString() expectedCompletionAt?: string;
  @IsOptional() @IsInt() @Min(0) inspectionCost?: number;
  @IsOptional() @IsInt() @Min(0) repairCost?: number;
  @IsOptional() @IsInt() @Min(0) partsCost?: number;
  @IsOptional() @IsInt() @Min(0) otherCost?: number;
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RepairPartLineDto)
  parts?: RepairPartLineDto[];
  @IsOptional() @IsMongoId() partsWarehouseId?: string;
}

export class UpdateRepairDto extends CreateRepairDto {}

export class CompleteRepairDto {
  @IsString() @Length(1, 2000) result!: string;
  @IsEnum(["GOOD", "DEGRADED", "BROKEN"]) conditionAfter!:
    "GOOD" | "DEGRADED" | "BROKEN";
  @IsEnum(REPAIR_OUTCOMES) outcome!: (typeof REPAIR_OUTCOMES)[number];
  @IsOptional() @IsString() @Length(0, 2000) repairContent?: string;
  @IsOptional() @IsDateString() completedAt?: string;
  @IsOptional() @IsInt() @Min(0) inspectionCost?: number;
  @IsOptional() @IsInt() @Min(0) repairCost?: number;
  @IsOptional() @IsInt() @Min(0) partsCost?: number;
  @IsOptional() @IsInt() @Min(0) otherCost?: number;
  @IsOptional() @IsMongoId() destinationWarehouseId?: string;
  @IsOptional() @IsMongoId() destinationLocationId?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RepairPartLineDto)
  parts?: RepairPartLineDto[];
  @IsOptional() @IsMongoId() partsWarehouseId?: string;
}

export class UnrepairableRepairDto {
  @IsString() @Length(1, 2000) result!: string;
  @IsOptional()
  @IsEnum(REPAIR_OUTCOMES)
  outcome?: (typeof REPAIR_OUTCOMES)[number];
  @IsOptional() @IsInt() @Min(0) inspectionCost?: number;
  @IsOptional() @IsInt() @Min(0) repairCost?: number;
  @IsOptional() @IsInt() @Min(0) otherCost?: number;
  @IsOptional() @IsInt() @Min(0) partsCost?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RepairPartLineDto)
  parts?: RepairPartLineDto[];
  @IsOptional() @IsMongoId() partsWarehouseId?: string;
}

export class CancelRepairDto {
  @IsString() @Length(1, 500) reason!: string;
}

export class ReceiveRepairDto {
  @IsOptional() @IsDateString() receivedAt?: string;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class StartRepairDto {
  @IsOptional() @IsString() @Length(0, 500) note?: string;
  @IsOptional() @IsDateString() sentAt?: string;
  @IsOptional() @IsDateString() expectedCompletionAt?: string;
}

export class UpdateRepairProgressDto {
  @IsOptional() @IsString() @Length(0, 2000) repairContent?: string;
  @IsOptional() @IsString() @Length(0, 200) vendor?: string;
  @IsOptional() @IsString() @Length(0, 150) vendorContact?: string;
  @IsOptional() @IsString() @Length(0, 150) responsiblePerson?: string;
  @IsOptional() @IsDateString() expectedCompletionAt?: string;
  @IsOptional() @IsInt() @Min(0) inspectionCost?: number;
  @IsOptional() @IsInt() @Min(0) repairCost?: number;
  @IsOptional() @IsInt() @Min(0) partsCost?: number;
  @IsOptional() @IsInt() @Min(0) otherCost?: number;
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
}
