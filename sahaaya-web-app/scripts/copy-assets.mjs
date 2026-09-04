// Copies the MediaPipe WASM runtime from node_modules into public/ so
// Face Mode can load it locally (same approach as the reference project).
import { cp, mkdir, rm, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const wasmSrc = path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const wasmDest = path.join(root, "public", "mediapipe", "wasm");

async function main() {
  try {
    await access(wasmSrc);
  } catch {
    console.warn(`Skipping WASM copy — not found at ${wasmSrc} (run npm install first)`);
    return;
  }
  await rm(wasmDest, { recursive: true, force: true });
  await mkdir(path.dirname(wasmDest), { recursive: true });
  await cp(wasmSrc, wasmDest, { recursive: true });
  console.log(`Copied MediaPipe WASM: ${wasmSrc} -> ${wasmDest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
