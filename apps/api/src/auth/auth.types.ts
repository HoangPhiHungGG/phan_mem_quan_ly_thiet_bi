import type { Request } from "express";
import type { Types } from "mongoose";
import type { Permission } from "../identity/identity.schemas";

export type EffectiveScope = {
  departmentMode: string;
  departmentIds: string[];
  warehouseMode: string;
  warehouseIds: string[];
};

export type CurrentActor = {
  userId: Types.ObjectId;
  sessionId: Types.ObjectId;
  employeeCode: string;
  email: string;
  displayName: string;
  status: string;
  primaryDepartmentId?: string;
  roleCodes: string[];
  permissions: Permission[];
  scopes: EffectiveScope[];
};

export interface AuthenticatedRequest extends Request {
  actor: CurrentActor;
  rawSessionToken?: string;
}
