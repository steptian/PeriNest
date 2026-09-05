import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpenText, FlaskConical, RefreshCw, Trash2, Upload } from "lucide-react";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { cropApi, type CropDocument, type CropSearchHit } from "@/api/crop";
import { fmtTime } from "@/utils/format";

const PAGE_SIZE = 15;

/** 嗦囊（Crop）—— 知识库管理：吞入 / 检索 / 消化状态 */
export default function Crop() {
  const qc = useQueryClient();
  const [page] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [delTarget, setDelTarget] = useState<CropDocument | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CropSearchHit[] | null>(null);
  const [mockNote, setMockNote] = useState(false);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["crop", "docs", page],
    queryFn: () => cropApi.list(PAGE_SIZE, (page - 1) * PAGE_SIZE),
  });
  const { data: health } = useQuery({
    queryKey: ["crop", "health"],
    queryFn: cropApi.health,
  });

  const upload = useMutation({
    mutationFn: () => cropApi.create(title, content),
    onSuccess: () => {
      setUploadOpen(false); setTitle(""); setContent("");
      qc.invalidateQueries({ queryKey: ["crop"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => cropApi.remove(id),
    onSuccess: () => { setDelTarget(null); qc.invalidateQueries({ queryKey: ["crop"] }); },
  });
  const rebuild = useMutation({
    mutationFn: cropApi.rebuild,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crop"] }),
  });
  const search = useMutation({
    mutationFn: () => cropApi.search(query, 5),
    onSuccess: (d) => { setHits(d.hits); setMockNote(d.mock); },
  });

  return (
    <div className="space-y-6">
      {/* 标题区 */}
      <div className="flex items-end justify-between">
        <div>
          <p className="specimen-latin mb-1">crop · knowledge</p>
          <h1 className="font-specimen text-2xl font-bold">嗦囊 · 知识库</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            先吞后消化——文本知识向量化入嗦囊，语义检索四端共享
            {health && (
              <span className="ml-2 specimen-latin !text-[9px] opacity-60">
                vectors: {health.count}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => rebuild.mutate()} disabled={rebuild.isPending}
            title="从 MySQL 权威重建 Redis 向量投影"
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${rebuild.isPending ? "animate-spin" : ""}`} />
            重建投影
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="mr-1 h-4 w-4" /> 吞入知识
          </Button>
        </div>
      </div>

      {/* 检索测试框 */}
      <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <FlaskConical className="h-4 w-4 text-primary" /> 检索试验
          <span className="text-xs font-normal text-muted-foreground">（语义查询 top-5）</span>
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
            检索
          </Button>
        </div>
        {hits && (
          <div className="mt-3 space-y-2">
            {mockNote && (
              <p className="text-xs italic text-muted-foreground">
                mock embedding 模式（未配 EMBEDDING_API_KEY）——同词可召回，无语义泛化
              </p>
            )}
            {hits.length === 0 && <p className="text-sm text-muted-foreground">嗦囊空空如也</p>}
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

      {/* 文档列表 */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">标题</th>
              <th className="px-4 py-3">块数</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">吞入时间</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">消化中…</td></tr>}
            {!isLoading && docs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  <BookOpenText className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  嗉囊还是空的——吞入第一份知识吧
                </td>
              </tr>
            )}
            {docs.map((d) => (
              <tr key={d.id} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                <td className="px-4 py-3 font-medium">{d.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{d.chunk_count}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      d.status === "ready"
                        ? "bg-primary/15 text-primary"
                        : d.status === "failed"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmtTime(d.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setDelTarget(d)}>
                    <Trash2 className="h-4 w-4 text-destructive/80" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 上传 Modal */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="吞入知识">
        <div className="space-y-3">
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="标题（如：产品手册 v2）"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
          />
          <textarea
            value={content} onChange={(e) => setContent(e.target.value)}
            placeholder="正文（≥10 字符，空行分段；段落聚合 ~600 字一块）"
            rows={10}
            className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary/60"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setUploadOpen(false)}>取消</Button>
            <Button
              size="sm" disabled={title.trim().length < 1 || content.trim().length < 10 || upload.isPending}
              onClick={() => upload.mutate()}
            >
              {upload.isPending ? "消化中…" : "吞入"}
            </Button>
          </div>
          {upload.isError && (
            <p className="text-xs text-destructive">{String(upload.error)}</p>
          )}
        </div>
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!delTarget}
        title="吐出这份知识？"
        message={`「${delTarget?.title}」及其 ${delTarget?.chunk_count} 个分块将从权威库与向量投影中一并删除。`}
        onCancel={() => setDelTarget(null)}
        onConfirm={() => delTarget && remove.mutate(delTarget.id)}
      />
    </div>
  );
}
