const TEMPLATE_PATTERN = /\{\{([\w$]+)\}\}/g;
const ADK_STATE_PATTERN = /\{state\./g;

export function interpolate(template: string, vars: Readonly<Record<string, string | number>>): string {
    return template.replace(TEMPLATE_PATTERN, (_match, key: string) => {
        return key in vars ? String(vars[key]) : `{{${key}}}`;
    });
}

/**
 * Neutralize ADK `{state.x}` placeholders in caller-controlled text: ADK does a late
 * `{state.x}` substitution, so untrusted content containing that literal would be
 * mis-interpolated. Inserts a zero-width break. Apply to variable values, not templates.
 */
export function escapeAdkState(text: string): string {
    return text.replace(ADK_STATE_PATTERN, '{​state.');
}
