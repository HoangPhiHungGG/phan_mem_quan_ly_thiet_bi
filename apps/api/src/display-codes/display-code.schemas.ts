import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ collection: "display_code_counters", timestamps: true })
export class DisplayCodeCounter {
  @Prop({ required: true })
  _id!: string;

  @Prop({ required: true, min: 0, default: 0 })
  seq!: number;
}

export const DisplayCodeCounterSchema =
  SchemaFactory.createForClass(DisplayCodeCounter);
