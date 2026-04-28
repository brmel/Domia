const TEMPLATE_PATTERN = /\{\{([\w$]+)\}\}/g;

export function interpolate(template: string, vars: Readonly<Record<string, string | number>>): string {
    return template.replace(TEMPLATE_PATTERN, (_match, key: string) => {
        return key in vars ? String(vars[key]) : `{{${key}}}`;
    });
}
