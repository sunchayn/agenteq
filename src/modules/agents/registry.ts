import amp from "@agents/definitions/amp.js";
import antigravity from "@agents/definitions/antigravity.js";
import claudeCode from "@agents/definitions/claude-code.js";
import cline from "@agents/definitions/cline.js";
import clineCli from "@agents/definitions/cline-cli.js";
import codex from "@agents/definitions/codex.js";
import copilot from "@agents/definitions/copilot.js";
import copilotCli from "@agents/definitions/copilot-cli.js";
import copilotJetbrains from "@agents/definitions/copilot-jetbrains.js";
import cursor from "@agents/definitions/cursor.js";
import devin from "@agents/definitions/devin.js";
import factory from "@agents/definitions/factory.js";
import goose from "@agents/definitions/goose.js";
import grokBuild from "@agents/definitions/grok-build.js";
import junie from "@agents/definitions/junie.js";
import kilo from "@agents/definitions/kilo.js";
import kiro from "@agents/definitions/kiro.js";
import opencode from "@agents/definitions/opencode.js";
import pi from "@agents/definitions/pi.js";
import roo from "@agents/definitions/roo.js";
import windsurf from "@agents/definitions/windsurf.js";
import zed from "@agents/definitions/zed.js";
import type Agent from "@agents/entities/agent.js";

/**
 * Every coding agent agenteq knows, the single source of truth agenteq is built from.
 * This order carries through unchanged to the interactive agent picker.
 */
export const agentDefinitions: Agent[] = [
    claudeCode,
    cursor,
    windsurf,
    devin,
    codex,
    copilot,
    copilotCli,
    copilotJetbrains,
    antigravity,
    amp,
    factory,
    grokBuild,
    junie,
    kiro,
    opencode,
    pi,
    zed,
    goose,
    cline,
    clineCli,
    roo,
    kilo,
];
