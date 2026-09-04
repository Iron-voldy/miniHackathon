import { Schema, model, Types } from "mongoose";

export type Role = "communicator" | "caregiver";
export type Language = "en" | "si" | "ta";
export type BoardContext = "home" | "ward" | "general";

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  phone: string;
  role: Role;
  // Required for caregivers so a new request can also be emailed to them, not
  // just pushed to their dashboard; optional for communicators.
  email?: string;
  // Caregivers authenticate with a real password (see routes/auth.ts signup/login);
  // communicators keep the passwordless demo-login, so this stays optional and is
  // never returned by default queries.
  passwordHash?: string;
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
    email: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, select: false },
    preferences: {
      language: { type: String, enum: ["en", "si", "ta"], default: "en" },
      boardContext: { type: String, enum: ["home", "ward", "general"], default: "home" },
    },
  },
  { timestamps: true }
);

export const User = model<UserDoc>("User", UserSchema);
