import {
  IsBoolean,
  IsEmail,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export const CATALOG_TYPES = [
  "departments",
  "warehouses",
  "locations",
  "keepers",
  "suppliers",
  "device-types",
  "units",
  "item-models",
] as const;

export type CatalogType = (typeof CATALOG_TYPES)[number];

export class CreateCatalogDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  code?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 150)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  employeeCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 300)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 150)
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  deviceTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  unitId?: string;
}

export class UpdateCatalogDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 300)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 150)
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  deviceTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  unitId?: string;
}

export class UpdateCatalogStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}
