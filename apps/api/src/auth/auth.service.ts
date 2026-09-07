import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Model, Types } from "mongoose";
import {
  Role,
  RoleAssignment,
  User,
  type Permission,
} from "../identity/identity.schemas";
import { AuthSession } from "./auth.schemas";
import type { CurrentActor, EffectiveScope } from "./auth.types";
import { AuditService } from "./audit.service";
import { LoginRateLimiter } from "./login-rate-limiter.service";
import { verifyPassword, hashPassword } from "./password";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Role.name) private readonly roles: Model<Role>,
    @InjectModel(RoleAssignment.name)
    private readonly assignments: Model<RoleAssignment>,
    @InjectModel(AuthSession.name)
    private readonly sessions: Model<AuthSession>,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly rateLimiter: LoginRateLimiter,
  ) {}

  get sessionTtlMs(): number {
    const hours = this.config.get<number>("SESSION_TTL_HOURS") ?? 8;
    return Math.max(1, Math.min(hours, 168)) * 60 * 60 * 1000;
  }

  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{
    actor: CurrentActor;
    token: string;
    csrfToken: string;
    expiresAt: Date;
  }> {
    const emailNormalized = email.trim().toLowerCase();
    const rateKey = `${ipAddress ?? "unknown"}:${emailNormalized}`;
    this.rateLimiter.assertAllowed(rateKey);

    const user = await this.users
      .findOne({ emailNormalized })
      .select("+passwordHash")
      .exec();
    const valid = user
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPassword(
          password,
          await hashPassword(randomBytes(24).toString("hex")),
        );

    if (!user || !valid) {
      this.rateLimiter.recordFailure(rateKey);
      await this.audit.write({
        action: "AUTH_LOGIN",
        outcome: "FAILURE",
        ipAddress,
        metadata: { emailNormalized, reason: "INVALID_CREDENTIALS" },
      });
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "Email hoặc mật khẩu không đúng.",
      });
    }

    if (user.status !== "ACTIVE") {
      await this.sessions.updateMany(
        { userId: user._id, revokedAt: { $exists: false } },
        {
          $set: { revokedAt: new Date(), revokeReason: `USER_${user.status}` },
        },
      );
      await this.audit.write({
        actorUserId: user._id,
        action: "AUTH_LOGIN",
        outcome: "FAILURE",
        ipAddress,
        metadata: { reason: `USER_${user.status}` },
      });
      throw new ForbiddenException({
        code: "ACCOUNT_UNAVAILABLE",
        message: "Tài khoản không thể đăng nhập.",
      });
    }

    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.sessionTtlMs);
    const session = await this.sessions.create({
      userId: user._id,
      tokenHash: sha256(token),
      csrfHash: sha256(csrfToken),
      userAgent: userAgent?.slice(0, 500),
      ipAddress: ipAddress?.slice(0, 100),
      expiresAt,
    });
    user.lastLoginAt = new Date();
    await user.save();
    this.rateLimiter.reset(rateKey);
    const actor = await this.buildActor(user, session._id);
    await this.audit.write({
      actorUserId: user._id,
      action: "AUTH_LOGIN",
      entityType: "AuthSession",
      entityId: session._id,
      outcome: "SUCCESS",
      ipAddress,
    });
    return { actor, token, csrfToken, expiresAt };
  }

  async authenticate(rawToken: string): Promise<CurrentActor> {
    const session = await this.sessions
      .findOne({
        tokenHash: sha256(rawToken),
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      .select("+csrfHash")
      .exec();
    if (!session) throw new UnauthorizedException({ code: "SESSION_INVALID" });
    const user = await this.users.findById(session.userId).exec();
    if (!user || user.status !== "ACTIVE") {
      session.revokedAt = new Date();
      session.revokeReason = "USER_UNAVAILABLE";
      await session.save();
      throw new UnauthorizedException({ code: "SESSION_REVOKED" });
    }
    session.lastUsedAt = new Date();
    await session.save();
    return this.buildActor(user, session._id);
  }

  async verifyCsrf(rawToken: string, csrfToken: string): Promise<boolean> {
    const session = await this.sessions
      .findOne({ tokenHash: sha256(rawToken), revokedAt: { $exists: false } })
      .select("+csrfHash")
      .exec();
    if (!session) return false;
    const expected = Buffer.from(session.csrfHash, "hex");
    const actual = Buffer.from(sha256(csrfToken), "hex");
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  async logout(
    rawToken: string,
    actor: CurrentActor,
    ipAddress?: string,
  ): Promise<void> {
    await this.sessions.updateOne(
      { _id: actor.sessionId, tokenHash: sha256(rawToken) },
      { $set: { revokedAt: new Date(), revokeReason: "LOGOUT" } },
    );
    await this.audit.write({
      actorUserId: actor.userId,
      action: "AUTH_LOGOUT",
      entityType: "AuthSession",
      entityId: actor.sessionId,
      outcome: "SUCCESS",
      ipAddress,
    });
  }

  async revokeUserSessions(
    userId: Types.ObjectId,
    reason: string,
  ): Promise<void> {
    await this.sessions.updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date(), revokeReason: reason } },
    );
  }

  private async buildActor(
    user: User & { _id: Types.ObjectId },
    sessionId: Types.ObjectId,
  ) {
    const now = new Date();
    const assignments = await this.assignments
      .find({
        userId: user._id,
        revokedAt: { $exists: false },
        validFrom: { $lte: now },
        $or: [{ validUntil: { $exists: false } }, { validUntil: { $gt: now } }],
      })
      .exec();
    const roleIds = assignments.map((assignment) => assignment.roleId);
    const roles = await this.roles
      .find({ _id: { $in: roleIds }, isActive: true })
      .exec();
    const roleById = new Map(roles.map((role) => [role._id.toString(), role]));
    const permissions = new Set<Permission>(["account.read.self"]);
    const scopes: EffectiveScope[] = [];
    for (const assignment of assignments) {
      const role = roleById.get(assignment.roleId.toString());
      if (!role) continue;
      role.permissions.forEach((permission) => permissions.add(permission));
      scopes.push({
        departmentMode: assignment.scope.departmentMode,
        departmentIds: assignment.scope.departmentIds.map(String),
        warehouseMode: assignment.scope.warehouseMode,
        warehouseIds: assignment.scope.warehouseIds.map(String),
      });
    }
    return {
      userId: user._id,
      sessionId,
      employeeCode: user.employeeCode,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      primaryDepartmentId: user.primaryDepartmentId?.toString(),
      roleCodes: roles.map((role) => role.code),
      permissions: [...permissions],
      scopes,
    } satisfies CurrentActor;
  }
}
