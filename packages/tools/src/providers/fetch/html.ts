const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[body] ?? m;
  });
}

export interface Link { readonly href: string; readonly text: string }
export interface Extracted {
  readonly title: string;
  readonly markdown: string;
  readonly text: string;
  readonly links: readonly Link[];
}

function absolutize(href: string, base: string): string | undefined {
  const h = href.trim();
  if (!h || h.startsWith('#') || /^(javascript|mailto|tel|data):/i.test(h)) return undefined;
  try { return new URL(h, base).toString(); } catch { return undefined; }
}

function hrefOf(attrs: string): string {
  const m = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
}

const BLOCK = /^(p|div|section|article|header|footer|main|ul|ol|table|tr|h[1-6]|br|hr|blockquote|pre)$/i;
const HEADING = /^h[1-6]$/;

export function htmlToMarkdown(html: string, baseUrl: string): Extracted {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1] ?? '').replace(/\s+/g, ' ').trim() : '';

  const body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  const links: Link[] = [];
  const blocks: string[] = [];
  let line = '';
  let anchorHref: string | undefined;
  let anchorText = '';

  const flush = () => { const t = line.replace(/[ \t]+/g, ' ').trim(); if (t) blocks.push(t); line = ''; };
  const emit = (s: string) => { if (anchorHref !== undefined) anchorText += s; else line += s; };

  const tag = /<\/?([a-zA-Z0-9]+)([^>]*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(body)) !== null) {
    emit(decodeEntities(body.slice(last, m.index)));
    last = tag.lastIndex;
    const name = (m[1] ?? '').toLowerCase();
    const closing = m[0][1] === '/';

    if (name === 'a') {
      if (!closing) { anchorHref = absolutize(hrefOf(m[2] ?? ''), baseUrl); anchorText = ''; }
      else if (anchorHref !== undefined) {
        const text = anchorText.replace(/\s+/g, ' ').trim();
        line += text ? `[${text}](${anchorHref})` : anchorHref;
        if (text) links.push({ href: anchorHref, text });
        anchorHref = undefined; anchorText = '';
      }
      continue;
    }
    if (HEADING.test(name) && !closing) { flush(); line = '#'.repeat(Number(name.slice(1))) + ' '; continue; }
    if (name === 'li' && !closing) { flush(); line = '- '; continue; }
    if (BLOCK.test(name)) flush();
  }
  emit(decodeEntities(body.slice(last)));
  flush();

  const markdown = blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  const text = markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^#+\s*/gm, '').replace(/^- /gm, '');
  return { title, markdown, text, links };
}
