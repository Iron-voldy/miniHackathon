import { Schema, model, Types } from "mongoose";

export type InputMode = "touch" | "row_column_scan" | "blink_scan" | "hum_scan";
export type RequestStatus =
  | "pending"
  | "delivered"
  | "seen"
  | "coming"
  | "completed"
  | "cancelled"
  | "failed";
export type DeliveryStatus = "pending" | "delivered" | "failed";

export interface DeliveryDoc {
  caregiverId: Types.ObjectId;
  status: DeliveryStatus;
  deliveredAt?: Date;
}

export interface AcknowledgementDoc {
  caregiverId: Types.ObjectId;
  responderName: string;
  respondedAt: Date;
}

export interface CommunicationRequestDoc {
  _id: Types.ObjectId;
  communicatorId: Types.ObjectId;
  phraseId: string;
  resolvedText: string;
  inputMode: InputMode;
  clientRequestId: string;
  status: RequestStatus;
  deliveries: DeliveryDoc[];
  acknowledgement?: AcknowledgementDoc;
  createdAt: Date;
  updatedAt: Date;
}

const DeliverySchema = new Schema<DeliveryDoc>(
  {
    caregiverId: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["pending", "delivered", "failed"], default: "pending" },
    deliveredAt: Date,
  },
  { _id: false }
);

const AcknowledgementSchema = new Schema<AcknowledgementDoc>(
  {
    caregiverId: { type: Schema.Types.ObjectId, ref: "User" },
    responderName: String,
    respondedAt: Date,
  },
  { _id: false }
);

const CommunicationRequestSchema = new Schema<CommunicationRequestDoc>(
  {
    communicatorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    phraseId: { type: String, required: true },
    resolvedText: { type: String, required: true },
    inputMode: {
      type: String,
      enum: ["touch", "row_column_scan", "blink_scan", "hum_scan"],
      required: true,
    },
    clientRequestId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "delivered", "seen", "coming", "completed", "cancelled", "failed"],
      default: "pending",
    },
    deliveries: [DeliverySchema],
    acknowledgement: AcknowledgementSchema,
  },
  { timestamps: true }
);

export const CommunicationRequest = model<CommunicationRequestDoc>(
  "CommunicationRequest",
  CommunicationRequestSchema
);
