/**
 * Deliberately small tag readers for the handful of head-level facts a T0 sweep needs.
 * They are regex-based and say so: anything needing real parsing (heading outlines,
 * landmark structure, in-page semantics) belongs to a rendered-page check, not here.
 */
export function tagText(html: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(html);
  return m?.[1]?.replace(/\s+/g, ' ').trim();
}

export function metaContent(html: string, attr: 'name' | 'property', key: string): string | undefined {
  const pattern = new RegExp(`<meta[^>]*${attr}\\s*=\\s*["']${key}["'][^>]*>`, 'i');
  const tag = pattern.exec(html)?.[0];
  if (!tag) return undefined;
  return /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]?.trim();
}

export function linkHref(html: string, rel: string): string | undefined {
  const pattern = new RegExp(`<link[^>]*rel\\s*=\\s*["'][^"']*\\b${rel}\\b[^"']*["'][^>]*>`, 'i');
  const tag = pattern.exec(html)?.[0];
  if (!tag) return undefined;
  return /href\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]?.trim();
}

export function htmlLang(html: string): string | undefined {
  const tag = /<html[^>]*>/i.exec(html)?.[0];
  if (!tag) return undefined;
  return /\blang\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]?.trim();
}

export function countTags(html: string, tag: string): number {
  return html.match(new RegExp(`<${tag}[\\s>]`, 'gi'))?.length ?? 0;
}

export function hasCharset(html: string): boolean {
  return /<meta[^>]*charset\s*=/i.test(html) || /<meta[^>]*http-equiv\s*=\s*["']content-type["']/i.test(html);
}

export function isHtml(contentType: string | undefined): boolean {
  return Boolean(contentType && /text\/html|application\/xhtml/i.test(contentType));
}
