import {
    confirm,
    groupMultiselect,
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
    groupMultiselect: showGroupMultiselect,
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

interface GroupMultiselectParams {
    message: string;
    options: Record<string, { value: string; label: string }[]>;
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
    // clack seeds its selection straight from initialValues with no check against the options given.
    // A stale value not currently offered must be dropped here before it ever reaches clack.
    const offeredValues = new Set(params.options.map((option) => option.value));

    return multiselect({
        ...params,
        initialValues: params.initialValues.filter((value) =>
            offeredValues.has(value),
        ),
    });
}

async function showGroupMultiselect(
    params: GroupMultiselectParams,
): Promise<string[] | symbol> {
    // clack seeds its selection straight from initialValues with no check against the options given.
    // A stale value not currently offered must be dropped here before it ever reaches clack.
    const offeredValues = new Set(
        Object.values(params.options)
            .flat()
            .map((option) => option.value),
    );

    return groupMultiselect({
        ...params,
        initialValues: params.initialValues.filter((value) =>
            offeredValues.has(value),
        ),
    });
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
