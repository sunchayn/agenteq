import Agent from "@agents/entities/agent.js";
import { createDetectionConfiguration } from "@agents/types/detection-configuration.js";

/**
 * @see https://goose-docs.ai
 */
const goose = new Agent({
    name: "goose",
    displayName: "Goose",
    guidelinesPath: ".goosehints",
    detectProjectPathUsing: () =>
        createDetectionConfiguration({ files: [".goosehints"] }),
    detectSystemPathUsing: (platform) =>
        createDetectionConfiguration({
            command: "goose",
            // The Goose Desktop app doesn't put anything on PATH.
            paths:
                platform === "darwin" ? ["/Applications/Goose.app"] : undefined,
        }),
});

export default goose;
