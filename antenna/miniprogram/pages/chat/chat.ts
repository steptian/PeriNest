/** AI 助手 —— 单入口：引用知识库开关（agentic 问答/自由对话）+ 搜索模式（查原文） */
import { request } from "../../utils/request";

interface CropHit {
  chunk_id: number;
  document_id: number;
  document_title: string;
  seq: number;
  content: string;
  score: number;
}
interface ChatMsg { role: "user" | "assistant"; content: string; citations?: CropHit[]; steps?: string[]; md?: unknown[] }
interface MdInline { t: string; s: string; href?: string }
interface MdBlock { type: string; lang?: string; level?: number; ordered?: boolean; items?: MdInline[][]; runs?: MdInline[]; text?: string }

Page({
  data: {
    messages: [{ role: "assistant", content: "你好，我是 AI 助手。可开知识库引用——回答基于你的企业知识，附来源。" } as ChatMsg],
    input: "",
    streaming: false,
    useKb: true,
    mode: "chat" as "chat" | "search",
    hits: [] as CropHit[],
    searched: false,
    bottomId: "",
    convId: "" as string,
    historyOpen: false,
    convs: [] as Array<{ session_id: string; title: string; channel: string; message_count: number; last_time: string }>,
  },
  onLoad() {
    const saved = wx.getStorageSync("ant-use-kb");
    this.setData({ useKb: saved === "" ? true : saved === "1" });
  },
  toggleKb() {
    const v = !this.data.useKb;
    wx.setStorageSync("ant-use-kb", v ? "1" : "0");
    this.setData({ useKb: v, convId: "" }); // 切换通道即新会话
  },
  toggleMode() {
    this.setData({ mode: this.data.mode === "chat" ? "search" : "chat", hits: [], searched: false });
  },
  async openHistory() {
    try {
      const convs = await request<{ session_id: string; title: string; channel: string; message_count: number; last_time: string }[]>(
        "/crop/conversations"
      );
      this.setData({ historyOpen: true, convs: convs || [] });
    } catch {
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },
  closeHistory() {
    this.setData({ historyOpen: false });
  },
  async pickConversation(e: WechatMiniprogram.TouchEvent) {
    const sid = e.currentTarget.dataset.sid as string;
    if (!sid) {
      this.setData({ historyOpen: false, messages: [{ role: "assistant", content: "你好，我是 AI 助手。可开知识库引用——回答基于你的企业知识，附来源。" }], convId: "" });
      return;
    }
    try {
      const d = await request<{ messages: { role: string; content: string }[] }>(`/crop/conversations/${sid}`);
      const msgs: ChatMsg[] = (d.messages || []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      this.setData({ historyOpen: false, messages: msgs.length ? msgs : this.data.messages, convId: sid, mode: "chat" });
    } catch {
      wx.showToast({ title: "恢复失败", icon: "none" });
    }
  },
  async renameConversation(e: WechatMiniprogram.TouchEvent) {
    const sid = e.currentTarget.dataset.sid as string;
    const cur = this.data.convs.find((c) => c.session_id === sid);
    const res = await wx.showModal({ title: "重命名会话", editable: true, placeholderText: cur?.title || "" });
    if (!res.confirm || !res.content?.trim()) return;
    try {
      await request(`/crop/conversations/${sid}/title`, { method: "PUT", data: { title: res.content.trim() } });
      const convs = await request<typeof this.data.convs>("/crop/conversations");
      this.setData({ convs: convs || [] });
    } catch {
      wx.showToast({ title: "改名失败", icon: "none" });
    }
  },
  onInput(e: WechatMiniprogram.Input) {
    this.setData({ input: e.detail.value });
  },
  async send() {
    const text = (this.data.input || "").trim();
    if (!text || this.data.streaming) return;
    this.setData({ input: "", streaming: true, bottomId: "bottom" });

    // 搜索模式：直查知识库原文
    if (this.data.mode === "search") {
      try {
        const res = await request<{ hits: CropHit[] }>("/crop/search", { data: { query: text, top_k: 5 } });
        this.setData({ hits: res.hits || [], searched: true, bottomId: "bottom" });
      } catch (e) {
        wx.showToast({ title: "搜索失败", icon: "none" });
      } finally {
        this.setData({ streaming: false });
      }
      return;
    }

    // 对话模式：知识库引用（agentic）或自由对话
    const next: ChatMsg[] = [...this.data.messages, { role: "user", content: text }];
    const useKb = this.data.useKb;
    this.setData({
      messages: [...next, { role: "assistant", content: "", steps: [], citations: [] }],
      bottomId: "bottom",
    });
    const patchLast = (patch: Partial<ChatMsg>) => {
      const msgs = this.data.messages as ChatMsg[];
      const last = msgs[msgs.length - 1];
      this.setData({ [`messages[${msgs.length - 1}]`]: { ...last, ...patch }, bottomId: "bottom" });
    };
    try {
      if (useKb) {
        if (!this.data.convId) {
          this.setData({ convId: `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` });
        }
        const { streamChat } = require("../../utils/ai_stream");
        await streamChat(
          [],
          () => {},
          {
            url: "/crop/ask/stream",
            data: { query: text, conversation_id: this.data.convId },
            onEvent: (ev: Record<string, unknown>) => {
              if (ev.tool_call) {
                const tc = ev.tool_call as { round: number; query: string };
                const msgs = this.data.messages as ChatMsg[];
                const last = msgs[msgs.length - 1];
                patchLast({ steps: [...(last.steps || []), `检索：${tc.query}`] });
              } else if (ev.delta) {
                const msgs = this.data.messages as ChatMsg[];
                const last = msgs[msgs.length - 1];
                patchLast({ content: last.content + (ev.delta as string) });
              } else if (ev.citations) {
                patchLast({ citations: ev.citations as CropHit[] });
              } else if (ev.error) {
                patchLast({ content: ev.error as string });
              }
            },
          }
        );
      } else {
        if (!this.data.convId) {
          this.setData({ convId: `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` });
        }
        const { streamChat } = require("../../utils/ai_stream");
        const plain = next.map((m) => ({ role: m.role, content: m.content }));
        await streamChat(
          plain,
          (delta: string) => {
            const msgs = this.data.messages as ChatMsg[];
            const last = msgs[msgs.length - 1];
            patchLast({ content: last.content + delta });
          },
          { data: { messages: plain, conversation_id: this.data.convId } }
        );
      }
    } catch (e) {
      patchLast({ content: `出错了：${(e as Error).message}` });
    } finally {
      // 流结束：解析 markdown 为结构块（流中用纯文本，结束富渲染）
      const msgs = this.data.messages as ChatMsg[];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant" && last.content) {
        const { parseMd } = require("../../utils/md-lite");
        const md = parseMd(last.content) as MdBlock[];
        this.setData({ [`messages[${msgs.length - 1}].md`]: md });
      }
      this.setData({ streaming: false });
    }
  },
});
