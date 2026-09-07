import {
  SetMetadata,
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from "./auth.constants";
import type { AuthenticatedRequest, CurrentActor } from "./auth.types";
import type { Permission } from "../identity/identity.schemas";

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentActor =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().actor,
);
