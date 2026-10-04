import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["server/**/*.test.ts", "web/**/*.test.ts", "apps/mobile/src/lib/**/*.test.ts", "apps/mobile/src/i18n/**/*.test.ts", "scripts/**/*.test.ts"], testTimeout: 20000 } });
