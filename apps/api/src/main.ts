import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger("Bootstrap");

  // CORS - chỉ cho phép origin được cấu hình
  const corsOrigins = (
    config.get<string>("CORS_ORIGINS") ?? "http://localhost:3000"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });

  // Validation toàn cục
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle("PMQLTB - Quản lý thiết bị điện tử và linh kiện")
    .setDescription(
      "API cho hệ thống quản lý thiết bị điện tử và linh kiện - Phòng IT",
    )
    .setVersion("0.1.0")
    .addCookieAuth("pmqltb_session", {
      type: "apiKey",
      in: "cookie",
    })
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = config.get<number>("PORT") ?? 3001;
  await app.listen(port);
  logger.log(`API đang chạy tại http://localhost:${port}`);
  logger.log(`Swagger tại http://localhost:${port}/api/docs`);
}

void bootstrap();
