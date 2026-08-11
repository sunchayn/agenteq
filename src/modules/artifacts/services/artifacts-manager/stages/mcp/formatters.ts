import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { McpServer } from "@agents/entities/mcp-server.js";
import type { McpServerMapper } from "@agents/types/mcp-server-mapper.js";
import { ConfigFileFormat } from "@artifacts/enums/config-file-format.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";

/**
 * Merges an entry into a JSON file.
 */
export const jsonFormatter: McpFormatter = {
    format: ConfigFileFormat.Json,
    apply: applyJson,
};

/**
 * Merges an entry into a TOML file.
 */
export const tomlFormatter: McpFormatter = {
    format: ConfigFileFormat.Toml,
    apply: applyToml,
};

/**
 * Merges an entry into a YAML file.
 */
export const yamlFormatter: McpFormatter = {
    format: ConfigFileFormat.Yaml,
    apply: applyYaml,
};

/*
 * Interface & Types.
 */

export interface McpFormatter {
    readonly format: ConfigFileFormat;
    apply(options: ApplyFormatOptions): FormatInstallResult;
}

export interface FormatInstallResult {
    status: SyncStatus.Skipped | SyncStatus.Written;
    text: string;
}

interface ApplyFormatOptions {
    text: string;
    keyPath: string[];
    config: McpServer;
    mapper: McpServerMapper;
}

/*
 * Internal.
 */

function applyJson(options: ApplyFormatOptions): FormatInstallResult {
    return mergeIntoText(options, JSON.parse, toJsonText);
}

function applyToml(options: ApplyFormatOptions): FormatInstallResult {
    return mergeIntoText(options, parseToml, stringifyToml);
}

function applyYaml(options: ApplyFormatOptions): FormatInstallResult {
    return mergeIntoText(options, parseYaml, stringifyYaml);
}

function toJsonText(doc: Record<string, unknown>): string {
    return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * Parses a config file's text, merges the mapped entry into it, then stringifies the result back to text.
 */
function mergeIntoText(
    options: ApplyFormatOptions,
    parse: (text: string) => unknown,
    stringify: (doc: Record<string, unknown>) => string,
): FormatInstallResult {
    const { config, keyPath, mapper, text } = options;

    const parsed = text ? parse(text) : {};
    const doc = (parsed as Record<string, unknown> | null) ?? {};
    const status = mergeServerEntry(doc, keyPath, config, mapper);

    if (status === SyncStatus.Skipped) {
        return { status: SyncStatus.Skipped, text: text };
    }

    return { status: SyncStatus.Written, text: stringify(doc) };
}

/**
 * Merges one server's mapped entry into a parsed config document at the given key path,
 * creating intermediate objects as needed, unless an entry already exists there.
 */
function mergeServerEntry(
    doc: Record<string, unknown>,
    keyPath: string[],
    config: McpServer,
    mapper: McpServerMapper,
): SyncStatus.Skipped | SyncStatus.Written {
    let target = doc;

    for (const key of keyPath) {
        const existing = target[key];

        if (
            existing !== undefined &&
            (existing === null || typeof existing !== "object")
        ) {
            return SyncStatus.Skipped;
        }

        const next = (existing as Record<string, unknown> | undefined) ?? {};

        target[key] = next;
        target = next;
    }

    // A value already present at this key is left untouched,
    // so a user's own manual edit to this entry is never overwritten by a later sync.
    if (target[config.key] !== undefined) {
        return SyncStatus.Skipped;
    }

    target[config.key] = mapper(config);

    return SyncStatus.Written;
}
