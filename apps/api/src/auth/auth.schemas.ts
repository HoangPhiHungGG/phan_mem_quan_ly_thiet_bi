import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";

export type AuthSessionDocument = HydratedDocument<AuthSession>;
export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ collection: "auth_sessions", timestamps: true })
export class AuthSession {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, select: false })
  tokenHash!: string;

  @Prop({ required: true, select: false })
  csrfHash!: string;

  @Prop({ trim: true, maxlength: 500 })
  userAgent?: string;

  @Prop({ trim: true, maxlength: 100 })
  ipAddress?: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  lastUsedAt?: Date;

  @Prop()
  revokedAt?: Date;

  @Prop({ trim: true, maxlength: 200 })
  revokeReason?: string;
}

export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);
AuthSessionSchema.index({ tokenHash: 1 }, { unique: true });
AuthSessionSchema.index({ userId: 1, revokedAt: 1 });
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Schema({
  collection: "audit_logs",
  timestamps: { createdAt: true, updatedAt: false },
})
export class AuditLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User" })
  actorUserId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  action!: string;

  @Prop({ trim: true })
  entityType?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  entityId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  outcome!: "SUCCESS" | "FAILURE";

  @Prop({ trim: true })
  ipAddress?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
