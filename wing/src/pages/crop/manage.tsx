import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpenText, FileDown, FileUp, RefreshCw, Trash2, Upload } from "lucide-react";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { cropApi, type CropDocument } from "@/api/crop";
import { fmtTime } from "@/utils/format";

const PAGE_SIZE = 15;

/** 文档状态中文显示 */
const STATUS_LABEL: Record<string, string> = {
  ready: "已入库",
  processing: "处理中",
  failed: "失败",
};

/** Tab 1 · 知识库管理：文档入库 / 分块预览 / 删除 / 向量投影重建 */
export function ManagePane() {
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [delTarget, setDelTarget] = useState<CropDocument | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [visibleRoles, setVisibleRoles] = useState("");  // 权限分域：空=全库共享

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["crop", "docs"],
    queryFn: () => cropApi.list(PAGE_SIZE, 0),
  });

  const uploadFile = useMutation({
    mutationFn: (f: File) => cropApi.upload(f, title.trim() || undefined, visibleRoles || undefined),
    onSuccess: () => { setUploadOpen(false); setTitle(""); setVisibleRoles(""); qc.invalidateQueries({ queryKey: ["crop"] }); },
  });
  const upload = useMutation({
    mutationFn: () => cropApi.create(title, content, "text", visibleRoles || undefined),
    onSuccess: () => {
      setUploadOpen(false); setTitle(""); setContent(""); setVisibleRoles("");
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

  const counts = docs.reduce<Record<string, number>>((m, d) => ((m[d.status] = (m[d.status] ?? 0) + 1), m), {});

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden glass rounded-2xl">
        {/* 卡片头：统计 + 运维动作 */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">文档列表</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isLoading ? "加载中…" : `${docs.length} 份文档`}
              {counts.ready ? ` · ${counts.ready} 份已入库` : ""}
              {counts.failed ? ` · ${counts.failed} 份失败` : ""}
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => rebuild.mutate()} disabled={rebuild.isPending}
              title="从 MySQL 权威库全量重建 Redis 向量投影"
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${rebuild.isPending ? "animate-spin" : ""}`} />
              重建向量
            </Button>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-1 h-4 w-4" /> 上传文档
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">标题</th>
              <th className="px-4 py-3">块数</th>
              <th className="px-4 py-3">可见范围</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">入库时间</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">加载中…</td></tr>}
            {!isLoading && docs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  <BookOpenText className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  知识库还是空的——上传第一份文档吧
                </td>
              </tr>
            )}
            {docs.map((d) => (
              <tr key={d.id} className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-muted/40" onClick={() => setPreviewId(d.id)}>
                <td className="px-4 py-3 font-medium">{d.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{d.chunk_count}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{d.visible_roles || "全库共享"}</td>
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
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmtTime(d.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDelTarget(d); }}>
                    <Trash2 className="h-4 w-4 text-destructive/80" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>

      {/* 上传 Modal */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="上传文档">
        <div className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-background/60 px-4 py-5 text-center transition-colors hover:border-primary/50">
            <FileUp className="h-5 w-5 text-primary/70" />
            <span className="text-sm">点击选择文件</span>
            <span className="text-[11px] text-muted-foreground">txt / md / pdf / docx · ≤10MB（扫描件 PDF 请先粘贴文本）</span>
            <input
              type="file" accept=".txt,.md,.markdown,.pdf,.docx" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile.mutate(f); }}
            />
          </label>
          {uploadFile.isPending && <p className="text-xs text-muted-foreground">入库中（提取+向量化）…</p>}
          {uploadFile.isError && <p className="text-xs text-red-500">{String(uploadFile.error).slice(0, 160)}</p>}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="specimen-latin !text-[8px]">or paste</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="标题（如：产品手册 v2）"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
          />
          <input
            value={visibleRoles} onChange={(e) => setVisibleRoles(e.target.value)}
            placeholder="可见角色（如 operator,wing；留空=全库共享；admin 恒全量）"
            title="权限分域：检索前过滤——不在可见角色内的用户检索不到该文档"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary/60"
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
              {upload.isPending ? "入库中…" : "上传"}
            </Button>
          </div>
          {upload.isError && (
            <p className="text-xs text-destructive">{String(upload.error)}</p>
          )}
        </div>
      </Modal>

      {previewId !== null && <DocPreview docId={previewId} onClose={() => setPreviewId(null)} />}

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!delTarget}
        title="删除这份文档？"
        message={`「${delTarget?.title}」及其 ${delTarget?.chunk_count} 个分块将从权威库与向量投影中一并删除。`}
        onCancel={() => setDelTarget(null)}
        onConfirm={() => delTarget && remove.mutate(delTarget.id)}
      />
    </div>
  );
}

/** 文档预览：chunks 分块浏览 + 源文件查看 */
function DocPreview({ docId, onClose }: { docId: number; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["crop", "detail", docId],
    queryFn: () => cropApi.detail(docId),
  });
  const doc = data?.document;
  const hasFile = doc && (doc as CropDocument & { original_filename?: string }).original_filename !== undefined
    && (doc as CropDocument & { original_filename?: string }).original_filename !== null;

  return (
    <Modal open onClose={onClose} title={doc?.title ?? "文档预览"} width="w-[720px]">
      {!doc && <p className="text-sm text-muted-foreground">加载中…</p>}
      {doc && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-primary/35 px-2 py-0.5 text-primary">{doc.source_type}</span>
              <span>{doc.chunk_count} 块</span>
              <span>· {fmtTime(doc.created_at)}</span>
            </div>
            {hasFile && (
              <button
                className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs hover:bg-muted"
                onClick={() => cropApi.openFile(docId)}
                title="新窗预览/下载上传原件"
              >
                <FileDown className="h-3.5 w-3.5" /> 查看源文件
              </button>
            )}
          </div>
          <div className="max-h-[55vh] space-y-2.5 overflow-y-auto pr-1">
            {(data?.chunks ?? []).map((c) => (
              <div key={c.seq} className="rounded-xl border border-border/60 bg-background/60 p-3">
                <p className="specimen-latin mb-1 !text-[8px]">chunk #{c.seq}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{c.content}</p>
              </div>
            ))}
            {(data?.chunks ?? []).length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">无分块（入库失败？查看状态与错误信息）</p>
            )}
          </div>
          {doc.error && <p className="text-xs text-red-500">入库错误：{doc.error}</p>}
        </div>
      )}
    </Modal>
  );
}
