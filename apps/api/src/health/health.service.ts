import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection, ConnectionStates } from "mongoose";

@Injectable()
export class HealthService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  check() {
    return {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  ready() {
    const dbState = this.connection.readyState;
    // 1 = connected
    const dbReady = dbState === ConnectionStates.connected;

    if (!dbReady) {
      throw new ServiceUnavailableException({
        status: "error",
        database: {
          status: "disconnected",
          state: dbState,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: "ok",
      database: {
        status: "connected",
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
