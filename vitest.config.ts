import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ["dotenv/config"],
    include: ["test/**/*.test.ts"],
    pool: "forks"
  },
});
