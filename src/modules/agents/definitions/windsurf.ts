import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";

/**
 * @see https://windsurf.com
 */
const windsurf = new Agent({
    name: "windsurf",
    displayName: "Windsurf",
    commandsDir: ".windsurf/workflows",
    guidelinesPath: ".windsurfrules",
    detectProjectPathUsing: () =>
        createDetectionConfiguration({
            files: [".windsurfrules"],
            paths: [".windsurf"],
        }),
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({
            command: "windsurf",
            paths:
                platform === "darwin"
                    ? ["/Applications/Windsurf.app"]
                    : platform === "win32"
                      ? ["%LOCALAPPDATA%/Programs/Windsurf"]
                      : ["~/.local/share/windsurf"],
        }),
});

export default windsurf;
