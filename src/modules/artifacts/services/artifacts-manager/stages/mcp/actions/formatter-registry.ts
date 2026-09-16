import { ConfigFileFormat } from "@artifacts/enums/config-file-format.js";
import { jsonFormatter, tomlFormatter, yamlFormatter } from "../formatters.js";
import type { McpFormatter } from "../formatters.js";

/**
 * The formatter to parse, reconcile, and stringify a config file, picked by its format.
 */
export const formattersByFormat: Record<ConfigFileFormat, McpFormatter> = {
    [ConfigFileFormat.Json]: jsonFormatter,
    [ConfigFileFormat.Toml]: tomlFormatter,
    [ConfigFileFormat.Yaml]: yamlFormatter,
};
