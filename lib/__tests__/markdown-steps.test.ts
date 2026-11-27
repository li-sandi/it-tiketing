import { describe, expect, it } from "vitest";
import { parseInlineTokens, parseMarkdownBlocks } from "@/lib/markdown-steps";

describe("lib/markdown-steps", () => {
  it("parses ordered steps, bullet lists, headings, and fenced code blocks", () => {
    const content = [
      "## Langkah Reset DNS",
      "",
      "1. Buka `cmd` lalu jalankan **flushdns**.",
      "2. Periksa koneksi ke server internal.",
      "",
      "```bash",
      "ipconfig /flushdns",
      "ping 10.0.0.1",
      "```",
      "",
      "- Pastikan kabel LAN terpasang",
      "- Hubungi IT jika masih gagal",
    ].join("\n");

    const blocks = parseMarkdownBlocks(content);
    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "Langkah Reset DNS" },
      {
        type: "ordered-list",
        items: [
          "Buka `cmd` lalu jalankan **flushdns**.",
          "Periksa koneksi ke server internal.",
        ],
      },
      {
        type: "code",
        language: "bash",
        code: "ipconfig /flushdns\nping 10.0.0.1",
      },
      {
        type: "unordered-list",
        items: [
          "Pastikan kabel LAN terpasang",
          "Hubungi IT jika masih gagal",
        ],
      },
    ]);
  });

  it("handles unclosed code fences, empty inputs, and preserves HTML tags as plain text", () => {
    expect(parseMarkdownBlocks("   \n  ")).toEqual([]);
    expect(parseInlineTokens("")).toEqual([]);

    const unclosed = parseMarkdownBlocks("```\n<script>alert(1)</script>");
    expect(unclosed).toEqual([
      {
        type: "code",
        language: null,
        code: "<script>alert(1)</script>",
      },
    ]);

    const inline = parseInlineTokens("Cek `chrome://net-internals/#dns` lalu **Restart**");
    expect(inline).toEqual([
      { type: "text", value: "Cek " },
      { type: "code", value: "chrome://net-internals/#dns" },
      { type: "text", value: " lalu " },
      { type: "bold", value: "Restart" },
    ]);
  });
});
