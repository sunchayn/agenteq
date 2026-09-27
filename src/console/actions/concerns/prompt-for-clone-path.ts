import { resolve } from "node:path";
import input from "@infrastructure/terminal/input.js";
import { expandPath } from "@support/utils/expand-path.js";
import { defaultClonePathFor } from "@support/utils/agenteq-sources-root.js";
import { CliError } from "@support/errors/cli-error.js";

/**
 * Asks where a remote source should be cloned on this machine.
 * Returns the default location without asking when the terminal is not interactive.
 */
export async function promptForClonePath(
    options: PromptForClonePathOptions,
): Promise<string> {
    const { canInteract, name } = options;

    const suggested = defaultClonePathFor(name);

    if (!canInteract) {
        return suggested;
    }

    const answer = await input.text({
        defaultValue: suggested,
        message: `Where should the remote source "${name}" be cloned`,
        placeholder: suggested,
    });

    if (input.isCancel(answer)) {
        throw new CliError("E_REMOTE_SOURCE_CANCELLED", "Cancelled.");
    }

    const trimmed = answer.trim();

    return trimmed.length > 0 ? resolve(expandPath(trimmed)) : suggested;
}

/*
 * Interface & Types.
 */

interface PromptForClonePathOptions {
    canInteract: boolean;
    name: string;
}
