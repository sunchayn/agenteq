import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { McpServer } from "@agents/entities/mcp-server.js";
import type { McpServerMapper } from "@agents/types/mcp-server-mapper.js";
import { ConfigFileFormat } from "@artifacts/enums/config-file-format.js";
import { SyncStatus } from "@artifacts/enums/sync-status.js";

/**
 * Reconciles a JSON file's servers map against the servers given.
 */
export const jsonFormatter: McpFormatter = {
    format: ConfigFileFormat.Json,
    reconcile: (options) => reconcileText(options, JSON.parse, toJsonText),
};

/**
 * Reconciles a TOML file's servers map against the servers given.
 */
export const tomlFormatter: McpFormatter = {
    format: ConfigFileFormat.Toml,
    reconcile: (options) => reconcileText(options, parseToml, stringifyToml),
};

/**
 * Reconciles a YAML file's servers map against the servers given.
 */
export const yamlFormatter: McpFormatter = {
    format: ConfigFileFormat.Yaml,
    reconcile: (options) => reconcileText(options, parseYaml, stringifyYaml),
};

/*
 * Interface & Types.
 */

export interface McpFormatter {
    readonly format: ConfigFileFormat;
    reconcile(options: ReconcileFormatOptions): FormatReconcileResult;
}

export interface ReconcileFormatOptions {
    text: string;
    keyPath: string[];
    servers: McpServer[];
    mapper: McpServerMapper;
}

export interface FormatReconcileResult {
    text: string;
    /**
     * One status per key in the servers map that was just written or just removed.
     * Written for a server given this run, whether or not its entry actually changed.
     * Removed for a key that was there, but is no longer among the servers given.
     */
    statusesByKey: Map<string, SyncStatus>;
}

/*
 * Internal.
 */

function toJsonText(doc: Record<string, unknown>): string {
    return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * Reconciles the object at a config file's key path against the servers given.
 * Every key at that path not among those servers is dropped, agenteq owns that whole map.
 * Sibling keys outside the key path, such as an agent's other settings, are left untouched.
 */
function reconcileText(
    options: ReconcileFormatOptions,
    parse: (text: string) => unknown,
    stringify: (doc: Record<string, unknown>) => string,
): FormatReconcileResult {
    const { keyPath, mapper, servers, text } = options;

    const parsed = text ? parse(text) : {};
    const doc = (parsed as Record<string, unknown> | null) ?? {};

    let target = doc;

    for (const key of keyPath) {
        const existing = target[key];

        if (
            existing !== undefined &&
            (existing === null || typeof existing !== "object")
        ) {
            // The path is blocked by a scalar value, nothing here is safe to touch,
            // so the file is left exactly as-is.
            return { statusesByKey: new Map(), text: text };
        }

        const next = (existing as Record<string, unknown> | undefined) ?? {};

        target[key] = next;
        target = next;
    }

    const desiredByKey = new Map(
        servers.map((server) => [server.key, mapper(server)] as const),
    );

    const statusesByKey = new Map<string, SyncStatus>();

    for (const key of Object.keys(target)) {
        if (desiredByKey.has(key)) {
            continue;
        }

        Reflect.deleteProperty(target, key);
        statusesByKey.set(key, SyncStatus.Removed);
    }

    for (const [key, mapped] of desiredByKey) {
        if (JSON.stringify(target[key]) !== JSON.stringify(mapped)) {
            target[key] = mapped;
        }

        // Reported as written whether or not this run changed it, the server is synced either way.
        statusesByKey.set(key, SyncStatus.Written);
    }

    return { statusesByKey: statusesByKey, text: stringify(doc) };
}
