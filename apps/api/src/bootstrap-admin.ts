import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { IdentityService } from "./identity/identity.service";

async function bootstrapAdmin(): Promise<void> {
  const logger = new Logger("BootstrapAdmin");
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const displayName = process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME;
  const employeeCode = process.env.BOOTSTRAP_ADMIN_EMPLOYEE_CODE;
  if (!email || !password || !displayName || !employeeCode) {
    throw new Error(
      "Thiếu BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, " +
        "BOOTSTRAP_ADMIN_DISPLAY_NAME hoặc BOOTSTRAP_ADMIN_EMPLOYEE_CODE.",
    );
  }
  if (password.length < 12)
    throw new Error("Mật khẩu bootstrap phải có ít nhất 12 ký tự.");

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  try {
    const identity = app.get(IdentityService);
    const createdEmail = await identity.bootstrapAdmin({
      email,
      password,
      displayName,
      employeeCode,
    });
    logger.log(`Đã tạo quản trị viên đầu tiên: ${createdEmail}`);
  } finally {
    await app.close();
  }
}

void bootstrapAdmin().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Lỗi không xác định";
  new Logger("BootstrapAdmin").error(message);
  process.exitCode = 1;
});
