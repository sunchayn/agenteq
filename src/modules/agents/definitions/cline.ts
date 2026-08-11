import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";

/**
 * @see https://cline.bot
 */
const cline = new Agent({
    name: "cline",
    displayName: "Cline",
    guidelinesPath: ".clinerules",
    skillsDir: ".cline/skills",
    detectProjectPathUsing: () =>
        createDetectionConfiguration({
            files: [".clinerules"],
            paths: [".clinerules"],
        }),
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({ paths: extensionPaths(platform) }),
});

/*
 * Internal.
 */

const HOST_EDITOR_DIRS = [
    ".vscode",
    ".vscode-insiders",
    ".cursor",
    ".windsurf",
    ".vscode-oss",
    ".antigravity",
];

/**
 * Builds the install-folder glob for every VS Code family host Cline's extension can install into,
 * plus a JetBrains plugins-folder glob, since the plugin's on-disk folder name isn't a stable, documented value.
 */
function extensionPaths(platform: NodeJS.Platform): string[] {
    const home = platform === "win32" ? "%USERPROFILE%" : "~";

    const hostPaths = HOST_EDITOR_DIRS.map(
        (dir) => `${home}/${dir}/extensions/saoudrizwan.claude-dev-*`,
    );

    const jetbrainsBase =
        platform === "darwin"
            ? "~/Library/Application Support/JetBrains"
            : platform === "win32"
              ? "%APPDATA%/JetBrains"
              : "~/.config/JetBrains";

    return [...hostPaths, `${jetbrainsBase}/*/plugins/*cline*`];
}

export default cline;
