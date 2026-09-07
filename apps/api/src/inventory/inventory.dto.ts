import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Min,
} from "class-validator";
export const INVENTORY_TYPES = [
  "OPENING",
  "PURCHASE",
  "ISSUE",
  "RETURN",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "DISPOSAL",
  "ADJUSTMENT",
] as const;
export class CreateInventoryTransactionDto {
  @IsMongoId() partId!: string;
  @IsMongoId() warehouseId!: string;
  @IsEnum(INVENTORY_TYPES) type!: (typeof INVENTORY_TYPES)[number];
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() @Length(1, 500) note?: string;
}
