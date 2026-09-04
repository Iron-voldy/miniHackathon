import { Schema, model, Types } from "mongoose";

export type Language = "en" | "si" | "ta";

export interface CustomPhraseDoc {
  _id: Types.ObjectId;
  ownerUserId: Types.ObjectId;
  text: string;
  language: Language;
  approvedByCommunicator: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CustomPhraseSchema = new Schema<CustomPhraseDoc>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, required: true, maxlength: 200 },
    language: { type: String, enum: ["en", "si", "ta"], required: true },
    approvedByCommunicator: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const CustomPhrase = model<CustomPhraseDoc>("CustomPhrase", CustomPhraseSchema);
