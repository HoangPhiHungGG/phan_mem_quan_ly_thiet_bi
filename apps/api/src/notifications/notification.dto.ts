import { IsEnum, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { NOTIFICATION_SEVERITIES } from "./notification.schemas";

export class NotificationQueryDto {
  @IsOptional() @IsEnum(["all", "unread", "read"]) status?:
    "all" | "unread" | "read";
  @IsOptional() @IsString() type?: string;
  @IsOptional()
  @IsEnum(NOTIFICATION_SEVERITIES)
  severity?: (typeof NOTIFICATION_SEVERITIES)[number];
  @Type(() => Number) @IsOptional() @Min(1) page?: number;
  @Type(() => Number) @IsOptional() @Min(1) @Max(100) limit?: number;
}
