import { Fragment } from "react";
import { parseInlineTokens, parseMarkdownBlocks } from "@/lib/markdown-steps";

function renderInline(text: string) {
  const tokens = parseInlineTokens(text);
  return tokens.map((token, idx) => {
    if (token.type === "code") {
      return (
        <code
          key={idx}
          className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--foreground)]"
        >
          {token.value}
        </code>
      );
    }
    if (token.type === "bold") {
      return (
        <strong key={idx} className="font-semibold text-[var(--foreground)]">
          {token.value}
        </strong>
      );
    }
    return <Fragment key={idx}>{token.value}</Fragment>;
  });
}

export default function MarkdownSteps({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const blocks = parseMarkdownBlocks(content);
  if (blocks.length === 0) return null;

  return (
    <div className={`space-y-2.5 text-sm text-[var(--secondary)] ${className}`.trim()}>
      {blocks.map((block, idx) => {
        if (block.type === "heading") {
          const headingStyle =
            block.level === 1
              ? "text-base font-semibold text-[var(--foreground)]"
              : block.level === 2
                ? "text-sm font-semibold text-[var(--foreground)]"
                : "text-xs font-semibold uppercase tracking-wide text-[var(--muted)]";
          return (
            <p key={idx} className={headingStyle}>
              {renderInline(block.text)}
            </p>
          );
        }

        if (block.type === "ordered-list") {
          return (
            <ol key={idx} className="space-y-1.5">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start gap-2.5 leading-relaxed">
                  <span className="tabular-nums mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-800">
                    {itemIdx + 1}
                  </span>
                  <span className="min-w-0 flex-1">{renderInline(item)}</span>
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === "unordered-list") {
          return (
            <ul key={idx} className="list-disc space-y-1 pl-5 leading-relaxed">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "code") {
          return (
            <div
              key={idx}
              className="overflow-hidden rounded-lg border bg-[var(--surface-muted)]"
            >
              {block.language && (
                <div className="border-b px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  {block.language}
                </div>
              )}
              <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-[var(--foreground)]">
                <code>{block.code}</code>
              </pre>
            </div>
          );
        }

        return (
          <p key={idx} className="leading-relaxed">
            {block.lines.map((line, lineIdx) => (
              <Fragment key={lineIdx}>
                {lineIdx > 0 && <br />}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
