import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type TransactionTestItemDocument = HydratedDocument<TransactionTestItem>;

@Schema({ collection: "_transaction_tests", timestamps: true })
export class TransactionTestItem {
  @Prop({ required: true, unique: true })
  code!: string;

  @Prop({ required: true })
  value!: number;
}

export const TransactionTestItemSchema =
  SchemaFactory.createForClass(TransactionTestItem);
