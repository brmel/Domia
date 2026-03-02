export interface RoleRef {
    readonly role: string;
    readonly name?: string;
    readonly nth: number;
}

export type RoleRefMap = Readonly<Record<string, RoleRef>>;
