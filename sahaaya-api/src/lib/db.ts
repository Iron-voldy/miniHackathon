import mongoose from "mongoose";
import { env } from "./env";

let connecting: Promise<typeof mongoose> | null = null;

export function connectDB(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose);
  }
  if (!connecting) {
    connecting = mongoose.connect(env.MONGODB_URI);
  }
  return connecting;
}

export function isDBReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  connecting = null;
}
