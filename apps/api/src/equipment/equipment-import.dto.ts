import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

export const IMPORT_DUPLICATE_POLICIES = ["ERROR", "SKIP"] as const;

export class PreviewEquipmentImportDto {
  @IsString()
  @Length(1, 255)
  fileName!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  fileSize?: number;

  @IsOptional()
  @IsBoolean()
  autoCreateCatalog?: boolean;

  @IsOptional()
  @IsEnum(IMPORT_DUPLICATE_POLICIES)
  duplicatePolicy?: (typeof IMPORT_DUPLICATE_POLICIES)[number];

  @IsArray()
  @ArrayMaxSize(5000)
  @IsObject({ each: true })
  rows!: Record<string, unknown>[];
}

export class CommitEquipmentImportDto {
  @IsString()
  @Length(10, 100)
  importSessionId!: string;

  @IsOptional()
  @IsBoolean()
  atomic?: boolean;

  @IsOptional()
  @IsBoolean()
  importValidRows?: boolean;
}
