import { Controller, Get, Patch, Param, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators";
import type { CurrentActor } from "../auth/auth.types";
import { NotificationQueryDto } from "./notification.dto";
import { NotificationService } from "./notification.service";

@Controller("api/notifications")
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}
  @Get() list(
    @CurrentUser() actor: CurrentActor,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notifications.list(actor, query);
  }
  @Get("unread-count") unreadCount(@CurrentUser() actor: CurrentActor) {
    return this.notifications.unreadCount(actor);
  }
  @Patch("read-all") readAll(@CurrentUser() actor: CurrentActor) {
    return this.notifications.markAllRead(actor);
  }
  @Patch(":id/read") read(
    @CurrentUser() actor: CurrentActor,
    @Param("id") id: string,
  ) {
    return this.notifications.markRead(actor, id);
  }
}
