export interface RoleRef {
    readonly role: string;
    readonly name?: string | undefined;
    readonly nth?: number | undefined;
}

export type RoleRefMap = Readonly<Record<string, RoleRef>>;
