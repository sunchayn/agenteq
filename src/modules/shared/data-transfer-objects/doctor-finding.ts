/**
 * One problem `agenteq doctor` found in the current project, paired with the exact command to fix it.
 */
export class DoctorFinding {
    readonly message: string;
    readonly fixCommand: string;

    constructor(options: DoctorFindingOptions) {
        this.message = options.message;
        this.fixCommand = options.fixCommand;
    }
}

/*
 * Interface & Types.
 */

interface DoctorFindingOptions {
    message: string;
    fixCommand: string;
}
