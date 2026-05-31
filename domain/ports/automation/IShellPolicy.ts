export interface ShellPolicyDecision {
    readonly allowed: boolean;
    readonly reason?: string;
}

export interface IShellPolicy {
    evaluate(command: string, cwd?: string): ShellPolicyDecision;
}
