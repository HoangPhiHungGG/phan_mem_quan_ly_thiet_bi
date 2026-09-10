import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { Permission } from "../identity/identity.schemas";
import { AuthService } from "./auth.service";
import {
  CSRF_COOKIE,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  SESSION_COOKIE,
} from "./auth.constants";
import { getCookie } from "./cookies";
import type { AuthenticatedRequest } from "./auth.types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.allowedOrigins = new Set(
      (config.get<string>("CORS_ORIGINS") ?? "http://localhost:3000")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    this.assertOrigin(request);
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const rawToken = getCookie(request, SESSION_COOKIE);
    if (!rawToken) throw new UnauthorizedException({ code: "AUTH_REQUIRED" });
    request.actor = await this.auth.authenticate(rawToken);
    request.rawSessionToken = rawToken;

    if (
      request.actor.mustChangePassword &&
      ![
        "/api/auth/me",
        "/api/auth/change-password",
        "/api/auth/logout",
      ].includes(request.path)
    ) {
      throw new ForbiddenException({ code: "PASSWORD_CHANGE_REQUIRED" });
    }

    if (!SAFE_METHODS.has(request.method)) {
      const csrfCookie = getCookie(request, CSRF_COOKIE);
      const csrfHeader = request.headers["x-csrf-token"];
      if (
        !csrfCookie ||
        typeof csrfHeader !== "string" ||
        csrfHeader !== csrfCookie ||
        !(await this.auth.verifyCsrf(rawToken, csrfHeader))
      ) {
        throw new ForbiddenException({ code: "CSRF_INVALID" });
      }
    }
    return true;
  }

  private assertOrigin(request: Request): void {
    if (SAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin && !this.allowedOrigins.has(origin)) {
      throw new ForbiddenException({ code: "ORIGIN_NOT_ALLOWED" });
    }
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const granted = new Set(request.actor.permissions);
    const legacy: Partial<Record<Permission, Permission[]>> = {
      "users.view": ["users.read"],
      "users.create": ["users.manage"],
      "users.update": ["users.manage"],
      "users.assign_role": ["users.manage", "roles.assign"],
      "users.lock": ["users.manage"],
      "users.activate": ["users.manage"],
      "users.reset_password": ["users.manage"],
      "users.delete": ["users.manage"],
      "roles.view": ["roles.read"],
    };
    if (
      !required.every((permission) => {
        const oldPermission = legacy[permission];
        return (
          granted.has(permission) ||
          Boolean(oldPermission?.some((item) => granted.has(item)))
        );
      })
    ) {
      throw new ForbiddenException({ code: "PERMISSION_DENIED" });
    }
    return true;
  }
}
