import type Agent from "@agents/entities/agent.js";

export class AgentStatus {
    readonly agent: Agent;
    readonly isSystemInstalled: boolean;
    readonly isProjectInstalled: boolean;

    constructor(options: AgentStatusOptions) {
        this.agent = options.agent;
        this.isSystemInstalled = options.isSystemInstalled;
        this.isProjectInstalled = options.isProjectInstalled;
    }

    get isInstalled(): boolean {
        return this.isSystemInstalled || this.isProjectInstalled;
    }
}

/*
 * Interface & Types.
 */

interface AgentStatusOptions {
    agent: Agent;
    isSystemInstalled: boolean;
    isProjectInstalled: boolean;
}
