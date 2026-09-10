import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export const REPORT_TYPES = [
  "assets",
  "parts",
  "inventory",
  "receipts",
  "issues",
  "loans",
  "overdue",
  "transfers",
  "recoveries",
  "repairs",
  "inventories",
  "liquidations",
  "employees",
  "departments",
  "summary",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export class ReportQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsMongoId() warehouseId?: string;
  @IsOptional() @IsMongoId() departmentId?: string;
  @IsOptional() @IsMongoId() employeeId?: string;
  @IsOptional() @IsMongoId() deviceTypeId?: string;
  @IsOptional() @IsMongoId() modelId?: string;
  @IsOptional() @IsMongoId() supplierId?: string;
  @IsOptional() @IsString() techCondition?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() assetType?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) page =
    1;
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @IsOptional()
  @Transform(({ value }) => value === "true")
  @IsBoolean()
  export = false;
  @IsOptional() @IsIn(["xlsx", "pdf", "print"]) format?:
    "xlsx" | "pdf" | "print";
}
