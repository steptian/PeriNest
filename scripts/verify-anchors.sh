#!/usr/bin/env bash
# verify-anchors.sh — 扫 Agent Wiki 文档里的代码锚点，验证是否仍有效
# 对冲 mem0 说的"旧信息"限制：错误 wiki 比没 wiki 糟。
#
# 用法:
#   ./verify-anchors.sh [docs_dir] [code_root]
#   docs_dir:  wiki 文档目录（默认 docs/agent）
#   code_root: 代码根目录（默认 . ，即当前目录）
#
# 锚点格式（md 里两种都认）:
#   规范:  method@path/to/file.ext:行号        例: approval@crm/model/ApprovalModel.php:336
#   兼容:  `path/to/file.ext:行号`             （反引号包裹的代码引用）
#
# 检查: 文件是否存在 + 行号是否越界。失效项列出，便于"遗忘/修正"。
set -euo pipefail

DOCS_DIR="${1:-docs/agent}"
CODE_ROOT="${2:-.}"

if [ ! -d "$DOCS_DIR" ]; then
  echo "❌ 文档目录不存在: $DOCS_DIR"
  exit 1
fi

EXTS='php|py|js|ts|jsx|tsx|go|java|kt|rb|rs|swift|c|cpp|cc|h|cs|scala|clj|ex|exs|erl|lua|pl|sh|vue|sql'

echo "=== 扫描 $DOCS_DIR 的代码锚点 (code_root=$CODE_ROOT) ==="

# 两种锚点: @path:line  或  `path:line`(反引号边界)
anchors=$(grep -rhoE "(@[a-zA-Z0-9_./-]+\.($EXTS):[0-9]+)|(\`[a-zA-Z0-9_./-]+\.($EXTS):[0-9]+\`)" "$DOCS_DIR" 2>/dev/null \
  | sed -e 's/^[^@]*@//' -e 's/^`//' -e 's/`$//' | sort -u || true)

if [ -z "$anchors" ]; then
  echo "ℹ️  未找到锚点"
  echo "   规范格式: method@path/file.ext:行号"
  echo "   兼容格式: \`path/file.ext:行号\`"
  echo "   wiki 文档应给每条 ✅ 结论标注代码出处"
  exit 0
fi

total=0; ok=0; fail=0; fails=""

while IFS= read -r ref; do
  total=$((total + 1))
  file="${ref%:*}"
  line="${ref##*:}"
  fullpath="$CODE_ROOT/$file"
  # 裸文件名自动定位：wiki 里常写 tool_probe.py 而实际在 backend/ 或子目录——唯一命中即视为有效
  if [ ! -f "$fullpath" ]; then
    base="$(basename "$file")"
    hits=$(find "$CODE_ROOT" -type f -name "$base" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/weknora-src/*" 2>/dev/null)
    hit_count=$(echo -n "$hits" | grep -c . || true)
    if [ "$hit_count" -eq 1 ]; then
      fullpath="$hits"
    elif [ "$hit_count" -gt 1 ]; then
      fail=$((fail + 1)); fails="${fails}\n  ⚠️  多处同名，需写全路径: $ref"; continue
    else
      fail=$((fail + 1)); fails="${fails}\n  ❌ 文件不存在: $ref"; continue
    fi
  fi
  total_lines=$(wc -l < "$fullpath" | tr -d ' ')
  if [ "$line" -gt "$total_lines" ]; then
    fail=$((fail + 1)); fails="${fails}\n  ⚠️  行号越界: $ref (文件仅 $total_lines 行)"; continue
  fi
  ok=$((ok + 1))
done <<< "$anchors"

echo "-----------------------------"
echo "总计 $total 锚点 | ✅ 有效 $ok | ❌ 失效 $fail"
if [ "$fail" -gt 0 ]; then
  echo -e "失效清单（需修正或遗忘）:$fails"
  echo "-----------------------------"
  echo "💡 失效=代码已变，wiki 过时。按 code-to-agents「检查阶段」修正或删除该段。"
  exit 2
fi
echo "✅ 所有锚点有效，wiki 与代码同步。"
