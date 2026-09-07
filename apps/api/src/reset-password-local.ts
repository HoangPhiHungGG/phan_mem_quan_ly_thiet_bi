import { Logger, NotFoundException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { getModelToken } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { AppModule } from "./app.module";
import { AuditService } from "./auth/audit.service";
import { AuthSession } from "./auth/auth.schemas";
import { hashPassword } from "./auth/password";
import { User } from "./identity/identity.schemas";

async function resetPassword(): Promise<void> {
  const logger = new Logger("ResetPasswordLocal");
  const email = process.env.RESET_PASSWORD_EMAIL?.trim().toLowerCase();
  const password = process.env.RESET_PASSWORD_NEW_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Thiếu RESET_PASSWORD_EMAIL hoặc RESET_PASSWORD_NEW_PASSWORD.",
    );
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error("Mật khẩu mới phải dài từ 12 đến 128 ký tự.");
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  try {
    const users = app.get<Model<User>>(getModelToken(User.name));
    const sessions = app.get<Model<AuthSession>>(
      getModelToken(AuthSession.name),
    );
    const audit = app.get(AuditService);
    const user = await users.findOne({ emailNormalized: email }).exec();
    if (!user) throw new NotFoundException("Không tìm thấy tài khoản.");

    await users.updateOne(
      { _id: user._id },
      { $set: { passwordHash: await hashPassword(password) } },
    );
    await sessions.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      {
        $set: {
          revokedAt: new Date(),
          revokeReason: "LOCAL_PASSWORD_RESET",
        },
      },
    );
    await audit.write({
      actorUserId: user._id,
      action: "LOCAL_PASSWORD_RESET",
      entityType: "User",
      entityId: user._id,
      outcome: "SUCCESS",
    });
    logger.log(`Đã đặt lại mật khẩu và thu hồi phiên: ${user.email}`);
  } finally {
    await app.close();
  }
}

void resetPassword().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Lỗi không xác định";
  new Logger("ResetPasswordLocal").error(message);
  process.exitCode = 1;
});
