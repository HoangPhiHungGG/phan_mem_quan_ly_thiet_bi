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
  LIQUIDATION_LINE_KINDS,
  LIQUIDATION_METHODS,
} from "./liquidation.schemas";

export class LiquidationLineDto {
  @IsEnum(LIQUIDATION_LINE_KINDS)
  kind!: (typeof LIQUIDATION_LINE_KINDS)[number];
  @IsOptional() @IsMongoId() deviceId?: string;
  @IsOptional() @IsMongoId() partId?: string;
  @IsOptional() @IsMongoId() partSerialId?: string;
  @IsOptional() @IsMongoId() repairId?: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsInt() @Min(0) liquidationValue?: number;
  @IsOptional() @IsString() @Length(0, 1000) reason?: string;
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
}
export class CreateLiquidationDto {
  @IsDateString() documentDate!: string;
  @IsOptional() @IsDateString() liquidationDate?: string;
  @IsMongoId() warehouseId!: string;
  @IsString() @Length(1, 2000) reason!: string;
  @IsEnum(LIQUIDATION_METHODS) method!: (typeof LIQUIDATION_METHODS)[number];
  @IsOptional() @IsMongoId() requestedDepartmentId?: string;
  @IsOptional() @IsString() @Length(0, 150) responsiblePerson?: string;
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LiquidationLineDto)
  lines!: LiquidationLineDto[];
}
export class UpdateLiquidationDto extends CreateLiquidationDto {}
export class DecisionDto {
  @IsString() @Length(1, 500) reason!: string;
}
export class CompleteLiquidationDto {
  @IsOptional() @IsDateString() liquidationDate?: string;
}
