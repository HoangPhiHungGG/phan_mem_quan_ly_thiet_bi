import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Types } from "mongoose";
import type { Model } from "mongoose";
import type { CurrentActor } from "../auth/auth.types";
import { Notification } from "./notification.schemas";
import type { NotificationQueryDto } from "./notification.dto";

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notifications: Model<Notification>,
  ) {}

  async list(actor: CurrentActor, query: NotificationQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const filter: Record<string, unknown> = { userId: actor.userId };
    if (query.status === "unread") filter.isRead = false;
    if (query.status === "read") filter.isRead = true;
    if (query.type) filter.type = query.type;
    if (query.severity) filter.severity = query.severity;
    const [data, total] = await Promise.all([
      this.notifications
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.notifications.countDocuments(filter).exec(),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async unreadCount(actor: CurrentActor) {
    return {
      unreadCount: await this.notifications
        .countDocuments({ userId: actor.userId, isRead: false })
        .exec(),
    };
  }

  async markRead(actor: CurrentActor, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    const item = await this.notifications
      .findOneAndUpdate(
        { _id: id, userId: actor.userId },
        { $set: { isRead: true, readAt: new Date() } },
        { new: true },
      )
      .lean()
      .exec();
    if (!item) throw new NotFoundException({ code: "RESOURCE_NOT_FOUND" });
    return { data: item };
  }

  async markAllRead(actor: CurrentActor) {
    const result = await this.notifications
      .updateMany(
        { userId: actor.userId, isRead: false },
        { $set: { isRead: true, readAt: new Date() } },
      )
      .exec();
    return { updated: result.modifiedCount };
  }
}
