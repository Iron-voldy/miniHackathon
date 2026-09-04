import { Schema, model, Types } from "mongoose";

export type CaregiverLinkStatus = "pending" | "active";

export interface CaregiverLinkDoc {
  _id: Types.ObjectId;
  communicatorId: Types.ObjectId;
  caregiverId?: Types.ObjectId;
  pairingCode?: string;
  status: CaregiverLinkStatus;
  createdAt: Date;
  updatedAt: Date;
}

const CaregiverLinkSchema = new Schema<CaregiverLinkDoc>(
  {
    communicatorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    caregiverId: { type: Schema.Types.ObjectId, ref: "User" },
    pairingCode: { type: String, unique: true, sparse: true },
    status: { type: String, enum: ["pending", "active"], default: "pending" },
  },
  { timestamps: true }
);

export const CaregiverLink = model<CaregiverLinkDoc>("CaregiverLink", CaregiverLinkSchema);
