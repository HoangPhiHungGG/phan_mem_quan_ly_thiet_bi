import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { HealthModule } from "./health/health.module";
import { TransactionTestModule } from "./transaction-test/transaction-test.module";
import { AuthModule } from "./auth/auth.module";
import { IdentityModule } from "./identity/identity.module";
import { CatalogModule } from "./catalog/catalog.module";
import { EquipmentModule } from "./equipment/equipment.module";
import { InventoryModule } from "./inventory/inventory.module";
import { ReceiptModule } from "./receipts/receipt.module";
import { OperationModule } from "./operations/operation.module";
import { PurchaseModule } from "./purchases/purchase.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri:
          config.get<string>("MONGODB_URI") ??
          "mongodb://127.0.0.1:27017/pmqltb?replicaSet=rs0&directConnection=true",
      }),
    }),
    HealthModule,
    AuthModule,
    IdentityModule,
    CatalogModule,
    EquipmentModule,
    InventoryModule,
    ReceiptModule,
    OperationModule,
    PurchaseModule,
    TransactionTestModule,
  ],
})
export class AppModule {}
