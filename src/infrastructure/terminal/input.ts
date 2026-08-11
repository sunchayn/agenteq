import { isCancel, isCI, isTTY, multiselect } from "@clack/prompts";

/**
 * A standardized service to deal with terminal's input.
 */
export default {
    isCancel: isCancelled,
    isInteractive: isInteractive,
    multiselect: showMultiselect,
};

/*
 * Interface & Types.
 */

interface MultiselectParams {
    message: string;
    options: { value: string; label: string }[];
    initialValues: string[];
}

/*
 * Internal.
 */

async function showMultiselect(
    params: MultiselectParams,
): Promise<string[] | symbol> {
    return multiselect(params);
}

function isCancelled(value: string[] | symbol): value is symbol {
    return isCancel(value);
}

function isInteractive(): boolean {
    return isTTY(process.stdout) && !isCI();
}
