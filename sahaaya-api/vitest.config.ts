import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
  },
});
