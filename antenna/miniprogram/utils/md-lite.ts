/**
 * md-lite —— 轻量 markdown 结构化解析（AI 对话渲染用，三端同源复制）。
 *
 * 覆盖 AI 回答实际子集：围栏代码块 / #~### 标题 / - * 1. 列表 / > 引用 /
 * --- 分隔 / 段落；行内：**加粗** / *斜体* / `代码` / [文本](链接)。
 * 输出结构化块数组（非 HTML 字符串）——React/wxml 按块渲染，天然防注入；
 * 流式友好：每次对全文全量重解析（未闭合代码块按普通段落兜底）。
 */

export interface InlineRun { t: "text" | "bold" | "italic" | "code" | "link"; s: string; href?: string }
export interface MdBlock {
  type: "code" | "h" | "list" | "quote" | "hr" | "p";
  lang?: string;
  level?: number;
  ordered?: boolean;
  items?: InlineRun[][];
  runs?: InlineRun[];
  text?: string;
}

const INLINE_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;

export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const i = m.index ?? 0;
    if (i > last) runs.push({ t: "text", s: text.slice(last, i) });
    const tok = m[0];
    if (tok.startsWith("**")) runs.push({ t: "bold", s: tok.slice(2, -2) });
    else if (tok.startsWith("`")) runs.push({ t: "code", s: tok.slice(1, -1) });
    else if (tok.startsWith("[")) {
      const cut = tok.indexOf("](");
      runs.push({ t: "link", s: tok.slice(1, cut), href: tok.slice(cut + 2, -1) });
    } else runs.push({ t: "italic", s: tok.slice(1, -1) });
    last = i + tok.length;
  }
  if (last < text.length) runs.push({ t: "text", s: text.slice(last) });
  return runs.length ? runs : [{ t: "text", s: "" }];
}

export function parseMd(src: string): MdBlock[] {
  const lines = src.split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // 围栏代码块
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过闭合（未闭合=流式中，按已到内容渲染）
      blocks.push({ type: "code", lang: fence[1] || "", text: buf.join("\n") });
      continue;
    }
    // 标题
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      blocks.push({ type: "h", level: h[1].length, runs: parseInline(h[2]) });
      i += 1;
      continue;
    }
    // 分隔线
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }
    // 引用
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i += 1;
      }
      blocks.push({ type: "quote", runs: parseInline(buf.join(" ")) });
      continue;
    }
    // 列表（- / * / 1. 连续行，含缩进子内容并入该项）
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: InlineRun[][] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "")));
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    // 空行跳过；其余=段落（连续非空行合并）
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const buf: string[] = [line];
    i += 1;
    while (
      i < lines.length && lines[i].trim() &&
      !/^```|^#{1,3}\s|^\s*([-*]|\d+\.)\s|^> |^(-{3,}|\*{3,})\s*$/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "p", runs: parseInline(buf.join("\n")) });
  }
  return blocks;
}
