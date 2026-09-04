import { Schema, model } from "mongoose";

export type RiskClass = "normal" | "sensitive";

export interface PhraseDoc {
  _id: string;
  category: string;
  english: string;
  sinhala: string;
  tamil: string;
  symbolAsset: string;
  riskClass: RiskClass;
  canNotify: boolean;
  requiresConfirmation: boolean;
  version: number;
}

const PhraseSchema = new Schema<PhraseDoc>({
  _id: { type: String, required: true },
  category: { type: String, required: true },
  english: { type: String, required: true },
  sinhala: { type: String, required: true },
  tamil: { type: String, required: true },
  symbolAsset: { type: String, required: true },
  riskClass: { type: String, enum: ["normal", "sensitive"], default: "normal" },
  canNotify: { type: Boolean, default: true },
  requiresConfirmation: { type: Boolean, default: true },
  version: { type: Number, default: 1 },
});

export const Phrase = model<PhraseDoc>("Phrase", PhraseSchema);
