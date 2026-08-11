import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";

/**
 * @see https://cline.bot/cli
 */
const clineCli = new Agent({
    name: "cline_cli",
    displayName: "Cline CLI",
    guidelinesPath: ".clinerules",
    skillsDir: ".cline/skills",
    detectProjectPathUsing: () =>
        createDetectionConfiguration({
            files: [".clinerules"],
            paths: [".clinerules"],
        }),
    detectSystemPathUsing: () =>
        createDetectionConfiguration({ command: "cline" }),
});

export default clineCli;
