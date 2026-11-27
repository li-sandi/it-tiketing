export type InlineToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "bold"; value: string };

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "ordered-list"; items: string[] }
  | { type: "unordered-list"; items: string[] }
  | { type: "code"; language: string | null; code: string }
  | { type: "paragraph"; lines: string[] };

const ORDERED_ITEM_RE = /^\d+[.)]\s+(.+)$/;
const UNORDERED_ITEM_RE = /^[-*•]\s+(.+)$/;
const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const FENCE_RE = /^```([a-zA-Z0-9_-]+)?\s*$/;

export function parseInlineTokens(text: string): InlineToken[] {
  if (!text) return [];
  const tokens: InlineToken[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, idx) });
    }
    const raw = match[0];
    if (raw.startsWith("`") && raw.endsWith("`") && raw.length >= 2) {
      tokens.push({ type: "code", value: raw.slice(1, -1) });
    } else if (raw.startsWith("**") && raw.endsWith("**") && raw.length >= 4) {
      tokens.push({ type: "bold", value: raw.slice(2, -2) });
    } else {
      tokens.push({ type: "text", value: raw });
    }
    lastIndex = idx + raw.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  return tokens;
}

export function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  if (!content || !content.trim()) return [];
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const fenceMatch = trimmed.match(FENCE_RE);
    if (fenceMatch) {
      const language = fenceMatch[1] ? fenceMatch[1].trim() : null;
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && lines[i].trim().startsWith("```")) {
        i += 1;
      }
      blocks.push({ type: "code", language, code: codeLines.join("\n") });
      continue;
    }

    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      const level = Math.min(3, headingMatch[1].length) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, text: headingMatch[2].trim() });
      i += 1;
      continue;
    }

    if (ORDERED_ITEM_RE.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i].trim();
        const match = current.match(ORDERED_ITEM_RE);
        if (!match) break;
        items.push(match[1].trim());
        i += 1;
      }
      blocks.push({ type: "ordered-list", items });
      continue;
    }

    if (UNORDERED_ITEM_RE.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i].trim();
        const match = current.match(UNORDERED_ITEM_RE);
        if (!match) break;
        items.push(match[1].trim());
        i += 1;
      }
      blocks.push({ type: "unordered-list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const currentTrimmed = lines[i].trim();
      if (
        !currentTrimmed ||
        FENCE_RE.test(currentTrimmed) ||
        HEADING_RE.test(currentTrimmed) ||
        ORDERED_ITEM_RE.test(currentTrimmed) ||
        UNORDERED_ITEM_RE.test(currentTrimmed)
      ) {
        break;
      }
      paragraphLines.push(lines[i].trimEnd());
      i += 1;
    }
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", lines: paragraphLines });
    }
  }

  return blocks;
}
