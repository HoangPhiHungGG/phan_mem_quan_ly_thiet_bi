import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { DisplayCodeCounter } from "./display-code.schemas";

export function displayCodePrefix(name: string): string {
  const normalized = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "D")
    .toUpperCase();
  // A letter is eligible at the start or after a non-alphanumeric separator.
  // This skips the embedded letters in values such as "500GB".
  return normalized.match(/(?:^|[^A-Z0-9])([A-Z])/)?.[1] ?? "X";
}

export function formatDisplayCode(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

@Injectable()
export class DisplayCodeService {
  constructor(
    @InjectModel(DisplayCodeCounter.name)
    private readonly counters: Model<DisplayCodeCounter>,
  ) {}

  async nextCode(
    entity: string,
    name: string,
    isTaken: (code: string) => Promise<boolean>,
  ): Promise<string> {
    const prefix = displayCodePrefix(name);
    const key = `${entity.trim().toUpperCase()}:${prefix}`;
    // Existing manually assigned short codes may already occupy early values.
    // Counter increments remain atomic; occupied values are simply skipped.
    for (let attempt = 0; attempt < 100_000; attempt += 1) {
      const counter = await this.counters.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      const code = formatDisplayCode(prefix, counter.seq);
      if (!(await isTaken(code))) return code;
    }
    throw new Error(`DISPLAY_CODE_SEQUENCE_EXHAUSTED:${key}`);
  }
}
