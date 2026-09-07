import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpenText, FileDown, FileText, FileUp, Layers, ListPlus, RefreshCw, RotateCcw, Trash2, Upload, X,
} from "lucide-react";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { cropApi, type CropDocument } from "@/api/crop";
import { fmtSize, fmtTime } from "@/utils/format";

const PAGE_SIZE = 15;
/** 处理中状态的轮询间隔（ms）：有 queued/embedding 文档时自动刷新直到消化完 */
const BUSY_POLL_MS = 2000;

/** 文档状态 → i18n key */
const STATUS_KEY: Record<string, string> = {
  ready: "crop.status.ready",
  processing: "crop.status.processing",
  queued: "crop.status.queued",
  embedding: "crop.status.embedding",
  failed: "crop.status.failed",
};

/** Tab 1 · 知识库管理：单/批量入库、分块预览、删除、向量投影重建 */
export function ManagePane() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [delTarget, setDelTarget] = useState<CropDocument | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [visibleRoles, setVisibleRoles] = useState("");  // 权限分域：空=全库共享

  const { data: stats } = useQuery({
    queryKey: ["crop", "stats"],
    queryFn: cropApi.stats,
    refetchInterval: (q) => (q.state.data && q.state.data.pending > 0 ? BUSY_POLL_MS : false),
  });
  const hasPending = (stats?.pending ?? 0) > 0;

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["crop", "docs"],
    queryFn: () => cropApi.list(PAGE_SIZE, 0),
    refetchInterval: hasPending ? BUSY_POLL_MS : false,
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
  const retryDoc = useMutation({
    mutationFn: (id: number) => cropApi.retry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crop"] }),
  });

  const counts = docs.reduce<Record<string, number>>((m, d) => ((m[d.status] = (m[d.status] ?? 0) + 1), m), {});

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden glass rounded-2xl">
        {/* 卡片头：统计 + 入库/运维动作 */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("crop.manage.listTitle")}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {isLoading ? t("crop.manage.loading") : t("crop.manage.docCount", { n: docs.length })}
              {counts.ready ? t("crop.manage.readyCount", { n: counts.ready }) : ""}
              {(stats?.pending ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-primary">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  {t("crop.manage.pendingLine", { n: stats?.pending })}
                </span>
              )}
              {(stats?.failed ?? 0) > 0 && <span className="text-destructive">{t("crop.manage.failedCount", { n: stats?.failed })}</span>}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline" size="sm" onClick={() => setBatchOpen(true)}
              title={t("crop.manage.batchImportHint")}
            >
              <ListPlus className="mr-1 h-4 w-4" /> {t("crop.manage.batchImport")}
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => rebuild.mutate()} disabled={rebuild.isPending || hasPending}
              title={t("crop.manage.rebuildHint")}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${rebuild.isPending ? "animate-spin" : ""}`} />
              {t("crop.manage.rebuildVec")}
            </Button>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-1 h-4 w-4" /> {t("crop.manage.uploadDoc")}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t("crop.manage.colTitle")}</th>
              <th className="px-4 py-3">{t("crop.manage.colChunks")}</th>
              <th className="px-4 py-3">{t("crop.manage.colScope")}</th>
              <th className="px-4 py-3">{t("crop.manage.colStatus")}</th>
              <th className="px-4 py-3">{t("crop.manage.colTime")}</th>
              <th className="px-4 py-3 text-right">{t("crop.manage.colOp")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{t("crop.manage.loading")}</td></tr>}
            {!isLoading && docs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  <BookOpenText className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  {t("crop.manage.empty")}
                </td>
              </tr>
            )}
            {docs.map((d) => (
              <tr key={d.id} className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-muted/40" onClick={() => setPreviewId(d.id)}>
                <td className="max-w-[300px] truncate px-4 py-3 font-medium" title={d.error ?? undefined}>{d.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{d.status === "ready" ? d.chunk_count : "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{d.visible_roles || t("crop.manage.shared")}</td>
                <td className="px-4 py-3">
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${
                      d.status === "ready"
                        ? "bg-primary/15 text-primary"
                        : d.status === "failed"
                          ? "bg-destructive/15 text-destructive"
                          : d.status === "queued"
                            ? "bg-muted text-muted-foreground"
                            : "bg-primary/10 text-primary"
                    }`}
                  >
                    {t(STATUS_KEY[d.status] ?? d.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmtTime(d.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  {d.status === "failed" && (
                    <Button
                      variant="ghost" size="sm"
                      onClick={(e) => { e.stopPropagation(); retryDoc.mutate(d.id); }}
                      disabled={retryDoc.isPending}
                      title={t("crop.manage.retryHint")}
                    >
                      <RotateCcw className="h-4 w-4 text-primary/80" />
                    </Button>
                  )}
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

      {/* 单文档上传 Modal */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title={t("crop.manage.modalTitle")}>
        <div className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-background/60 px-4 py-5 text-center transition-colors hover:border-primary/50">
            <FileUp className="h-5 w-5 text-primary/70" />
            <span className="text-sm">{t("crop.manage.pickFile")}</span>
            <span className="text-[11px] text-muted-foreground">{t("crop.manage.fileHint")}</span>
            <input
              type="file" accept=".txt,.md,.markdown,.pdf,.docx" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile.mutate(f); }}
            />
          </label>
          {uploadFile.isPending && <p className="text-xs text-muted-foreground">{t("crop.manage.ingesting")}</p>}
          {uploadFile.isError && <p className="text-xs text-red-500">{String(uploadFile.error).slice(0, 160)}</p>}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="specimen-latin !text-[8px]">or paste</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={t("crop.manage.titlePh")}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
          />
          <input
            value={visibleRoles} onChange={(e) => setVisibleRoles(e.target.value)}
            placeholder={t("crop.manage.rolesPh")}
            title={t("crop.manage.rolesHint")}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary/60"
          />
          <textarea
            value={content} onChange={(e) => setContent(e.target.value)}
            placeholder={t("crop.manage.contentPh")}
            rows={10}
            className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary/60"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setUploadOpen(false)}>{t("crop.manage.cancel")}</Button>
            <Button
              size="sm" disabled={title.trim().length < 1 || content.trim().length < 10 || upload.isPending}
              onClick={() => upload.mutate()}
            >
              {upload.isPending ? t("crop.manage.uploading") : t("crop.manage.upload")}
            </Button>
          </div>
          {upload.isError && (
            <p className="text-xs text-destructive">{String(upload.error)}</p>
          )}
        </div>
      </Modal>

      {/* 批量导入 Modal（多文件 → 202 排队 → 后台消化） */}
      <BatchModal open={batchOpen} onClose={() => setBatchOpen(false)} onSubmitted={() => qc.invalidateQueries({ queryKey: ["crop"] })} />

      {previewId !== null && <DocPreview docId={previewId} onClose={() => setPreviewId(null)} />}

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!delTarget}
        title={t("crop.manage.delTitle")}
        message={t("crop.manage.delMsg", { title: delTarget?.title, n: delTarget?.chunk_count })}
        onCancel={() => setDelTarget(null)}
        onConfirm={() => delTarget && remove.mutate(delTarget.id)}
      />
    </div>
  );
}

