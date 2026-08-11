import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";

/**
 * @see https://plugins.jetbrains.com/plugin/17718-github-copilot
 */
const copilotJetbrains = new Agent({
    name: "copilot_jetbrains",
    displayName: "GitHub Copilot JetBrains",
    guidelinesPath: ".github/copilot-instructions.md",
    detectProjectPathUsing: () =>
        createDetectionConfiguration({
            files: [".github/copilot-instructions.md"],
        }),
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({
            paths:
                platform === "darwin"
                    ? [
                          "~/Library/Application Support/JetBrains/*/plugins/*copilot*",
                      ]
                    : platform === "win32"
                      ? ["%APPDATA%/JetBrains/*/plugins/*copilot*"]
                      : ["~/.config/JetBrains/*/plugins/*copilot*"],
        }),
});

export default copilotJetbrains;
