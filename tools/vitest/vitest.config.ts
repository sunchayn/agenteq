import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
    plugins: [tsconfigPaths()],
    root: rootDir,
    test: {
        coverage: {
            exclude: ["src/modules/agents/definitions/**", "src/cli.ts"],
            include: ["src/**/*.ts"],
            provider: "v8",
            reporter: ["text", "lcov", "html"],
            thresholds: {
                branches: 75,
                functions: 80,
                lines: 80,
                statements: 80,
            },
        },
        include: [path.resolve(rootDir, "tests/**/*.test.ts")],
        // picocolors treats any CI environment as color-capable,
        // so without this, tests asserting plain-text output break under CI.
        env: { NO_COLOR: "1" },
    },
});
