import output from "@infrastructure/terminal/output.js";

/**
 * Render a JSON payload with 2-space indentation and trailing newline.
 */
export function renderAsJson(payload: unknown): string {
    return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * Prints a message as plain text, or as a uniformly-shaped JSON payload when `isJson` is true.
 */
export function printMessage(options: PrintMessageOptions): void {
    const { isJson, level, message } = options;

    if (isJson) {
        output.writeRaw(renderAsJson({ level: level, message: message }));

        return;
    }

    output[level](message);
}

/*
 * Interface & Types.
 */

type OutputLevel = "error" | "warn" | "info";

interface PrintMessageOptions {
    isJson: boolean;
    level: OutputLevel;
    message: string;
}

/**
 * The shape a Command renders as either a table.
 */
export interface TableData {
    headers: string[];
    rows: string[][];
}

/**
 * The CLI flags shared by the sync and init commands, as commander parses them.
 */
export interface RawSyncOptions {
    only?: string;
    agents?: string;
    yes?: boolean;
    json?: boolean;
    sourceDir?: string;
}
