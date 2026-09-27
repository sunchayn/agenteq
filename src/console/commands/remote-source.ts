import { resolve } from "node:path";
import type { Command } from "commander";
import pc from "picocolors";
import input from "@infrastructure/terminal/input.js";
import filesystem from "@infrastructure/filesystem.js";
import git from "@infrastructure/git.js";
import env from "@infrastructure/env.js";
import output from "@infrastructure/terminal/output.js";
import { expandPath } from "@support/utils/expand-path.js";
import { formatErrorDetails } from "@support/utils/format-error-details.js";
import { defaultClonePathFor } from "@support/utils/agenteq-sources-root.js";
import { CliError } from "@support/errors/cli-error.js";
import artifactsManager from "@artifacts/services/artifacts-manager/index.js";
import loadAgentsFileAction from "@agents/actions/load-agents-file-action.js";
import saveRemoteClonePathAction from "@agents/actions/save-remote-clone-path-action.js";
import loadRemoteSourcesFileAction from "@artifacts/actions/load-remote-sources-file-action.js";
import saveRemoteSourcesFileAction from "@artifacts/actions/save-remote-sources-file-action.js";
import discoverRemoteCapabilitiesAction, {
    type RemoteCapabilities,
} from "@artifacts/actions/discover-remote-capabilities-action.js";
import RemoteSourcesFile, {
    type RemoteSourceSelection,
} from "@artifacts/entities/remote-sources-file.js";
import { promptForClonePath } from "@console/actions/concerns/prompt-for-clone-path.js";
import { printMessage, renderAsJson } from "@console/utils/console.js";

/**
 * Registers `agenteq remote-source add/list/update-choices/remove`.
 * Configures any number of named remote git content sources, alongside the local canonical source directory.
 */
export function registerRemoteSourceCommand(program: Command): void {
    const remoteSourceCommand = program
        .command("remote-source")
        .description(
            "Configure named remote git repositories as additional content sources",
        );

    remoteSourceCommand
        .command("add <name> <git-url>")
        .description(
            "Add a named remote git repository as a source, pick what to sync from it, and save the configuration",
        )
        .option(
            "--path <dir>",
            "where to clone the repository, skips the location prompt",
        )
        .option(
            "--ignored",
            "keep the saved configuration out of git, personal to this machine",
        )
        .option("--yes", "run non-interactively (env: AGENTEQ_YES)")
        .option(
            "--json",
            "print machine-readable JSON instead of text (env: AGENTEQ_JSON)",
        )
        .option(
            "--source-dir <dir>",
            `canonical source directory within the current repository (env: AGENTEQ_SOURCE_DIR, default: ${artifactsManager.DEFAULT_SOURCE_DIR})`,
        )
        .action(runAdd);

    remoteSourceCommand
        .command("list")
        .description("List every configured remote source")
        .option(
            "--json",
            "print machine-readable JSON instead of a table (env: AGENTEQ_JSON)",
        )
        .option(
            "--source-dir <dir>",
            `canonical source directory within the current repository (env: AGENTEQ_SOURCE_DIR, default: ${artifactsManager.DEFAULT_SOURCE_DIR})`,
        )
        .action(runList);

    remoteSourceCommand
        .command("update-choices <name>")
        .description(
            "Pull one named remote source and re-prompt you to update its previous choices (Guidelines, Skills, Commands, MCPs)",
        )
        .option(
            "--json",
            "print machine-readable JSON instead of text (env: AGENTEQ_JSON)",
        )
        .option(
            "--source-dir <dir>",
            `canonical source directory within the current repository (env: AGENTEQ_SOURCE_DIR, default: ${artifactsManager.DEFAULT_SOURCE_DIR})`,
        )
        .action(runUpdateChoices);

    remoteSourceCommand
        .command("remove <name>")
        .description("Delete one named remote source's saved configuration")
        .option(
            "--json",
            "print machine-readable JSON instead of text (env: AGENTEQ_JSON)",
        )
        .option(
            "--source-dir <dir>",
            `canonical source directory within the current repository (env: AGENTEQ_SOURCE_DIR, default: ${artifactsManager.DEFAULT_SOURCE_DIR})`,
        )
        .action(runRemove);
}

