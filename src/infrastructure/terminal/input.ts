import { GroupMultiSelectPrompt } from "@clack/core";
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
    /**
     * Values that, once selected, also select every other item in their own group.
     * Deselecting one of them deselects that group's other items too.
     */
    reactiveMarkers?: string[];
}

type ReactiveGroupMultiSelectPrompt = GroupMultiSelectPrompt<{
    value: string;
    label: string;
}>;

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

    const callParams = {
        message: params.message,
        options: params.options,
        initialValues: params.initialValues.filter((value) =>
            offeredValues.has(value),
        ),
    };

    const markers = params.reactiveMarkers ?? [];

    if (markers.length === 0) {
        return groupMultiselect(callParams);
    }

    const restore = patchReactiveMarkerToggle(new Set(markers));

    try {
        return await groupMultiselect(callParams);
    } finally {
        restore();
    }
}

/**
 * Patches `GroupMultiSelectPrompt` for the duration of one picker call.
 * Toggling a marker value then also toggles every other item in its group.
 * Returns a function that restores the original, unpatched method.
 */
function patchReactiveMarkerToggle(markers: Set<string>): () => void {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called via `.call(this)` right below, never detached.
    const original = GroupMultiSelectPrompt.prototype.prompt;

    GroupMultiSelectPrompt.prototype.prompt = function (
        this: ReactiveGroupMultiSelectPrompt,
    ) {
        attachReactiveMarkerToggle(this, markers);

        return original.call(this);
    };

    return () => {
        GroupMultiSelectPrompt.prototype.prompt = original;
    };
}

/**
 * Wires one prompt instance's marker toggle to mirror onto its whole group.
 * Toggling a marker on or off sets every other item in its group the same way.
 * Exported for direct, terminal-free unit testing of this reactive logic.
 */
export function attachReactiveMarkerToggle(
    prompt: ReactiveGroupMultiSelectPrompt,
    markers: Set<string>,
): void {
    prompt.on("key", (_char, key) => {
        if (key.name !== "space") {
            return;
        }

        const option = prompt.options[prompt.cursor];

        if (!markers.has(option.value)) {
            return;
        }

        const siblings = prompt
            .getGroupItems(String(option.group))
            .map((item) => item.value)
            .filter((value) => !markers.has(value));

        const selected = new Set(prompt.value ?? []);
        const markerIsSelected = selected.has(option.value);

        prompt.value = markerIsSelected
            ? [...new Set([...selected, ...siblings])]
            : [...selected].filter((value) => !siblings.includes(value));
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
