import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { AuditLog } from "./auth.schemas";

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private readonly model: Model<AuditLog>,
  ) {}

  async write(input: {
    actorUserId?: Types.ObjectId;
    action: string;
    entityType?: string;
    entityId?: Types.ObjectId;
    outcome: "SUCCESS" | "FAILURE";
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.model.create(input);
  }
}
