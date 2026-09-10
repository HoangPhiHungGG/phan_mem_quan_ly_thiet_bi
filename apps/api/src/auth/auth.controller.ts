import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { CurrentUser, Public } from "./auth.decorators";
import { CSRF_COOKIE, SESSION_COOKIE } from "./auth.constants";
import { ChangePasswordDto, LoginDto } from "./auth.dto";
import { AuthService } from "./auth.service";
import type { AuthenticatedRequest, CurrentActor } from "./auth.types";

@ApiTags("auth")
@Controller("api/auth")
export class AuthController {
  private readonly production: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.production = config.get<string>("NODE_ENV") === "production";
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Đăng nhập và tạo phiên HttpOnly" })
  @ApiResponse({
    status: 200,
    description: "Đăng nhập thành công, đặt cookie phiên + CSRF.",
  })
  @ApiResponse({ status: 401, description: "Email hoặc mật khẩu không đúng." })
  @ApiResponse({ status: 403, description: "Tài khoản bị khóa/vô hiệu hóa." })
  @ApiResponse({
    status: 429,
    description: "Đăng nhập sai quá số lần cho phép.",
  })
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(
      input.email,
      input.password,
      request.ip,
      request.headers["user-agent"],
    );
    const cookieBase = {
      secure: this.production,
      sameSite: "lax" as const,
      path: "/",
      expires: result.expiresAt,
    };
    response.cookie(SESSION_COOKIE, result.token, {
      ...cookieBase,
      httpOnly: true,
    });
    response.cookie(CSRF_COOKIE, result.csrfToken, {
      ...cookieBase,
      httpOnly: false,
    });
    return { user: this.toPublicActor(result.actor) };
  }

  @Get("me")
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Thông tin tài khoản và quyền hiệu lực" })
  @ApiResponse({
    status: 200,
    description: "Thông tin tài khoản, vai trò và quyền hiện tại.",
  })
  @ApiResponse({
    status: 401,
    description: "Chưa đăng nhập, phiên hết hạn hoặc đã bị thu hồi.",
  })
  me(@CurrentUser() actor: CurrentActor) {
    return { user: this.toPublicActor(actor) };
  }

  @Post("change-password")
  @HttpCode(204)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Đổi mật khẩu của tài khoản hiện tại" })
  async changePassword(
    @Body() input: ChangePasswordDto,
    @CurrentUser() actor: CurrentActor,
  ): Promise<void> {
    await this.auth.changePassword(
      actor,
      input.currentPassword,
      input.newPassword,
    );
  }

  @Post("logout")
  @HttpCode(204)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Đăng xuất và thu hồi phiên hiện tại" })
  @ApiResponse({
    status: 204,
    description: "Đăng xuất thành công, phiên bị thu hồi.",
  })
  @ApiResponse({
    status: 401,
    description: "Chưa đăng nhập hoặc phiên không hợp lệ.",
  })
  async logout(
    @CurrentUser() actor: CurrentActor,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(request.rawSessionToken!, actor, request.ip);
    response.clearCookie(SESSION_COOKIE, { path: "/" });
    response.clearCookie(CSRF_COOKIE, { path: "/" });
  }

  private toPublicActor(actor: CurrentActor) {
    return {
      id: actor.userId.toString(),
      employeeCode: actor.employeeCode,
      email: actor.email,
      displayName: actor.displayName,
      status: actor.status,
      mustChangePassword: actor.mustChangePassword,
      primaryDepartmentId: actor.primaryDepartmentId,
      roleCodes: actor.roleCodes,
      permissions: actor.permissions,
      scopes: actor.scopes,
    };
  }
}
