import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cropApi, type CropSearchHit } from "@/api/crop";

/** Tab 3 · 检索试验：语义命中测试（与库管理分开，便于调试验证） */
export function LabPane() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CropSearchHit[] | null>(null);
  const [mockNote, setMockNote] = useState(false);
  const { data: health } = useQuery({
    queryKey: ["crop", "health"],
    queryFn: cropApi.health,
  });
  const search = useMutation({
    mutationFn: () => cropApi.search(query, 5),
    onSuccess: (d) => { setHits(d.hits); setMockNote(d.mock); },
  });

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <FlaskConical className="h-4 w-4 text-primary" /> 语义检索试验
        <span className="text-xs font-normal text-muted-foreground">（top-5 命中验证）</span>
        {health && (
          <span className="specimen-latin ml-auto !text-[9px] text-muted-foreground" title="Redis 向量投影内块数">
            vectors: {health.count}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && query.trim() && search.mutate()}
          placeholder="试试：知识库怎么用 / 设计语言是什么…"
          className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
        />
        <Button size="sm" onClick={() => search.mutate()} disabled={!query.trim() || search.isPending}>
          {search.isPending ? "检索中…" : "检索"}
        </Button>
      </div>
      {hits && (
        <div className="mt-3 space-y-2">
          {mockNote && (
            <p className="text-xs italic text-muted-foreground">
              mock embedding 模式（未配 EMBEDDING_API_KEY）——同词可召回，无语义泛化
            </p>
          )}
          {hits.length === 0 && <p className="text-sm text-muted-foreground">没有找到相关内容</p>}
          {hits.map((h) => (
            <div key={h.chunk_id} className="rounded-xl border border-border/60 bg-background/60 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">{h.document_title} · #{h.seq}</span>
                <span className="specimen-latin !text-[9px]">sim {h.score.toFixed(3)}</span>
              </div>
              <p className="line-clamp-3 text-sm leading-relaxed">{h.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
