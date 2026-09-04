import { Schema, model, Types } from "mongoose";

export type Role = "communicator" | "caregiver";
export type Language = "en" | "si" | "ta";
export type BoardContext = "home" | "ward" | "general";

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  // Only set for a patient created via the old passwordless demo-login; a
  // patient created by their caregiver (routes/caregivers.ts createPatient)
  // never gets one, since they log in with accessCodeHash instead - a
  // non-speaking user shouldn't have to type their own name/phone.
  phone?: string;
  role: Role;
  // Required for caregivers so a new request can also be emailed to them, not
  // just pushed to their dashboard; optional for communicators.
  email?: string;
  // Caregivers authenticate with a real password (see routes/auth.ts signup/login).
  passwordHash?: string;
  // Patient (communicator) access code: a caregiver-generated code the patient's
  // device logs in with directly - no typing a name or phone number. Stored as a
  // SHA-256 hash (see lib/accessCode.ts) so the lookup is O(1) on the unique
  // index; the code itself carries enough entropy that this doesn't need a
  // per-record salt the way a human-chosen password would.
  accessCodeHash?: string;
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
    phone: { type: String, unique: true, sparse: true },
    role: { type: String, enum: ["communicator", "caregiver"], required: true },
    email: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, select: false },
    accessCodeHash: { type: String, unique: true, sparse: true, select: false },
    preferences: {
      language: { type: String, enum: ["en", "si", "ta"], default: "en" },
      boardContext: { type: String, enum: ["home", "ward", "general"], default: "home" },
    },
  },
  { timestamps: true }
);

export const User = model<UserDoc>("User", UserSchema);
