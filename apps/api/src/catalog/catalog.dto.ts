import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { KEEPER_STATUSES } from "./catalog.schemas";

export const CATALOG_TYPES = [
  "departments",
  "warehouses",
  "locations",
  "keepers",
  "positions",
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  managerKeeperId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  joinedAt?: string;

  @ApiPropertyOptional({ enum: KEEPER_STATUSES })
  @IsOptional()
  @IsEnum(KEEPER_STATUSES)
  status?: (typeof KEEPER_STATUSES)[number];
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  managerKeeperId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  joinedAt?: string;

  @ApiPropertyOptional({ enum: KEEPER_STATUSES })
  @IsOptional()
  @IsEnum(KEEPER_STATUSES)
  status?: (typeof KEEPER_STATUSES)[number];
}

export class UpdateCatalogStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}
