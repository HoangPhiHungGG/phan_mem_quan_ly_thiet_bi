import { INestApplication, ValidationPipe } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { NestFactory } from "@nestjs/core";
import { createHash } from "node:crypto";
import { Model, Types } from "mongoose";
import request from "supertest";
import { AppModule } from "../src/app.module";
import {
  ALL_PERMISSIONS,
  Role,
  RoleAssignment,
  User,
} from "../src/identity/identity.schemas";
import { AuthSession } from "../src/auth/auth.schemas";
import { hashPassword } from "../src/auth/password";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const PASSWORD = "E2E-Strong-Password-2026!";

type AuthCookies = { session: string; csrf: string };

function parseCookies(setCookies: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of setCookies) {
    const pair = line.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    result[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
  }
  return result;
}

function sessionHeader(cookie: AuthCookies): Record<string, string> {
  return { Cookie: `pmqltb_session=${cookie.session}` };
}

function mutatingHeader(cookie: AuthCookies): Record<string, string> {
  return {
    Cookie: `pmqltb_session=${cookie.session}; pmqltb_csrf=${cookie.csrf}`,
    "X-CSRF-Token": cookie.csrf,
  };
}

describe("Xác thực & phân quyền (E2E) - Bước 3", () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let usersModel: Model<User>;
  let rolesModel: Model<Role>;
  let assignmentsModel: Model<RoleAssignment>;
  let sessionsModel: Model<AuthSession>;

  const adminEmail = "e2e-admin@example.com";
  const userEmail = "e2e-user@example.com";
  const lockedEmail = "e2e-locked@example.com";
  const testEmails = [adminEmail, userEmail, lockedEmail];

  let adminId: Types.ObjectId;
  let userId: Types.ObjectId;
  let lockedId: Types.ObjectId;

  async function login(
    email: string,
    password = PASSWORD,
  ): Promise<{ cookies: AuthCookies; status: number; body: unknown }> {
    const response = await request(server)
      .post("/api/auth/login")
      .send({ email, password });
    const setCookieHeader = response.headers["set-cookie"];
    const setCookies: string[] = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : setCookieHeader
        ? [setCookieHeader]
        : [];
    const cookies = parseCookies(setCookies);
    return {
      cookies: { session: cookies.pmqltb_session, csrf: cookies.pmqltb_csrf },
      status: response.status,
      body: response.body,
    };
  }

  async function cleanup() {
    await sessionsModel.deleteMany({});
    const userIds = [
      ...(adminId ? [adminId] : []),
      ...(userId ? [userId] : []),
      ...(lockedId ? [lockedId] : []),
    ];
    if (userIds.length) {
      await assignmentsModel.deleteMany({ userId: { $in: userIds } });
      await sessionsModel.deleteMany({ userId: { $in: userIds } });
    }
    await usersModel.deleteMany({ emailNormalized: { $in: testEmails } });
    await rolesModel.deleteMany({ code: "E2E_ADMIN" });
  }

  beforeAll(async () => {
    app = await NestFactory.create<INestApplication>(AppModule, {
      logger: ["error", "warn"],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer();

    usersModel = app.get(getModelToken(User.name));
    rolesModel = app.get(getModelToken(Role.name));
    assignmentsModel = app.get(getModelToken(RoleAssignment.name));
    sessionsModel = app.get(getModelToken(AuthSession.name));

    await cleanup();

    const passwordHash = await hashPassword(PASSWORD);
    const admin = await usersModel.create({
      employeeCode: "E2EADM01",
      employeeCodeNormalized: "E2EADM01",
      email: adminEmail,
      emailNormalized: adminEmail,
      displayName: "Quản trị E2E",
      passwordHash,
      status: "ACTIVE",
    });
    adminId = admin._id;

    const regular = await usersModel.create({
      employeeCode: "E2EUSR01",
      employeeCodeNormalized: "E2EUSR01",
      email: userEmail,
      emailNormalized: userEmail,
      displayName: "Người dùng E2E",
      passwordHash,
      status: "ACTIVE",
    });
    userId = regular._id;

    const locked = await usersModel.create({
      employeeCode: "E2ELCK01",
      employeeCodeNormalized: "E2ELCK01",
      email: lockedEmail,
      emailNormalized: lockedEmail,
      displayName: "Tài khoản bị khóa",
      passwordHash,
      status: "LOCKED",
    });
    lockedId = locked._id;

    const adminRole = await rolesModel.create({
      code: "E2E_ADMIN",
      name: "Quản trị E2E",
      permissions: [...ALL_PERMISSIONS],
      system: false,
      isActive: true,
    });

    await assignmentsModel.create({
      userId: adminId,
      roleId: adminRole._id,
      scope: {
        departmentMode: "ALL_DEPARTMENTS",
        departmentIds: [],
        warehouseMode: "ALL_WAREHOUSES",
        warehouseIds: [],
      },
      validFrom: new Date(Date.now() - 60_000),
      grantedBy: adminId,
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it("1. Không đăng nhập: trả 401 khi không có phiên", async () => {
    const response = await request(server).get("/api/users");
    expect(response.status).toBe(401);
    expect(response.body.error?.code ?? response.body.code).toBe(
      "AUTH_REQUIRED",
    );

    const me = await request(server).get("/api/auth/me");
    expect(me.status).toBe(401);
  });

  it("2. Sai mật khẩu: trả 401 và không tạo phiên", async () => {
    const result = await login(adminEmail, "Sai-Mat-Khau-2026!");
    expect(result.status).toBe(401);
    expect(
      (result.body as { error?: { code?: string }; code?: string }).error
        ?.code ?? (result.body as { code?: string }).code,
    ).toBe("INVALID_CREDENTIALS");
    expect(result.cookies.session).toBeUndefined();
  });

  it("3. Đăng nhập đúng: trả thông tin tài khoản và đặt cookie HttpOnly + CSRF", async () => {
    const result = await login(adminEmail);
    expect(result.status).toBe(200);
    expect(result.cookies.session).toBeTruthy();
    expect(result.cookies.csrf).toBeTruthy();
    const user = (result.body as { user: { email: string } }).user;
    expect(user.email).toBe(adminEmail);
  });

  it("4. Đăng xuất: thu hồi phiên, dùng lại phiên cũ trả 401", async () => {
    const result = await login(userEmail);
    expect(result.status).toBe(200);

    const me = await request(server)
      .get("/api/auth/me")
      .set(sessionHeader(result.cookies));
    expect(me.status).toBe(200);

    const logout = await request(server)
      .post("/api/auth/logout")
      .set(mutatingHeader(result.cookies));
    expect(logout.status).toBe(204);

    const after = await request(server)
      .get("/api/auth/me")
      .set(sessionHeader(result.cookies));
    expect(after.status).toBe(401);
  });
  it("5. Hết phiên: phiên hết hạn bị từ chối", async () => {
    const expiredToken = "expired-session-token";
    await sessionsModel.create({
      userId,
      tokenHash: sha256(expiredToken),
      csrfHash: sha256("expired-csrf"),
      expiresAt: new Date(Date.now() - 1000),
    });
    const response = await request(server)
      .get("/api/auth/me")
      .set("Cookie", `pmqltb_session=${expiredToken}`);
    expect(response.status).toBe(401);
  });

  it("6. Bị khóa: không đăng nhập được", async () => {
    const result = await login(lockedEmail);
    expect(result.status).toBe(403);
    expect(
      (result.body as { error?: { code?: string }; code?: string }).error
        ?.code ?? (result.body as { code?: string }).code,
    ).toBe("ACCOUNT_UNAVAILABLE");
  });

  it("7. Khóa tài khoản: thu hồi mọi phiên đang hoạt động", async () => {
    const result = await login(userEmail);
    expect(result.status).toBe(200);

    const admin = await login(adminEmail);
    const patch = await request(server)
      .patch(`/api/users/${userId}/status`)
      .set(mutatingHeader(admin.cookies))
      .send({ status: "LOCKED" });
    expect(patch.status).toBe(200);

    // Phiên cũ của người dùng đã bị thu hồi
    const after = await request(server)
      .get("/api/auth/me")
      .set(sessionHeader(result.cookies));
    expect(after.status).toBe(401);

    // Khôi phục trạng thái ACTIVE để các test sau không bị ảnh hưởng
    const restore = await request(server)
      .patch(`/api/users/${userId}/status`)
      .set(mutatingHeader(admin.cookies))
      .send({ status: "ACTIVE" });
    expect(restore.status).toBe(200);
  });
  it("8. Truy cập trái quyền: người dùng thường bị từ chối API quản trị", async () => {
    const regular = await login(userEmail);
    expect(regular.status).toBe(200);

    const create = await request(server)
      .post("/api/users")
      .set(mutatingHeader(regular.cookies))
      .send({
        employeeCode: "E2EVIP01",
        email: "bo-quyen-e2e@example.com",
        displayName: "Bỏ quyền E2E",
        password: PASSWORD,
      });
    expect(create.status).toBe(403);
    expect(
      (create.body as { error?: { code?: string }; code?: string }).error
        ?.code ?? (create.body as { code?: string }).code,
    ).toBe("PERMISSION_DENIED");

    const list = await request(server)
      .get("/api/users")
      .set(sessionHeader(regular.cookies));
    expect(list.status).toBe(403);
  });

  it("9. Thay ID (IDOR): không xem được dữ liệu người khác", async () => {
    const regular = await login(userEmail);
    expect(regular.status).toBe(200);

    // Xem chính mình: 200
    const own = await request(server)
      .get(`/api/users/${userId}`)
      .set(sessionHeader(regular.cookies));
    expect(own.status).toBe(200);

    // Thay ID sang người khác: 404 (không lộ dữ liệu)
    const other = await request(server)
      .get(`/api/users/${adminId}`)
      .set(sessionHeader(regular.cookies));
    expect(other.status).toBe(404);

    // Quản trị viên đọc được mọi tài khoản
    const admin = await login(adminEmail);
    const adminRead = await request(server)
      .get(`/api/users/${userId}`)
      .set(sessionHeader(admin.cookies));
    expect(adminRead.status).toBe(200);
  });
});
