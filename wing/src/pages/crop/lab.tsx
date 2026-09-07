import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cropApi, type CropSearchHit } from "@/api/crop";

/** Tab 3 · 检索试验：语义命中测试（与库管理分开，便于调试验证） */
export function LabPane() {
  const { t } = useTranslation();
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
        <FlaskConical className="h-4 w-4 text-primary" /> {t("crop.lab.title")}
        <span className="text-xs font-normal text-muted-foreground">{t("crop.lab.top5")}</span>
        {health && (
          <span className="specimen-latin ml-auto !text-[9px] text-muted-foreground" title={t("crop.lab.vectorsHint")}>
            vectors: {health.count}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && query.trim() && search.mutate()}
          placeholder={t("crop.lab.placeholder")}
          className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
        />
        <Button size="sm" onClick={() => search.mutate()} disabled={!query.trim() || search.isPending}>
          {search.isPending ? t("crop.lab.searching") : t("crop.lab.search")}
        </Button>
      </div>
      {hits && (
        <div className="mt-3 space-y-2">
          {mockNote && (
            <p className="text-xs italic text-muted-foreground">
              {t("crop.lab.mockNote")}
            </p>
          )}
          {hits.length === 0 && <p className="text-sm text-muted-foreground">{t("crop.lab.noResults")}</p>}
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
