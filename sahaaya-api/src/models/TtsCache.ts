import { Schema, model } from "mongoose";

export type Language = "en" | "si" | "ta";

export interface TtsCacheDoc {
  _id: string; // textHash:language
  textHash: string;
  language: Language;
  voice: string;
  audioBase64: string;
  createdAt: Date;
}

const TtsCacheSchema = new Schema<TtsCacheDoc>({
  _id: { type: String, required: true },
  textHash: { type: String, required: true, index: true },
  language: { type: String, enum: ["en", "si", "ta"], required: true },
  voice: { type: String, required: true },
  audioBase64: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const TtsCache = model<TtsCacheDoc>("TtsCache", TtsCacheSchema);
