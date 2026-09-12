import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  DisplayCodeCounter,
  DisplayCodeCounterSchema,
} from "./display-code.schemas";
import { DisplayCodeService } from "./display-code.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DisplayCodeCounter.name, schema: DisplayCodeCounterSchema },
    ]),
  ],
  providers: [DisplayCodeService],
  exports: [DisplayCodeService, MongooseModule],
})
export class DisplayCodeModule {}
