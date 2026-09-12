import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Schema as MongooseSchema, Types } from "mongoose";

@Schema({ collection: "equipment_import_sessions", timestamps: true })
export class EquipmentImportSession {
  @Prop({ required: true, unique: true, index: true })
  sessionId!: string;

  @Prop({ required: true, enum: ["DEVICE", "PART"] })
  kind!: "DEVICE" | "PART";

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  actorUserId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 255 })
  fileName!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  options!: Record<string, unknown>;

  @Prop({ type: [MongooseSchema.Types.Mixed], required: true })
  rows!: Record<string, unknown>[];

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  preview!: Record<string, unknown>;

  @Prop({
    required: true,
    enum: ["PREVIEWED", "PROCESSING", "COMPLETED"],
    default: "PREVIEWED",
  })
  status!: "PREVIEWED" | "PROCESSING" | "COMPLETED";

  @Prop({ type: MongooseSchema.Types.Mixed })
  result?: Record<string, unknown>;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const EquipmentImportSessionSchema = SchemaFactory.createForClass(
  EquipmentImportSession,
);
EquipmentImportSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
EquipmentImportSessionSchema.index({ actorUserId: 1, createdAt: -1 });
