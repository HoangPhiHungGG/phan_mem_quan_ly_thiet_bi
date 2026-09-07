import { Type } from "class-transformer";
import {
  ArrayMaxSize,
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
import { OPERATION_TYPES } from "./operation.schemas";

export class OperationLineDto {
  @IsEnum(["DEVICE", "PART"]) kind!: "DEVICE" | "PART";
  @IsOptional() @IsMongoId() deviceId?: string;
  @IsOptional() @IsMongoId() partId?: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsEnum(["GOOD", "DEGRADED", "BROKEN"]) handoverCondition?:
    "GOOD" | "DEGRADED" | "BROKEN";
  @IsOptional() @IsString() @Length(1, 500) note?: string;
}
export class CreateOperationDto {
  @IsString() @Length(1, 80) code!: string;
  @IsEnum(OPERATION_TYPES) type!: (typeof OPERATION_TYPES)[number];
  @IsDateString() operationDate!: string;
  @IsOptional() @IsMongoId() sourceWarehouseId?: string;
  @IsOptional() @IsMongoId() destinationWarehouseId?: string;
  @IsOptional() @IsMongoId() sourceLocationId?: string;
  @IsOptional() @IsMongoId() destinationLocationId?: string;
  @IsOptional() @IsMongoId() receiverKeeperId?: string;
  @IsOptional() @IsMongoId() receiverDepartmentId?: string;
  @IsOptional() @IsMongoId() senderKeeperId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsString() @Length(1, 1000) reason!: string;
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OperationLineDto)
  lines!: OperationLineDto[];
}
export class UpdateOperationDto extends CreateOperationDto {}
export class ReceiveOperationDto {
  @IsOptional() @IsArray() @IsMongoId({ each: true }) deviceIds?: string[];
  @IsOptional() @IsString() @Length(1, 500) note?: string;
}
export class RejectOperationDto {
  @IsString() @Length(1, 500) reason!: string;
}
