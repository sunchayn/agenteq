import { z } from "zod";

// Internal building blocks for mcpSchema,
// defined first since a const initializer can't reference another const declared later in the same module.
const base = z.object({
    $schema: z.string().optional(),
    key: z.string(),
});

export const stdioConfig = z.looseObject({
    args: z.array(z.string()).optional(),
    command: z.string(),
    cwd: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
});

// The .looseObject keeps command, url, and similar fields typed for editors while still accepting unknown agent
// or vendor-specific fields, such as a future timeout option.
// Unknown fields flow through to McpEntry.extra.
export const remoteConfig = z.looseObject({
    headers: z.record(z.string(), z.string()).optional(),
    url: z.url(),
});

/**
 * Validates one .ai/mcp/<name>/config.json file's raw JSON shape before reshaping into McpEntry.
 */
export const mcpSchema = z.discriminatedUnion("type", [
    base.extend({
        config: stdioConfig,
        type: z.literal("stdio"),
    }),
    base.extend({
        config: remoteConfig,
        type: z.literal("http"),
    }),
    base.extend({
        config: remoteConfig,
        type: z.literal("sse"),
    }),
]);
