import { Schema, model, Types } from "mongoose";

export type AuditOutcome = "success" | "denied" | "error";

export interface AuditEventDoc {
  _id: Types.ObjectId;
  route: string;
  actorId?: Types.ObjectId;
  requestId?: string;
  outcome: AuditOutcome;
  createdAt: Date;
  updatedAt: Date;
}

const AuditEventSchema = new Schema<AuditEventDoc>(
  {
    route: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    requestId: String,
    outcome: { type: String, enum: ["success", "denied", "error"], required: true },
  },
  { timestamps: true }
);

export const AuditEvent = model<AuditEventDoc>("AuditEvent", AuditEventSchema);
