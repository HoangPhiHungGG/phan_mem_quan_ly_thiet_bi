import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Min,
} from "class-validator";
import { COUNT_SCOPES } from "./inventory-count.schemas";
export class CreateCountDto {
  @IsString() @Length(1, 200) name!: string;
  @IsDateString() countDate!: string;
  @IsEnum(COUNT_SCOPES) scope!: (typeof COUNT_SCOPES)[number];
  @IsOptional() @IsMongoId() warehouseId?: string;
  @IsOptional() @IsMongoId() departmentId?: string;
  @IsOptional() @IsMongoId() locationId?: string;
  @IsString() @Length(1, 150) responsiblePerson!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) members?: string[];
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
}
export class UpdateCountDto extends CreateCountDto {}
export class CheckDeviceDto {
  @IsInt() @Min(0) revision!: number;
  @IsBoolean() found!: boolean;
  @IsOptional() @IsMongoId() actualWarehouseId?: string;
  @IsOptional() @IsMongoId() actualDepartmentId?: string;
  @IsOptional() @IsMongoId() actualKeeperId?: string;
  @IsOptional() @IsMongoId() actualLocationId?: string;
  @IsOptional()
  @IsEnum(["GOOD", "DEGRADED", "BROKEN"])
  actualCondition?: string;
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
}
export class CheckPartDto {
  @IsInt() @Min(0) revision!: number;
  @IsInt() @Min(0) actualQuantity!: number;
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
}
export class ResolveDiscrepancyDto {
  @IsEnum(["ACCEPT", "REJECT", "ADJUST"]) action!:
    "ACCEPT" | "REJECT" | "ADJUST";
  @IsString() @Length(1, 1000) cause!: string;
  @IsString() @Length(1, 1000) resolution!: string;
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
}
export class CancelCountDto {
  @IsString() @Length(1, 500) reason!: string;
}
export class RecordUnexpectedDto {
  @IsString() @Length(1, 80) assetCode!: string;
  @IsOptional() @IsString() @Length(0, 120) serial?: string;
  @IsOptional() @IsString() @Length(0, 150) name?: string;
  @IsOptional() @IsMongoId() actualLocationId?: string;
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
}
