/** Converts editor JSON into GitHub-flavored Markdown. */

interface Mark {
  type: string;
  attrs?: Record<string, any>;
}

export interface JNode {
  type: string;
  attrs?: Record<string, any>;
  content?: JNode[];
  text?: string;
  marks?: Mark[];
}

type TitleOf = (pageId: string) => string;

const escapeText = (s: string) => s.replace(/([\\`*_[\]])/g, '\\$1');

function wrapMarks(text: string, marks: Mark[] = []): string {
  if (marks.some((m) => m.type === 'code')) {
    const ticks = text.includes('`') ? '``' : '`';
    text = `${ticks}${text}${ticks}`;
  } else {
    text = escapeText(text);
  }
  // Keep surrounding whitespace outside the markers so they stay valid.
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  if (!core) return text;
  let out = core;
  for (const m of marks) {
    if (m.type === 'bold') out = `**${out}**`;
    else if (m.type === 'italic') out = `_${out}_`;
    else if (m.type === 'strike') out = `~~${out}~~`;
    else if (m.type === 'highlight') out = `==${out}==`;
    else if (m.type === 'underline') out = `<u>${out}</u>`;
  }
  const link = marks.find((m) => m.type === 'link');
  if (link) out = `[${out}](${link.attrs?.href ?? ''})`;
  return lead + out + trail;
}

function sameMarks(a: Mark[] = [], b: Mark[] = []) {
  return a.length === b.length && a.every((m, i) => m.type === b[i].type && JSON.stringify(m.attrs) === JSON.stringify(b[i].attrs));
}

function inline(nodes: JNode[] | undefined, titleOf: TitleOf): string {
  if (!nodes) return '';
  // Merge adjacent text runs that share marks to avoid "**a****b**".
  const merged: JNode[] = [];
  for (const n of nodes) {
    const last = merged[merged.length - 1];
    if (n.type === 'text' && last?.type === 'text' && sameMarks(last.marks, n.marks)) {
      merged[merged.length - 1] = { ...last, text: (last.text ?? '') + (n.text ?? '') };
    } else merged.push(n);
  }
  return merged
    .map((n) => {
      if (n.type === 'text') return wrapMarks(n.text ?? '', n.marks);
      if (n.type === 'hardBreak') return '  \n';
      if (n.type === 'mention') return `[[${titleOf(n.attrs?.id)}]]`;
      if (n.type === 'image') return `![${n.attrs?.alt ?? ''}](${n.attrs?.src ?? ''})`;
      return inline(n.content, titleOf);
    })
    .join('');
}

function prefixLines(text: string, first: string, rest: string): string {
  return text
    .split('\n')
    .map((line, i) => (i === 0 ? first : line ? rest : rest.trimEnd()) + line)
    .join('\n');
}

function listItem(item: JNode, marker: string, titleOf: TitleOf): string {
  const body = (item.content ?? []).map((c) => block(c, titleOf)).join('\n');
  return prefixLines(body, marker, ' '.repeat(marker.length));
}

function cellText(cell: JNode, titleOf: TitleOf): string {
  return (cell.content ?? [])
    .map((p) => inline(p.content, titleOf))
    .join('<br>')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function block(n: JNode, titleOf: TitleOf): string {
  switch (n.type) {
    case 'paragraph':
      return inline(n.content, titleOf);
    case 'heading':
      return `${'#'.repeat(n.attrs?.level ?? 1)} ${inline(n.content, titleOf)}`;
    case 'bulletList':
      return (n.content ?? []).map((i) => listItem(i, '- ', titleOf)).join('\n');
    case 'orderedList': {
      const start = n.attrs?.start ?? 1;
      return (n.content ?? []).map((i, k) => listItem(i, `${start + k}. `, titleOf)).join('\n');
    }
    case 'taskList':
      return (n.content ?? []).map((i) => listItem(i, i.attrs?.checked ? '- [x] ' : '- [ ] ', titleOf)).join('\n');
    case 'blockquote':
      return prefixLines(blocks(n.content, titleOf), '> ', '> ');
    case 'callout':
      return prefixLines(`${n.attrs?.icon ?? '💡'} ${blocks(n.content, titleOf)}`, '> ', '> ');
    case 'codeBlock': {
      const code = (n.content ?? []).map((t) => t.text ?? '').join('');
      const fence = code.includes('```') ? '````' : '```';
      return `${fence}${n.attrs?.language ?? ''}\n${code}\n${fence}`;
    }
    case 'horizontalRule':
      return '---';
    case 'image':
      return `![${n.attrs?.alt ?? ''}](${n.attrs?.src ?? ''})`;
    case 'pageLink':
      return `[[${titleOf(n.attrs?.id)}]]`;
    case 'details': {
      const [summary, content] = n.content ?? [];
      return `<details>\n<summary>${inline(summary?.content, titleOf)}</summary>\n\n${blocks(content?.content, titleOf)}\n\n</details>`;
    }
    case 'table': {
      const rows = (n.content ?? []).map((r) => (r.content ?? []).map((c) => cellText(c, titleOf)));
      if (rows.length === 0) return '';
      const width = Math.max(...rows.map((r) => r.length));
      const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
      const sep = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`;
      return [line(rows[0]), sep, ...rows.slice(1).map(line)].join('\n');
    }
    default:
      return n.content ? blocks(n.content, titleOf) : inline([n], titleOf);
  }
}

function blocks(nodes: JNode[] | undefined, titleOf: TitleOf): string {
  return (nodes ?? []).map((n) => block(n, titleOf)).join('\n\n');
}

export function toMarkdown(doc: JNode, title: string, titleOf: TitleOf): string {
  const body = blocks(doc.content, titleOf).replace(/\n{3,}/g, '\n\n').trim();
  return `# ${title || 'Untitled'}\n\n${body}\n`;
}
