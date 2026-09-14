import {
    confirm,
    isCancel,
    isCI,
    isTTY,
    multiselect,
    text,
} from "@clack/prompts";

/**
 * A standardized service to deal with terminal's input.
 */
export default {
    confirm: showConfirm,
    isCancel: isCancelled,
    isInteractive: isInteractive,
    multiselect: showMultiselect,
    text: showText,
};

/*
 * Interface & Types.
 */

interface MultiselectParams {
    message: string;
    options: { value: string; label: string }[];
    initialValues: string[];
}

interface TextParams {
    message: string;
    /**
     * Shown greyed out in the prompt. Also used as the answer if the user submits empty input.
     */
    placeholder?: string;
    defaultValue?: string;
}

interface ConfirmParams {
    message: string;
    initialValue?: boolean;
}

/*
 * Internal.
 */

async function showMultiselect(
    params: MultiselectParams,
): Promise<string[] | symbol> {
    return multiselect(params);
}

async function showText(params: TextParams): Promise<string | symbol> {
    return text(params);
}

async function showConfirm(params: ConfirmParams): Promise<boolean | symbol> {
    return confirm(params);
}

function isCancelled(value: unknown): value is symbol {
    return isCancel(value);
}

function isInteractive(): boolean {
    return isTTY(process.stdout) && !isCI();
}
