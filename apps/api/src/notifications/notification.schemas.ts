import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";

export type NotificationDocument = HydratedDocument<Notification>;
export const NOTIFICATION_SEVERITIES = [
  "INFO",
  "WARNING",
  "CRITICAL",
  "SUCCESS",
] as const;

@Schema({ collection: "notifications", timestamps: true })
export class Notification {
  @Prop({
    required: true,
    type: MongooseSchema.Types.ObjectId,
    ref: "User",
    index: true,
  })
  userId!: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 80 }) type!: string;
  @Prop({
    required: true,
    type: String,
    enum: NOTIFICATION_SEVERITIES,
    default: "INFO",
  })
  severity!: (typeof NOTIFICATION_SEVERITIES)[number];
  @Prop({ required: true, trim: true, maxlength: 200 }) title!: string;
  @Prop({ required: true, trim: true, maxlength: 1000 }) message!: string;
  @Prop({ trim: true, maxlength: 50 }) referenceType?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId }) referenceId?: Types.ObjectId;
  @Prop({ trim: true, maxlength: 500 }) route?: string;
  @Prop({ default: false, index: true }) isRead!: boolean;
  @Prop() readAt?: Date;
  @Prop({ trim: true, maxlength: 180, unique: true, sparse: true })
  deduplicationKey?: string;
  @Prop() expiresAt?: Date;
  @Prop({ type: MongooseSchema.Types.Mixed }) metadata?: Record<
    string,
    unknown
  >;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
