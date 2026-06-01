const TEMPLATE_PATTERN = /\{\{([\w$]+)\}\}/g;
const ADK_STATE_PATTERN = /\{state\./g;

export function interpolate(template: string, vars: Readonly<Record<string, string | number>>): string {
    return template.replace(TEMPLATE_PATTERN, (_match, key: string) => {
        return key in vars ? String(vars[key]) : `{{${key}}}`;
    });
}

/**
 * Neutralize ADK `{state.x}` placeholders in caller-controlled text (W16 adk-escape).
 * ADK's instruction provider does a late `{state.x}` substitution; if untrusted
 * content (page text, a user goal) contains that literal sequence it would be
 * mis-interpolated. Inserting a zero-width break makes the sequence inert without
 * visibly changing the text. Apply to variable *values*, never to our own templates.
 */
export function escapeAdkState(text: string): string {
    return text.replace(ADK_STATE_PATTERN, '{​state.');
}
