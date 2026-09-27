import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
        },
      },
      {
        // Richiedono Supabase locale avviato: npm run test:int
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          setupFiles: ["./test/setup-integration.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
