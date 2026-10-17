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
import { normalizeGitUrl } from "@support/utils/normalize-git-url.js";
import { defaultClonePathFor } from "@support/utils/agenteq-sources-root.js";
import { CliError } from "@support/errors/cli-error.js";
import artifactsManager from "@artifacts/services/artifacts-manager/index.js";
import loadAgentsFileAction from "@agents/actions/load-agents-file-action.js";
import saveRemoteClonePathAction from "@agents/actions/save-remote-clone-path-action.js";
import loadRemoteSourcesFileAction from "@artifacts/actions/load-remote-sources-file-action.js";
import saveRemoteSourcesFileAction from "@artifacts/actions/save-remote-sources-file-action.js";
import discoverRemoteCapabilitiesAction, {
    NAMESPACE_SEPARATOR,
    type RemoteCapabilities,
} from "@artifacts/actions/discover-remote-capabilities-action.js";
import RemoteSourcesFile, {
    type RemoteSourceEntry,
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
        .option(
            "--pin [tag]",
            "pin to a release tag instead of tracking the default branch, newest tag when none is given",
        )
        .option("--yes", "run non-interactively (env: AGENTEQ_YES)")
        .option(
            "--skills <names>",
            "comma-separated skill names to select, skips the picker",
        )
        .option(
            "--commands <names>",
            "comma-separated command names to select, skips the picker",
        )
        .option(
            "--mcp <names>",
            "comma-separated mcp server names to select, skips the picker",
        )
        .option(
            "--guidelines",
            "select this source's GUIDELINES.md, skips the picker",
        )
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
            "--skills <names>",
            "comma-separated skill names to select, skips the picker",
        )
        .option(
            "--commands <names>",
            "comma-separated command names to select, skips the picker",
        )
        .option(
            "--mcp <names>",
            "comma-separated mcp server names to select, skips the picker",
        )
        .option(
            "--guidelines",
            "select this source's GUIDELINES.md, skips the picker",
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
        .command("pin <name> [tag]")
        .description(
            "Pin a remote source to a release tag, the newest one when tag is omitted",
        )
        .option(
            "--json",
            "print machine-readable JSON instead of text (env: AGENTEQ_JSON)",
        )
        .option(
            "--source-dir <dir>",
            `canonical source directory within the current repository (env: AGENTEQ_SOURCE_DIR, default: ${artifactsManager.DEFAULT_SOURCE_DIR})`,
        )
        .action(runPin);

    remoteSourceCommand
        .command("unpin <name>")
        .description(
            "Stop pinning a remote source, go back to tracking its default branch",
        )
        .option(
            "--json",
            "print machine-readable JSON instead of text (env: AGENTEQ_JSON)",
        )
        .option(
            "--source-dir <dir>",
            `canonical source directory within the current repository (env: AGENTEQ_SOURCE_DIR, default: ${artifactsManager.DEFAULT_SOURCE_DIR})`,
        )
        .action(runUnpin);

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

/**
 * Marks a `--pin` with no tag given, pin the newest one instead of a specific one.
 */
const LATEST_TAG = Symbol("latest tag");

/**
 * Marks "don't pin at all", keep tracking the default branch.
 */
const HEAD = Symbol("HEAD");

/**
 * What a `--pin` request resolves to, once `parsePinFlag` reads a `RawPinFlag`.
 */
type PinFlag = typeof LATEST_TAG | typeof HEAD | string;

/**
 * Commander's raw shape for `--pin [tag]`, before `parsePinFlag` turns it into a `PinFlag`.
 */
type RawPinFlag = true | string | undefined;

interface ScriptableSelectionOptions {
    skills?: string;
    commands?: string;
    mcp?: string;
    guidelines?: boolean;
}

interface AddOptions extends ScriptableSelectionOptions {
    path?: string;
    ignored?: boolean;
    pin?: RawPinFlag;
    yes?: boolean;
    json?: boolean;
    sourceDir?: string;
}

interface RemoteSourceOptions {
    json?: boolean;
    sourceDir?: string;
}

interface UpdateChoicesOptions
    extends ScriptableSelectionOptions, RemoteSourceOptions {}

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

    const ref = await resolvePinOption(
        parsePinFlag(rawOptions.pin),
        clonePath,
        name,
    );

    const capabilities = await discoverRemoteCapabilitiesAction({
        rootDir: clonePath,
    });

    assertUsableCapabilities(capabilities, name);

    const selection = hasExplicitSelection(rawOptions)
        ? resolveExplicitSelection(rawOptions, capabilities, name)
        : canInteract
          ? await promptForSelection(capabilities, emptySelection())
          : selectEverything(capabilities);

    const updated = file.withRemote(name, {
        ref: ref,
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
        ["Name", "URL", "Pinned", "Clone path"],
        file.names().map((name) => {
            const entry = file.get(name);

            return [
                name,
                entry?.url ?? "",
                entry?.ref ?? "tracking",
                agentsFile?.clonePathOf(name) ?? defaultClonePathFor(name),
            ];
        }),
    );
}

async function runUpdateChoices(
    name: string,
    rawOptions: UpdateChoicesOptions,
): Promise<void> {
    const options = resolveOptions(rawOptions);
    const context = { cwd: process.cwd(), sourceDir: options.sourceDir };

    const file = await loadRemoteSourcesFileAction({ context: context });
    const entry = file.get(name);

    assertRemoteConfigured(entry, name);

    const canInteract = input.isInteractive() && !options.shouldSkipPrompts;

    if (!hasExplicitSelection(rawOptions) && !canInteract) {
        throw new CliError(
            "E_REMOTE_SOURCE_NEEDS_PROMPT",
            "`remote-source update-choices` needs an interactive terminal to show its picker, or a scriptable selection flag such as --skills.",
        );
    }

    const agentsFile = await loadAgentsFileAction({ context: context });

    const clonePath =
        agentsFile?.clonePathOf(name) ?? defaultClonePathFor(name);

    if (entry.ref) {
        await git.fetchTags({ cwd: clonePath });
        await git.checkoutTag({ cwd: clonePath, tag: entry.ref });
    } else {
        await git.pull({ cwd: clonePath });
    }

    const capabilities = await discoverRemoteCapabilitiesAction({
        rootDir: clonePath,
    });

    const selection = hasExplicitSelection(rawOptions)
        ? resolveExplicitSelection(rawOptions, capabilities, name)
        : await promptForSelection(capabilities, entry.selection);

    const updated = file.withRemote(name, {
        ref: entry.ref,
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

async function runPin(
    name: string,
    tag: string | undefined,
    rawOptions: RemoteSourceOptions,
): Promise<void> {
    const options = resolveOptions(rawOptions);
    const context = { cwd: process.cwd(), sourceDir: options.sourceDir };

    const file = await loadRemoteSourcesFileAction({ context: context });
    const entry = file.get(name);

    assertRemoteConfigured(entry, name);

    const agentsFile = await loadAgentsFileAction({ context: context });

    const clonePath =
        agentsFile?.clonePathOf(name) ?? defaultClonePathFor(name);

    const ref = await resolveTagToPinOn(tag ?? LATEST_TAG, clonePath, name);

    const checkoutResult = await git.checkoutTag({ cwd: clonePath, tag: ref });

    if (!checkoutResult.isSuccessful) {
        throw new CliError(
            "E_REMOTE_SOURCE_CHECKOUT_FAILED",
            `Could not check out tag "${pc.bold(ref)}" for "${pc.bold(name)}".${formatErrorDetails(checkoutResult.detail)}`,
        );
    }

    const updated = file.withRemote(name, { ...entry, ref: ref });

    await saveRemoteSourcesFileAction({
        context: context,
        remotes: updated.remotes,
        shouldIgnore: false,
    });

    printMessage({
        isJson: options.isJson,
        level: "info",
        message: `Pinned remote source "${pc.bold(name)}" to ${pc.bold(ref)}.`,
    });
}

async function runUnpin(
    name: string,
    rawOptions: RemoteSourceOptions,
): Promise<void> {
    const options = resolveOptions(rawOptions);
    const context = { cwd: process.cwd(), sourceDir: options.sourceDir };

    const file = await loadRemoteSourcesFileAction({ context: context });
    const entry = file.get(name);

    assertRemoteConfigured(entry, name);

    if (!entry.ref) {
        printMessage({
            isJson: options.isJson,
            level: "info",
            message: `Remote source "${pc.bold(name)}" is not pinned.`,
        });

        return;
    }

    const agentsFile = await loadAgentsFileAction({ context: context });

    const clonePath =
        agentsFile?.clonePathOf(name) ?? defaultClonePathFor(name);

    const branch = git.defaultBranch({ cwd: clonePath });

    if (!branch) {
        throw new CliError(
            "E_REMOTE_SOURCE_NO_DEFAULT_BRANCH",
            `Could not determine the default branch for "${pc.bold(name)}" at ${pc.bold(clonePath)}.`,
        );
    }

    await git.checkoutBranch({ branch: branch, cwd: clonePath });
    await git.pull({ cwd: clonePath });

    const updated = file.withRemote(name, {
        selection: entry.selection,
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
        message: `Unpinned remote source "${pc.bold(name)}", tracking "${pc.bold(branch)}" again.`,
    });
}

function assertRemoteConfigured(
    entry: RemoteSourceEntry | undefined,
    name: string,
): asserts entry is RemoteSourceEntry {
    if (!entry) {
        throw new CliError(
            "E_REMOTE_SOURCE_NOT_CONFIGURED",
            `No remote source named "${pc.bold(name)}" is configured. Run \`npx agenteq remote-source add ${name} <git-url>\` first.`,
        );
    }
}

/**
 * Turns commander's raw `--pin [tag]` value into a `PinFlag`.
 */
function parsePinFlag(raw: RawPinFlag): PinFlag {
    if (raw === undefined) {
        return HEAD;
    }

    return raw === true ? LATEST_TAG : raw;
}

/**
 * Resolves a requested `--pin` option into a concrete tag, undefined when no pin was requested at all.
 */
async function resolvePinOption(
    pin: PinFlag,
    clonePath: string,
    name: string,
): Promise<string | undefined> {
    return pin === HEAD ? undefined : resolveTagToPinOn(pin, clonePath, name);
}

/**
 * Fetches tags and resolves them to a concrete tag to pin on.
 * Pass `LATEST_TAG` to resolve to the newest one instead of naming an exact tag.
 */
async function resolveTagToPinOn(
    tag: string | typeof LATEST_TAG,
    clonePath: string,
    name: string,
): Promise<string> {
    await git.fetchTags({ cwd: clonePath });

    const tags = git.listTags({ cwd: clonePath });

    if (tags.length === 0) {
        throw new CliError(
            "E_REMOTE_SOURCE_NO_TAGS",
            `"${pc.bold(name)}" has no tags to pin to.`,
        );
    }

    if (tag === LATEST_TAG) {
        return tags[0];
    }

    if (!tags.includes(tag)) {
        throw new CliError(
            "E_REMOTE_SOURCE_TAG_NOT_FOUND",
            `Tag "${pc.bold(tag)}" was not found for "${pc.bold(name)}". Available tags, ${tags.join(", ")}.`,
        );
    }

    return tag;
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

/**
 * Reports whether `add` or `update-choices` was given any scriptable selection flag,
 * `--skills`, `--commands`, `--mcp`, or `--guidelines`.
 * Their presence, not `--yes`, is what skips the interactive picker.
 */
function hasExplicitSelection(options: ScriptableSelectionOptions): boolean {
    return (
        options.skills !== undefined ||
        options.commands !== undefined ||
        options.mcp !== undefined ||
        options.guidelines === true
    );
}

/**
 * Builds a selection straight from `add`'s or `update-choices`'s scriptable flags.
 * No picker is involved.
 * A capability whose flag was not passed selects nothing from that capability,
 * unlike `--yes`, which selects everything.
 */
function resolveExplicitSelection(
    options: ScriptableSelectionOptions,
    capabilities: RemoteCapabilities,
    name: string,
): RemoteSourceSelection {
    const skills = parseItemList(options.skills);
    const commands = parseItemList(options.commands);
    const mcp = parseItemList(options.mcp);

    assertItemsExist(skills, capabilities.skills, "skill", name);
    assertItemsExist(commands, capabilities.commands, "command", name);
    assertItemsExist(mcp, capabilities.mcp, "mcp server", name);

    return {
        commands: commands,
        guidelines: options.guidelines ?? false,
        mcp: mcp,
        skills: skills,
    };
}

/**
 * Splits a `--skills`/`--commands`/`--mcp` flag's comma-separated value into item names.
 * An omitted flag is an empty list, not "every item".
 */
function parseItemList(raw: string | undefined): string[] {
    if (raw === undefined) {
        return [];
    }

    return raw
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

/**
 * Throws a trackable CliError naming every requested item the remote source does not actually offer.
 */
function assertItemsExist(
    requested: string[],
    available: string[],
    itemLabel: string,
    name: string,
): void {
    const unknown = requested.filter((item) => !available.includes(item));

    if (unknown.length > 0) {
        throw new CliError(
            "E_REMOTE_SOURCE_UNKNOWN_ITEM",
            `"${pc.bold(name)}" has no ${itemLabel} named ${unknown.map((item) => pc.bold(item)).join(", ")}. Available, ${available.join(", ") || "none"}.`,
        );
    }
}

async function promptForSelection(
    capabilities: RemoteCapabilities,
    current: RemoteSourceSelection,
): Promise<RemoteSourceSelection> {
    const skills =
        capabilities.skills.length > 0
            ? await promptGroupMultiselect(
                  `Select ${pc.bold("Skills")} to sync from this source`,
                  namespacedOptions(capabilities.skills),
                  current.skills,
              )
            : [];

    const commands =
        capabilities.commands.length > 0
            ? await promptGroupMultiselect(
                  `Select ${pc.bold("Commands")} to sync from this source`,
                  namespacedOptions(capabilities.commands),
                  current.commands,
              )
            : [];

    const mcp =
        capabilities.mcp.length > 0
            ? await promptGroupMultiselect(
                  `Select ${pc.bold("MCP servers")} to sync from this source`,
                  namespacedOptions(capabilities.mcp),
                  current.mcp,
              )
            : [];

    const guidelines = capabilities.hasGuidelines
        ? await promptConfirm(
              `Sync this source's ${pc.bold("GUIDELINES.md")}?`,
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

const ROOT_GROUP_LABEL = "(root)";

interface GroupableOption {
    group: string;
    label: string;
    value: string;
}

/**
 * Builds one groupable option per skill, command, or mcp server identifier.
 * Its group is the namespace encoded in that identifier.
 * A root item, with no namespace, groups under a fixed root label and keeps its bare name as its label.
 */
function namespacedOptions(items: string[]): GroupableOption[] {
    return items.map((item) => {
        const separatorIndex = item.indexOf(NAMESPACE_SEPARATOR);

        return separatorIndex === -1
            ? { group: ROOT_GROUP_LABEL, label: item, value: item }
            : {
                  group: item.slice(0, separatorIndex),
                  label: item.slice(
                      separatorIndex + NAMESPACE_SEPARATOR.length,
                  ),
                  value: item,
              };
    });
}

/**
 * Shows a picker grouping its options, letting the user select a whole classified sub-folder at once.
 */
async function promptGroupMultiselect(
    message: string,
    items: GroupableOption[],
    initialValues: string[],
): Promise<string[]> {
    const options: Record<string, { label: string; value: string }[]> = {};

    for (const item of items) {
        options[item.group] = [
            ...(options[item.group] ?? []),
            { label: item.label, value: item.value },
        ];
    }

    const picked = await input.groupMultiselect({
        initialValues: initialValues,
        message: message,
        options: options,
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
