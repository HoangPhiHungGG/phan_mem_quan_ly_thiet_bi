import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ALL_PERMISSIONS, type Permission } from "./identity.schemas";

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @Length(1, 50)
  employeeCode!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 120)
  displayName!: string;

  @ApiProperty({ minLength: 12, writeOnly: true })
  @IsString()
  @Length(12, 128)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  primaryDepartmentId?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ["ACTIVE", "LOCKED", "DISABLED"] })
  @IsEnum(["ACTIVE", "LOCKED", "DISABLED"])
  status!: "ACTIVE" | "LOCKED" | "DISABLED";
}

export class CreateRoleDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_-]{1,49}$/)
  code!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiProperty({ enum: ALL_PERMISSIONS, isArray: true })
  @IsArray()
  @ArrayMaxSize(ALL_PERMISSIONS.length)
  @IsEnum(ALL_PERMISSIONS, { each: true })
  permissions!: Permission[];
}

export class AssignmentScopeDto {
  @ApiProperty()
  @IsEnum([
    "SELF",
    "OWN_DEPARTMENT",
    "DEPARTMENT_TREE",
    "SELECTED_DEPARTMENTS",
    "ALL_DEPARTMENTS",
  ])
  departmentMode!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsMongoId({ each: true })
  departmentIds!: string[];

  @ApiProperty()
  @IsEnum(["NONE", "ASSIGNED_WAREHOUSES", "ALL_WAREHOUSES"])
  warehouseMode!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsMongoId({ each: true })
  warehouseIds!: string[];
}

export class AssignRoleDto {
  @ApiProperty()
  @IsMongoId()
  roleId!: string;

  @ApiProperty({ type: AssignmentScopeDto })
  @ValidateNested()
  @Type(() => AssignmentScopeDto)
  scope!: AssignmentScopeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  validUntil?: Date;
}

export class CreateDepartmentDto {
  @IsString()
  @Length(1, 50)
  code!: string;

  @IsString()
  @Length(1, 150)
  name!: string;

  @IsOptional()
  @IsMongoId()
  parentId?: string;
}

export class CreateWarehouseDto {
  @IsString()
  @Length(1, 50)
  code!: string;

  @IsString()
  @Length(1, 150)
  name!: string;

  @IsOptional()
  @IsMongoId()
  departmentId?: string;
}
