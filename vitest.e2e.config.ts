import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
