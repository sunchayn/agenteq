import { intro, log, outro } from "@clack/prompts";
import pc from "picocolors";

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

/**
 * A standardized service to deal with terminal's output.
 */
export default {
    error: error,
    info: info,
    intro: printIntro,
    outro: printOutro,
    table: table,
    warn: warn,
    writeRaw: writeRaw,
};

/*
 * Internal.
 */

function printIntro(label: string): void {
    intro(label);
}

function printOutro(label: string): void {
    outro(label);
}

/**
 * Writes raw text straight to stdout, with no box-drawing decoration.
 */
function writeRaw(text: string): void {
    process.stdout.write(text);
}

function info(text: string): void {
    log.info(text);
}

function warn(text: string): void {
    log.warn(text);
}

function table(headers: string[], rows: string[][]): void {
    const styledHeaders = headers.map((header) => pc.bold(header));

    log.message(renderTable(styledHeaders, rows));
}

function error(text: string): void {
    log.error(text);
}

/**
 * Column-aligns a table's headers and rows. Cells may contain ANSI color codes,
 * width is measured on the visible text so colored cells still line up with plain ones.
 */
function renderTable(headers: string[], rows: string[][]): string {
    const widths = headers.map((header, i) =>
        Math.max(
            visibleLength(header),
            ...rows.map((row) => visibleLength(row[i] ?? "")),
        ),
    );

    const renderRow = (cells: string[]): string =>
        cells.map((cell, i) => padCell(cell, widths[i])).join("  ");

    return [
        renderRow(headers),
        renderRow(widths.map((width) => "-".repeat(width))),
        ...rows.map(renderRow),
    ].join("\n");
}

function visibleLength(text: string): number {
    return text.replace(ANSI_PATTERN, "").length;
}

function padCell(text: string, width: number): string {
    const padding = " ".repeat(Math.max(0, width - visibleLength(text)));

    return `${text}${padding}`;
}
