import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpenText, FileDown, FileUp, FlaskConical, MessagesSquare, RefreshCw, Trash2, Upload } from "lucide-react";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { agentApi, askStream, auditApi, cropApi, type AuditItem, type CropDocument, type CropSearchHit } from "@/api/crop";
import { useAuthStore } from "@/stores/auth";
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
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [visibleRoles, setVisibleRoles] = useState("");  // 权限分域：空=全库共享
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CropSearchHit[] | null>(null);
  const [mockNote, setMockNote] = useState(false);
  // —— 问嗦囊（agentic 问答 + 会话续聊 + 用量观测）——
  const [askQuery, setAskQuery] = useState("");
  const [asking, setAsking] = useState(false);
  const [askAnswer, setAskAnswer] = useState("");
  const [askSteps, setAskSteps] = useState<string[]>([]);
  const [askCitations, setAskCitations] = useState<CropSearchHit[]>([]);
  const [askError, setAskError] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [auditOpen, setAuditOpen] = useState(false);
  const canAudit = useAuthStore((s) => s.permissions).some(
    (p) => p === "system" || p.startsWith("system:")
  );

  const { data: usage } = useQuery({
    queryKey: ["crop", "usage"],
    queryFn: () => agentApi.usage(7),
  });
  const { data: conversations = [] } = useQuery({
    queryKey: ["crop", "conversations"],
    queryFn: agentApi.conversations,
  });

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["crop", "docs", page],
    queryFn: () => cropApi.list(PAGE_SIZE, (page - 1) * PAGE_SIZE),
  });
  const { data: health } = useQuery({
    queryKey: ["crop", "health"],
    queryFn: cropApi.health,
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
  const search = useMutation({
    mutationFn: () => cropApi.search(query, 5),
    onSuccess: (d) => { setHits(d.hits); setMockNote(d.mock); },
  });

  async function runAsk(q: string) {
    if (!q.trim() || asking) return;
    if (!conversationId) setConversationId(`conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
    setAsking(true); setAskSteps([]); setAskAnswer(""); setAskCitations([]); setAskError("");
    try {
      await askStream(q, (ev) => {
        if (ev.tool_call) {
          setAskSteps((s) => [...s, `检索知识库：${ev.tool_call?.query}（第 ${ev.tool_call?.round} 轮）`]);
        } else if (ev.delta) {
          setAskAnswer((a) => a + ev.delta);
        } else if (ev.citations) {
          setAskCitations(ev.citations);
        } else if (ev.error) {
          setAskError(ev.error);
        }
      }, [], conversationId);
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "问答服务异常");
    } finally {
      setAsking(false);
      qc.invalidateQueries({ queryKey: ["crop", "usage"] });
      qc.invalidateQueries({ queryKey: ["crop", "conversations"] });
    }
  }

  function newConversation() {
    setConversationId(undefined);
    setAskAnswer(""); setAskSteps([]); setAskCitations([]); setAskError("");
  }

  async function loadConversation(sid: string) {
    if (!sid) { newConversation(); return; }
    setConversationId(sid);
    setAskAnswer(""); setAskSteps([]); setAskCitations([]); setAskError("");
    try {
      const d = await agentApi.conversation(sid);
      const lastA = [...d.messages].reverse().find((m) => m.role === "assistant");
      setAskAnswer(lastA?.content ?? "");
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "会话加载失败");
    }
  }

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
      <div className="glass rounded-2xl p-4">
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

      {/* 问嗦囊：AI 多轮检索后作答（agentic RAG + 会话续聊） */}
      <div className="glass rounded-2xl p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <MessagesSquare className="h-4 w-4 text-primary" /> 问嗦囊
          <span className="text-xs font-normal text-muted-foreground">（AI 自主检索知识库后作答，附引用）</span>
          <span className="ml-auto flex items-center gap-2">
            {usage && (
              <span className="specimen-latin !text-[9px] text-muted-foreground" title="近 7 天问答用量（token/调用/工具次数）">
                7d: {usage.calls}次 · {usage.total_tokens.toLocaleString()} tok · 工具×{usage.tool_calls}
              </span>
            )}
            {canAudit && (
              <Button variant="outline" size="sm" onClick={() => setAuditOpen(true)} title="agent 工具调用审计">
                审计
              </Button>
            )}
            <select
              value={conversationId ?? ""}
              onChange={(e) => void loadConversation(e.target.value)}
              className="max-w-[200px] rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none"
              title="历史会话（选择后续聊）"
            >
              <option value="">＋ 新对话</option>
              {conversations.map((c) => (
                <option key={c.session_id} value={c.session_id}>
                  {c.first_question || c.session_id.slice(0, 12)}（{c.message_count}条）
                </option>
              ))}
            </select>
          </span>
        </div>
        <div className="flex gap-2">
          <input
            value={askQuery}
            onChange={(e) => setAskQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && askQuery.trim() && !asking) {
                setAskQuery(askQuery); void runAsk(askQuery);
              }
            }}
            placeholder="试试：这个项目的设计语言是什么？"
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
          />
          <Button
            size="sm"
            onClick={() => void runAsk(askQuery)}
            disabled={!askQuery.trim() || asking}
          >
            {asking ? "思考中…" : "提问"}
          </Button>
        </div>
        {(askSteps.length > 0 || askAnswer || askError) && (
          <div className="mt-3 space-y-2">
            {askSteps.map((s, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                <FlaskConical className="mr-1 inline h-3 w-3" />
                {s}
              </p>
            ))}
            {askError && (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {askError}
              </p>
            )}
            {askAnswer && (
              <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{askAnswer}</p>
              </div>
            )}
            {askCitations.length > 0 && (
              <div className="space-y-1.5">
                <p className="specimen-latin !text-[9px] text-muted-foreground">citations · 引用来源</p>
                {askCitations.map((h) => (
                  <p key={h.chunk_id} className="text-xs text-muted-foreground">
                    《{h.document_title}》#{h.seq} · {h.content.slice(0, 60)}…
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 文档列表 */}
      <div className="overflow-hidden glass rounded-2xl">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">标题</th>
              <th className="px-4 py-3">块数</th>
              <th className="px-4 py-3">可见范围</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">吞入时间</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">消化中…</td></tr>}
            {!isLoading && docs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  <BookOpenText className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  嗉囊还是空的——吞入第一份知识吧
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
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-background/60 px-4 py-5 text-center transition-colors hover:border-primary/50">
            <FileUp className="h-5 w-5 text-primary/70" />
            <span className="text-sm">点击选择文件</span>
            <span className="text-[11px] text-muted-foreground">txt / md / pdf / docx · ≤10MB（扫描件 PDF 请先粘贴文本）</span>
            <input
              type="file" accept=".txt,.md,.markdown,.pdf,.docx" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile.mutate(f); }}
            />
          </label>
          {uploadFile.isPending && <p className="text-xs text-muted-foreground">消化中（提取+向量化）…</p>}
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
              {upload.isPending ? "消化中…" : "吞入"}
            </Button>
          </div>
          {upload.isError && (
            <p className="text-xs text-destructive">{String(upload.error)}</p>
          )}
        </div>
      </Modal>

      {/* agent 审计（admin/system）：谁让 AI 干了什么 */}
      <Modal open={auditOpen} onClose={() => setAuditOpen(false)} title="Agent 审计" width="w-[720px]">
        <AuditList />
      </Modal>

      {previewId !== null && <DocPreview docId={previewId} onClose={() => setPreviewId(null)} />}

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
              <p className="py-6 text-center text-xs text-muted-foreground">无分块（消化失败？查看状态与错误信息）</p>
            )}
          </div>
          {doc.error && <p className="text-xs text-red-500">消化错误：{doc.error}</p>}
        </div>
      )}
    </Modal>
  );
}

function AuditList() {
  const { data, isLoading } = useQuery({
    queryKey: ["crop", "audit"],
    queryFn: () => auditApi.list(50),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (!data?.items.length) return <p className="text-sm text-muted-foreground">暂无 agent 工具调用记录</p>;
  return (
    <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
      {data.items.map((a: AuditItem) => {
        let d: { tool?: string; args?: Record<string, unknown>; denied?: boolean; ok?: boolean } = {};
        try { d = JSON.parse(a.detail); } catch { /* 原样 */ }
        return (
          <div key={a.id} className="flex items-baseline gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs">
            <span className={`font-mono ${a.level === "INFO" ? "text-muted-foreground" : a.level === "WARN" ? "text-amber-600" : "text-destructive"}`}>
              {a.level}
            </span>
            <span className="font-medium">{d.tool ?? "agent"}</span>
            <span className="text-muted-foreground">
              {d.denied ? "⚠️ 越权拒绝" : d.ok === false ? "❌ 失败" : "✓"}
            </span>
            <span className="truncate text-muted-foreground">
              {JSON.stringify(d.args ?? {})}
            </span>
            <span className="ml-auto shrink-0 text-muted-foreground">u{a.user_id} · {a.created_at.slice(5, 16)}</span>
          </div>
        );
      })}
    </div>
  );
}
