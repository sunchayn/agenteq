import { z } from "zod";
import filesystem from "@infrastructure/filesystem.js";
import output from "@infrastructure/terminal/output.js";
import { mcpSchema } from "@artifacts/schemas/mcp-schema.js";

type JsonSchema = Record<string, unknown>;

const raw = z.toJSONSchema(mcpSchema) as JsonSchema;

const schema = toDiscriminatedSchema(raw, "type");

await filesystem.mkdir("dist/schema");

await filesystem.writeFile({
    content: `${JSON.stringify(schema, null, 2)}\n`,
    path: "dist/schema/mcp-config.schema.json",
});

output.info("Generated dist/schema/mcp-config.schema.json");

/*
 * Internal.
 */

/**
 * Converts a Zod discriminated union's oneOf output into allOf of if/then branches per type,
 * To avoid some editors validating the discriminated union poorly across every branch.
 */
function toDiscriminatedSchema(
    schema: JsonSchema,
    discriminator: string,
): JsonSchema {
    const branches = schema.oneOf as JsonSchema[] | undefined;

    if (!branches) {
        return schema;
    }

    const values = branches.map((branch) => {
        const props = branch.properties as JsonSchema;

        return (props[discriminator] as JsonSchema).const as string;
    });

    const rest = { ...schema };

    delete rest.oneOf;

    return {
        ...rest,
        allOf: branches.map((branch, i) => ({
            if: { properties: { [discriminator]: { const: values[i] } } },
            then: branch,
        })),
        properties: { [discriminator]: { enum: values, type: "string" } },
        required: [discriminator],
        type: "object",
    };
}
