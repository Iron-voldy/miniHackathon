import { Schema, model } from "mongoose";

export type BoardContext = "home" | "ward" | "general";

export interface BoardDoc {
  _id: string;
  title: string;
  context: BoardContext;
  phraseIds: string[];
}

const BoardSchema = new Schema<BoardDoc>({
  _id: { type: String, required: true },
  title: { type: String, required: true },
  context: { type: String, enum: ["home", "ward", "general"], required: true },
  phraseIds: [{ type: String, required: true }],
});

export const Board = model<BoardDoc>("Board", BoardSchema);
