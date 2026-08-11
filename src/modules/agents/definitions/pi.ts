import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";

/**
 * @see https://pi.dev
 */
const pi = new Agent({
    name: "pi",
    displayName: "Pi",
    commandsDir: ".pi/prompts",
    guidelinesPath: "AGENTS.md",
    skillsDir: ".pi/skills",
    detectProjectPathUsing: () =>
        createDetectionConfiguration({
            files: [".pi/settings.json"],
            paths: [".pi"],
        }),
    detectSystemPathUsing: () =>
        createDetectionConfiguration({ command: "pi" }),
});

export default pi;
