
export interface AriaNode {
    readonly role: string;
    readonly name?: string;
    readonly value?: string | number;
    readonly description?: string;
    readonly keyshortcuts?: string;
    readonly roledescription?: string;
    readonly valuetext?: string;
    readonly disabled?: boolean;
    readonly expanded?: boolean;
    readonly focused?: boolean;
    readonly modal?: boolean;
    readonly multiline?: boolean;
    readonly multiselectable?: boolean;
    readonly readonly?: boolean;
    readonly required?: boolean;
    readonly selected?: boolean;
    readonly checked?: boolean | 'mixed';
    readonly pressed?: boolean | 'mixed';
    readonly level?: number;
    readonly valuemin?: number;
    readonly valuemax?: number;
    readonly autocomplete?: string;
    readonly hasPopup?: string;
    readonly invalid?: string;
    readonly orientation?: string;
    readonly children?: AriaNode[];
}
