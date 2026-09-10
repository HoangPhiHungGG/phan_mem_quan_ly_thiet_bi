import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
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
import { LOAN_OUT_CONDITIONS, LOAN_IN_CONDITIONS } from "./loan.constants";
import { OPERATION_TYPES } from "./operation.schemas";

export class OperationLineDto {
  @IsEnum(["DEVICE", "PART"]) kind!: "DEVICE" | "PART";
  @IsOptional() @IsMongoId() deviceId?: string;
  @IsOptional() @IsMongoId() partId?: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsEnum(["GOOD", "DEGRADED", "BROKEN"]) handoverCondition?:
    "GOOD" | "DEGRADED" | "BROKEN";
  @IsOptional() @IsEnum(LOAN_IN_CONDITIONS) receivedCondition?: string;
  @IsOptional() @IsString() @Length(1, 500) note?: string;
  @IsOptional() @IsEnum(LOAN_OUT_CONDITIONS) conditionOut?: string;
  @IsOptional() @IsString() @Length(0, 500) conditionOutDescription?: string;
  @IsOptional() @IsString() @Length(0, 500) accessoryNote?: string;
}
export class CreateOperationDto {
  @IsOptional() @IsString() @Length(1, 80) code?: string;
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
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
  // Link Recovery to its original Issue
  @IsOptional() @IsMongoId() issueId?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OperationLineDto)
  lines!: OperationLineDto[];
}
export class UpdateOperationDto extends CreateOperationDto {}
export class ReturnLoanLineDto {
  @IsMongoId() deviceId!: string;
  @IsEnum(LOAN_IN_CONDITIONS) conditionIn!: string;
  @IsOptional() @IsString() @Length(0, 500) conditionInDescription?: string;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}
export class ReturnLoanDto {
  @IsDateString() returnedAt!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReturnLoanLineDto)
  items!: ReturnLoanLineDto[];
  @IsOptional() @IsString() @Length(0, 1000) note?: string;
}
export class ReceiveOperationDto {
  @IsOptional() @IsDateString() returnedAt?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReturnLoanLineDto)
  items?: ReturnLoanLineDto[];
  @IsOptional() @IsArray() @IsMongoId({ each: true }) deviceIds?: string[];
  @IsOptional() @IsString() @Length(1, 500) note?: string;
}
export class RejectOperationDto {
  @IsString() @Length(1, 500) reason!: string;
}
