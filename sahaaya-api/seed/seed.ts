import mongoose from "mongoose";
import { env } from "../src/lib/env";
import { Board } from "../src/models/Board";
import { Phrase } from "../src/models/Phrase";
import boardsData from "./boards.json";
import phrasesData from "./phrases.json";

async function seed(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);

  await Board.deleteMany({});
  await Phrase.deleteMany({});

  await Board.insertMany(
    boardsData.boards.map((board) => ({
      _id: board.id,
      title: board.title,
      context: board.context,
      phraseIds: board.phraseIds,
    }))
  );

  await Phrase.insertMany(
    phrasesData.phrases.map((phrase) => ({
      _id: phrase.id,
      category: phrase.category,
      english: phrase.english,
      sinhala: phrase.sinhala,
      tamil: phrase.tamil,
      symbolAsset: phrase.symbolAsset,
      riskClass: phrase.riskClass,
      canNotify: phrase.canNotify,
      requiresConfirmation: phrase.requiresConfirmation,
      version: phrase.version,
    }))
  );

  // eslint-disable-next-line no-console
  console.log(`Seeded ${boardsData.boards.length} board(s) and ${phrasesData.phrases.length} phrase(s).`);

  await mongoose.disconnect();
}

seed().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Seed failed:", error);
  process.exit(1);
});
