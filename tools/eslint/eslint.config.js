import { fileURLToPath } from "node:url";
import jsdoc from "eslint-plugin-jsdoc";
import perfectionist from "eslint-plugin-perfectionist";
import tseslint from "typescript-eslint";
import requireOptionsDestructureInBody from "./rules/require-options-destructure-in-body.js";
import noNestedDestructuring from "./rules/no-nested-destructuring.js";

const tsconfigRootDir = fileURLToPath(new URL("../..", import.meta.url));

export default tseslint.config(
    {
        ignores: [
            "dist/**",
            "schema/**",
            ".ai/**",
            ".sandbox/**",
            "coverage/**",
            "tools/eslint/eslint.config.js",
            "tools/eslint/rules/**",
        ],
    },
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                project: "./tsconfig.json",
                tsconfigRootDir,
            },
        },
        plugins: {
            jsdoc,
            local: {
                rules: {
                    "no-nested-destructuring": noNestedDestructuring,
                    "require-options-destructure-in-body":
                        requireOptionsDestructureInBody,
                },
            },
            perfectionist,
        },
        rules: {
            "jsdoc/multiline-blocks": ["error", { noSingleLineBlocks: true }],
            // A single object parameter is named `options`, destructured in the body, never in the signature.
            // This (and bellow rule) are enforced to provide a more readable definitions.
            "local/require-options-destructure-in-body": "error",
            // A nested object gets its own destructuring line, never nested inside another pattern's braces.
            "local/no-nested-destructuring": "error",
            // Every property spells out its key and value explicitly for consistency and to enable usage-lookups in IDEs.
            "object-shorthand": ["error", "never"],
            // The default rule is stricter than this codebase needs.
            "@typescript-eslint/restrict-template-expressions": [
                "error",
                { allowNumber: true, allowBoolean: true, allowNullish: true },
            ],
            // One consistent shape for every conditional/loop body, always braced.
            curly: ["error", "all"],
            // A blank line separates a block-like statement (if/for/while/try/switch)
            // from the statements around it, so nesting is visually obvious.
            "padding-line-between-statements": [
                "error",
                {
                    blankLine: "always",
                    prev: "*",
                    next: ["if", "for", "while", "try", "switch"],
                },
                {
                    blankLine: "always",
                    prev: ["if", "for", "while", "try", "switch"],
                    next: "*",
                },
                { blankLine: "always", prev: "*", next: "return" },
                // A multiline call reads like a small block, so its end gets a blank line too.
                {
                    blankLine: "always",
                    prev: "multiline-expression",
                    next: "*",
                },
                // Declarations stay grouped, but a blank line marks the end of the run.
                { blankLine: "always", prev: ["const", "let"], next: "*" },
                {
                    blankLine: "any",
                    prev: ["const", "let"],
                    next: ["const", "let"],
                },
                // A multiline declaration reads like a small block too, so a blank line follows it as well.
                {
                    blankLine: "always",
                    prev: ["multiline-const", "multiline-let"],
                    next: "*",
                },
                // The same blank line goes in front of a multiline declaration, not just after it.
                {
                    blankLine: "always",
                    prev: "*",
                    next: ["multiline-const", "multiline-let"],
                },
            ],
        },
    },
    {
        files: ["tests/**/*.ts"],
        rules: {
            // Test mocks (vi.fn/vi.spyOn) are loosely typed by design; the safety
            // these rules buy in application code isn't worth the noise in tests.
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-confusing-void-expression": "off",
            "@typescript-eslint/no-dynamic-delete": "off",
            "@typescript-eslint/require-await": "off",
        },
    },
);
