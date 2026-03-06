/**
 * Replaces `{{key}}` placeholders in a template string with the corresponding
 * values from the `vars` map.  Unknown placeholders are left verbatim.
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
        return key in vars ? String(vars[key]) : `{{${key}}}`;
    });
}
