import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../src/lib/db";

export async function setupTestDB(): Promise<void> {
  await connectDB();
}

export async function resetTestDB(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

export async function teardownTestDB(): Promise<void> {
  await disconnectDB();
}