/*
 * Interface & Types.
 */

interface AddOptions {
    path?: string;
    ignored?: boolean;
    yes?: boolean;
    json?: boolean;
    sourceDir?: string;
}

interface RemoteSourceOptions {
    json?: boolean;
    sourceDir?: string;
}

interface ResolvedOptions {
    isJson: boolean;
    shouldSkipPrompts: boolean;
    sourceDir: string;
}

interface ResolveOrCloneRepoOptions {
    gitUrl: string;
    clonePath: string;
}

/*
 * Internal.
 */

async function runAdd(
    name: string,
    gitUrl: string,
    rawOptions: AddOptions,
): Promise<void> {
    const options = resolveOptions(rawOptions);
    const context = { cwd: process.cwd(), sourceDir: options.sourceDir };

    const file = await loadRemoteSourcesFileAction({ context: context });

    assertRemoteNameNotTaken(file, name);
    assertUrlNotTaken(file, gitUrl);

    const canInteract = input.isInteractive() && !options.shouldSkipPrompts;

    const clonePath = rawOptions.path
        ? resolve(expandPath(rawOptions.path))
        : await promptForClonePath({ canInteract: canInteract, name: name });

    await resolveOrCloneRepo({ clonePath: clonePath, gitUrl: gitUrl });

    const capabilities = await discoverRemoteCapabilitiesAction({
        rootDir: clonePath,
    });

    assertUsableCapabilities(capabilities, name);

    const selection = canInteract
        ? await promptForSelection(capabilities, emptySelection())
        : selectEverything(capabilities);

    const updated = file.withRemote(name, {
        selection: selection,
        url: gitUrl,
    });

    await saveRemoteClonePathAction({
        context: context,
        name: name,
        path: clonePath,
    });

    await saveRemoteSourcesFileAction({
        context: context,
        remotes: updated.remotes,
        shouldIgnore: rawOptions.ignored ?? false,
    });

    printMessage({
        isJson: options.isJson,
        level: "info",
        message: `Saved remote source "${pc.bold(name)}" at ${pc.bold(RemoteSourcesFile.path(context))}. Run \`npx agenteq sync\` to apply it.`,
    });
}

async function runList(rawOptions: RemoteSourceOptions): Promise<void> {
    const options = resolveOptions(rawOptions);
    const context = { cwd: process.cwd(), sourceDir: options.sourceDir };

    const file = await loadRemoteSourcesFileAction({ context: context });

    if (file.isEmpty()) {
        printMessage({
            isJson: options.isJson,
            level: "info",
            message: "No remote sources are configured.",
        });

        return;
    }

    const agentsFile = await loadAgentsFileAction({ context: context });

    if (options.isJson) {
        output.writeRaw(
            renderAsJson(
                Object.fromEntries(
                    file.names().map((name) => [
                        name,
                        {
                            ...file.get(name),
                            clonePath:
                                agentsFile?.clonePathOf(name) ??
                                defaultClonePathFor(name),
                        },
                    ]),
                ),
            ),
        );

        return;
    }

    output.table(
        ["Name", "URL", "Clone path"],
        file.names().map((name) => {
            const entry = file.get(name);

            return [
                name,
                entry?.url ?? "",
                agentsFile?.clonePathOf(name) ?? defaultClonePathFor(name),
            ];
        }),
    );
}

