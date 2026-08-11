import { defineConfig } from "tsup";

export default defineConfig({
    banner: {
        js: "#!/usr/bin/env node",
    },
    clean: true,
    entry: ["src/cli.ts"],
    format: ["esm"],
    target: "node20",
});
