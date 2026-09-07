import { IsEmail, IsString, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ example: "admin@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 12, writeOnly: true })
  @IsString()
  @Length(12, 128)
  password!: string;
}
