import { Schema, model, Types } from "mongoose";

export type Role = "communicator" | "caregiver";
export type Language = "en" | "si" | "ta";
export type BoardContext = "home" | "ward" | "general";

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  phone: string;
  role: Role;
  preferences: {
    language: Language;
    boardContext: BoardContext;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, unique: true },
    role: { type: String, enum: ["communicator", "caregiver"], required: true },
    preferences: {
      language: { type: String, enum: ["en", "si", "ta"], default: "en" },
      boardContext: { type: String, enum: ["home", "ward", "general"], default: "home" },
    },
  },
  { timestamps: true }
);

export const User = model<UserDoc>("User", UserSchema);