async function runUpdateChoices(
    name: string,
    rawOptions: RemoteSourceOptions,
): Promise<void> {
    const options = resolveOptions(rawOptions);
    const context = { cwd: process.cwd(), sourceDir: options.sourceDir };

    const file = await loadRemoteSourcesFileAction({ context: context });
    const entry = file.get(name);

    if (!entry) {
        throw new CliError(
            "E_REMOTE_SOURCE_NOT_CONFIGURED",
            `No remote source named "${pc.bold(name)}" is configured. Run \`npx agenteq remote-source add ${name} <git-url>\` first.`,
        );
    }

    if (!(input.isInteractive() && !options.shouldSkipPrompts)) {
        throw new CliError(
            "E_REMOTE_SOURCE_NEEDS_PROMPT",
            "`remote-source update-choices` needs an interactive terminal to show its picker.",
        );
    }

    const agentsFile = await loadAgentsFileAction({ context: context });

    const clonePath =
        agentsFile?.clonePathOf(name) ?? defaultClonePathFor(name);

    await git.pull({ cwd: clonePath });

    const capabilities = await discoverRemoteCapabilitiesAction({
        rootDir: clonePath,
    });

    const selection = await promptForSelection(capabilities, entry.selection);

    const updated = file.withRemote(name, {
        selection: selection,
        url: entry.url,
    });

    await saveRemoteSourcesFileAction({
        context: context,
        remotes: updated.remotes,
        shouldIgnore: false,
    });

    printMessage({
        isJson: options.isJson,
        level: "info",
        message: `Updated remote source "${pc.bold(name)}"'s selection. Run \`agenteq sync\` to apply it.`,
    });
}

async function runRemove(
    name: string,
    rawOptions: RemoteSourceOptions,
): Promise<void> {
    const options = resolveOptions(rawOptions);
    const context = { cwd: process.cwd(), sourceDir: options.sourceDir };

    const file = await loadRemoteSourcesFileAction({ context: context });
    const entry = file.get(name);

    if (!entry) {
        printMessage({
            isJson: options.isJson,
            level: "info",
            message: `No remote source named "${name}" is configured. Nothing to remove.`,
        });

        return;
    }

    const agentsFile = await loadAgentsFileAction({ context: context });

    const clonePath =
        agentsFile?.clonePathOf(name) ?? defaultClonePathFor(name);

    const updated = file.withoutRemote(name);
    const path = RemoteSourcesFile.path(context);

    if (updated.isEmpty()) {
        await filesystem.remove(path);
    } else {
        await saveRemoteSourcesFileAction({
            context: context,
            remotes: updated.remotes,
            shouldIgnore: false,
        });
    }

    if (agentsFile?.clonePathOf(name)) {
        await saveRemoteClonePathAction({ context: context, name: name });
    }

    printMessage({
        isJson: options.isJson,
        level: "info",
        message: `Removed remote source "${pc.bold(name)}". The clone at ${pc.bold(clonePath)} was left in place, delete it yourself if you no longer need it.`,
    });
}

function resolveOptions(
    options: AddOptions | RemoteSourceOptions,
): ResolvedOptions {
    return {
        isJson: options.json ?? env.readFlag("AGENTEQ_JSON"),
        shouldSkipPrompts:
            "yes" in options
                ? (options.yes ?? env.readFlag("AGENTEQ_YES"))
                : env.readFlag("AGENTEQ_YES"),
        sourceDir:
            options.sourceDir ??
            env.readString("AGENTEQ_SOURCE_DIR") ??
            artifactsManager.DEFAULT_SOURCE_DIR,
    };
}

/**
 * Reuses an existing clone whose origin already matches, clones fresh otherwise.
 */
async function resolveOrCloneRepo(
    options: ResolveOrCloneRepoOptions,
): Promise<void> {
    const { clonePath, gitUrl } = options;

    if (await filesystem.exists(clonePath)) {
        const existingUrl = git.remoteUrl({ cwd: clonePath });

        if (
            existingUrl &&
            normalizeGitUrl(existingUrl) === normalizeGitUrl(gitUrl)
        ) {
            return;
        }

        throw new CliError(
            "E_REMOTE_SOURCE_PATH_CONFLICT",
            `${pc.bold(clonePath)} already exists and is not a clone of ${pc.bold(gitUrl)}.`,
        );
    }

    const result = await git.clone({ targetDir: clonePath, url: gitUrl });

    if (!result.isSuccessful) {
        throw new CliError(
            "E_REMOTE_SOURCE_CLONE_FAILED",
            `Could not clone ${pc.bold(gitUrl)}.${formatErrorDetails(result.detail)}`,
        );
    }
}