/* ============ 批量导入：多文件选择 + 入队即回 + rejected 明细 ============ */

function BatchModal({ open, onClose, onSubmitted }: { open: boolean; onClose: () => void; onSubmitted: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [visibleRoles, setVisibleRoles] = useState("");
  const [note, setNote] = useState("");
  const [warn, setWarn] = useState("");

  const submit = useMutation({
    mutationFn: () => cropApi.batchUpload(files, visibleRoles || undefined),
    onSuccess: (r) => {
      const rejectedText = r.rejected.length
        ? t("crop.manage.noteRejected", { n: r.rejected.length, names: r.rejected.map((x) => x.filename).join("、") })
        : "";
      setNote(t("crop.manage.notePrefix", { n: r.accepted, rej: rejectedText }));
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      setWarn("");
      onSubmitted();
      qc.invalidateQueries({ queryKey: ["crop", "stats"] });
      qc.invalidateQueries({ queryKey: ["crop", "docs"] });
    },
    onError: (e) => setWarn(String(e).slice(0, 200)),
  });

  function pick(list: FileList | null) {
    if (!list?.length) return;
    const oversized = [...list].filter((f) => f.size > 10 * 1024 * 1024).map((f) => f.name);
    const ok = [...list].filter((f) => f.size <= 10 * 1024 * 1024);
    setWarn(oversized.length ? t("crop.manage.oversized", { names: oversized.join("、") }) : "");
    setFiles((prev) => [...prev, ...ok]);
  }

  function close() {
    if (submit.isPending) return;
    setNote(""); setFiles([]); setVisibleRoles("");
    if (inputRef.current) inputRef.current.value = "";
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title={t("crop.manage.batchTitle")} width="w-[560px]">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          <Layers className="mr-1 inline h-3.5 w-3.5 text-primary/70" />
          {t("crop.manage.batchHow", {
            q: t("crop.status.queued"), e: t("crop.status.embedding"), r: t("crop.status.ready"),
          })}
        </p>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-background/60 px-4 py-6 text-center transition-colors hover:border-primary/50">
          <ListPlus className="h-5 w-5 text-primary/70" />
          <span className="text-sm">{t("crop.manage.pickMultiple")}</span>
          <span className="text-[11px] text-muted-foreground">{t("crop.manage.pickMultipleHint")}</span>
          <input ref={inputRef} type="file" multiple accept=".txt,.md,.markdown,.pdf,.docx" className="hidden"
            onChange={(e) => pick(e.target.files)} />
        </label>

        {files.length > 0 && (
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border/60 p-2">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/60">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-muted-foreground">{fmtSize(f.size)}</span>
                <button
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  title={t("crop.manage.remove")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          value={visibleRoles} onChange={(e) => setVisibleRoles(e.target.value)}
          placeholder={t("crop.manage.rolesPhBatch")}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary/60"
        />

        {warn && <p className="text-xs text-amber-600">{warn}</p>}
        {note && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-sm text-primary">
            {note}
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("crop.manage.noteAppend")}</p>
          </div>
        )}
        {submit.isError && !warn && <p className="text-xs text-destructive">{String(submit.error)}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={close}>{t("crop.manage.close")}</Button>
          <Button
            size="sm" onClick={() => submit.mutate()}
            disabled={files.length === 0 || submit.isPending}
          >
            {submit.isPending ? t("crop.manage.enqueueing") : t("crop.manage.enqueue", { n: files.length })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** 文档预览：chunks 分块浏览 + 源文件查看 */
function DocPreview({ docId, onClose }: { docId: number; onClose: () => void }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["crop", "detail", docId],
    queryFn: () => cropApi.detail(docId),
  });
  const doc = data?.document;
  const hasFile = doc && (doc as CropDocument & { original_filename?: string }).original_filename !== undefined
    && (doc as CropDocument & { original_filename?: string }).original_filename !== null;

  return (
    <Modal open onClose={onClose} title={doc?.title ?? t("crop.manage.previewTitle")} width="w-[720px]">
      {!doc && <p className="text-sm text-muted-foreground">{t("crop.manage.loading")}</p>}
      {doc && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-primary/35 px-2 py-0.5 text-primary">{doc.source_type}</span>
              <span>{t("crop.manage.chunks", { n: doc.chunk_count })}</span>
              <span>· {fmtTime(doc.created_at)}</span>
            </div>
            {hasFile && (
              <button
                className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs hover:bg-muted"
                onClick={() => cropApi.openFile(docId)}
                title={t("crop.manage.openSourceHint")}
              >
                <FileDown className="h-3.5 w-3.5" /> {t("crop.manage.openSource")}
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
              <p className="py-6 text-center text-xs text-muted-foreground">{t("crop.manage.noChunks")}</p>
            )}
          </div>
          {doc.error && <p className="text-xs text-red-500">{t("crop.manage.ingestErr", { err: doc.error })}</p>}
        </div>
      )}
    </Modal>
  );
}
