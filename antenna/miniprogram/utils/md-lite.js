"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseInline = parseInline;
exports.parseMd = parseMd;
const INLINE_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;
function parseInline(text) {
    const runs = [];
    let last = 0;
    for (const m of text.matchAll(INLINE_RE)) {
        const i = m.index ?? 0;
        if (i > last)
            runs.push({ t: "text", s: text.slice(last, i) });
        const tok = m[0];
        if (tok.startsWith("**"))
            runs.push({ t: "bold", s: tok.slice(2, -2) });
        else if (tok.startsWith("`"))
            runs.push({ t: "code", s: tok.slice(1, -1) });
        else if (tok.startsWith("[")) {
            const cut = tok.indexOf("](");
            runs.push({ t: "link", s: tok.slice(1, cut), href: tok.slice(cut + 2, -1) });
        }
        else
            runs.push({ t: "italic", s: tok.slice(1, -1) });
        last = i + tok.length;
    }
    if (last < text.length)
        runs.push({ t: "text", s: text.slice(last) });
    return runs.length ? runs : [{ t: "text", s: "" }];
}
function parseMd(src) {
    const lines = src.split("\n");
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const fence = line.match(/^```(\w*)\s*$/);
        if (fence) {
            const buf = [];
            i += 1;
            while (i < lines.length && !lines[i].startsWith("```")) {
                buf.push(lines[i]);
                i += 1;
            }
            i += 1;
            blocks.push({ type: "code", lang: fence[1] || "", text: buf.join("\n") });
            continue;
        }
        const h = line.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
            blocks.push({ type: "h", level: h[1].length, runs: parseInline(h[2]) });
            i += 1;
            continue;
        }
        if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
            blocks.push({ type: "hr" });
            i += 1;
            continue;
        }
        if (line.startsWith("> ")) {
            const buf = [];
            while (i < lines.length && lines[i].startsWith("> ")) {
                buf.push(lines[i].slice(2));
                i += 1;
            }
            blocks.push({ type: "quote", runs: parseInline(buf.join(" ")) });
            continue;
        }
        if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
            const ordered = /^\s*\d+\./.test(line);
            const items = [];
            while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
                items.push(parseInline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "")));
                i += 1;
            }
            blocks.push({ type: "list", ordered, items });
            continue;
        }
        if (!line.trim()) {
            i += 1;
            continue;
        }
        const buf = [line];
        i += 1;
        while (i < lines.length && lines[i].trim() &&
            !/^```|^#{1,3}\s|^\s*([-*]|\d+\.)\s|^> |^(-{3,}|\*{3,})\s*$/.test(lines[i])) {
            buf.push(lines[i]);
            i += 1;
        }
        blocks.push({ type: "p", runs: parseInline(buf.join("\n")) });
    }
    return blocks;
}