function normalizeGitUrl(url: string): string {
    return url.replace(/\.git$/, "").replace(/\/$/, "");
}

function assertRemoteNameNotTaken(file: RemoteSourcesFile, name: string) {
    if (file.has(name)) {
        throw new CliError(
            "E_REMOTE_SOURCE_ALREADY_EXISTS",
            `A remote source named "${pc.bold(name)}" already exists. Remove it first, or pick a different name.`,
        );
    }
}

function assertUrlNotTaken(file: RemoteSourcesFile, gitUrl: string): void {
    const normalized = normalizeGitUrl(gitUrl);

    const existingName = file
        .names()
        .find(
            (name) => normalizeGitUrl(file.get(name)?.url ?? "") === normalized,
        );

    if (existingName) {
        throw new CliError(
            "E_REMOTE_SOURCE_URL_ALREADY_EXISTS",
            `${pc.bold(gitUrl)} is already configured as remote source "${pc.bold(existingName)}".`,
        );
    }
}

function assertUsableCapabilities(
    capabilities: RemoteCapabilities,
    name: string,
): void {
    const { commands, hasGuidelines, mcp, skills } = capabilities;

    if (
        skills.length === 0 &&
        commands.length === 0 &&
        mcp.length === 0 &&
        !hasGuidelines
    ) {
        throw new CliError(
            "E_INVALID_REMOTE_SOURCE",
            `"${pc.bold(name)}" has none of mcp/, commands/, skills/, or GUIDELINES.md at its root.`,
        );
    }
}

function emptySelection(): RemoteSourceSelection {
    return { commands: [], guidelines: false, mcp: [], skills: [] };
}

function selectEverything(
    capabilities: RemoteCapabilities,
): RemoteSourceSelection {
    return {
        commands: capabilities.commands,
        guidelines: capabilities.hasGuidelines,
        mcp: capabilities.mcp,
        skills: capabilities.skills,
    };
}

async function promptForSelection(
    capabilities: RemoteCapabilities,
    current: RemoteSourceSelection,
): Promise<RemoteSourceSelection> {
    const skills =
        capabilities.skills.length > 0
            ? await promptMultiselect(
                  "Select skills to sync from this source",
                  capabilities.skills,
                  current.skills,
              )
            : [];

    const commands =
        capabilities.commands.length > 0
            ? await promptMultiselect(
                  "Select commands to sync from this source",
                  capabilities.commands,
                  current.commands,
              )
            : [];

    const mcp =
        capabilities.mcp.length > 0
            ? await promptMultiselect(
                  "Select mcp servers to sync from this source",
                  capabilities.mcp,
                  current.mcp,
              )
            : [];

    const guidelines = capabilities.hasGuidelines
        ? await promptConfirm(
              "Sync this source's GUIDELINES.md?",
              current.guidelines,
          )
        : false;

    return {
        commands: commands,
        guidelines: guidelines,
        mcp: mcp,
        skills: skills,
    };
}

async function promptMultiselect(
    message: string,
    items: string[],
    initialValues: string[],
): Promise<string[]> {
    const picked = await input.multiselect({
        initialValues: initialValues,
        message: message,
        options: items.map((item) => ({ label: item, value: item })),
    });

    if (input.isCancel(picked)) {
        throw new CliError("E_REMOTE_SOURCE_CANCELLED", "Cancelled.");
    }

    return picked;
}

async function promptConfirm(
    message: string,
    initialValue: boolean,
): Promise<boolean> {
    const answer = await input.confirm({
        initialValue: initialValue,
        message: message,
    });

    if (input.isCancel(answer)) {
        throw new CliError("E_REMOTE_SOURCE_CANCELLED", "Cancelled.");
    }

    return answer;
}
