import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsBoolean,
  IsInt,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ALL_PERMISSIONS, type Permission } from "./identity.schemas";

export class CreateUserDto {
  @ApiProperty()
  @IsMongoId()
  employeeId!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 12, writeOnly: true })
  @IsString()
  @Length(12, 128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: "Mật khẩu phải có ít nhất một chữ và một số",
  })
  password!: string;

  @ApiProperty()
  @IsMongoId()
  roleId!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;

  @ApiPropertyOptional({ enum: ["ACTIVE", "LOCKED", "INACTIVE"] })
  @IsOptional()
  @IsEnum(["ACTIVE", "LOCKED", "INACTIVE"])
  status?: "ACTIVE" | "LOCKED" | "INACTIVE";
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class AssignUserRoleDto {
  @ApiProperty()
  @IsMongoId()
  roleId!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 12, writeOnly: true })
  @IsString()
  @Length(12, 128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: "Mật khẩu phải có ít nhất một chữ và một số",
  })
  password!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ["ACTIVE", "LOCKED", "INACTIVE"] })
  @IsEnum(["ACTIVE", "LOCKED", "INACTIVE"])
  status!: "ACTIVE" | "LOCKED" | "INACTIVE";
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

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiPropertyOptional({ enum: ALL_PERMISSIONS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ALL_PERMISSIONS.length)
  @IsEnum(ALL_PERMISSIONS, { each: true })
  permissions?: Permission[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsMongoId() departmentId?: string;
  @IsOptional() @IsMongoId() roleId?: string;
  @IsOptional() @Type(() => Number) @IsInt() page?: number;
  @IsOptional() @Type(() => Number) @IsInt() limit?: number;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsMongoId() actorUserId?: string;
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
  @IsOptional()
  @IsString()
  @Length(1, 50)
  code?: string;

  @IsString()
  @Length(1, 150)
  name!: string;

  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @IsOptional() @IsString() @Length(1, 300) address?: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
  @IsOptional() @IsMongoId() managerKeeperId?: string;
}

export class UpdateWarehouseDto extends CreateWarehouseDto {}
