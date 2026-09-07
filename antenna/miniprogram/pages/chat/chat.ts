/** AI 助手 —— 单入口：引用知识库开关（agentic 问答/自由对话）+ 搜索模式（查原文） */
import { request } from "../../utils/request";
import { applyNavTitle, applyTabBar, ns, t } from "../../i18n/index";

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
interface Conv {
  session_id: string;
  title: string;
  channel: string;
  message_count: number;
  last_time: string;
  meta?: string;
}

function welcomeMsg(): ChatMsg {
  return { role: "assistant", content: t("chat.welcome") };
}

function convMeta(c: Conv): string {
  const ch = c.channel === "free" ? t("chat.channelFree") : t("chat.channelKb");
  return `${ch} · ${t("chat.messageCount", { count: c.message_count })} · ${c.last_time}`;
}

/** tabBar 页窗口底已在原生 tab 之上；键盘高度从屏幕底算，抬升量要减掉 tabBar。 */
function measureTabBarPx(): number {
  const sys = wx.getSystemInfoSync();
  const inset = sys.screenHeight - (sys.safeArea?.bottom ?? sys.screenHeight);
  const fallback = 48 + Math.max(0, inset);
  try {
    const menu = wx.getMenuButtonBoundingClientRect();
    const navHeight =
      (menu.top - sys.statusBarHeight) * 2 + menu.height + sys.statusBarHeight;
    const tab = sys.screenHeight - sys.windowHeight - navHeight;
    return tab > 20 ? tab : fallback;
  } catch {
    return fallback;
  }
}

Page({
  data: {
    messages: [welcomeMsg()] as ChatMsg[],
    input: "",
    streaming: false,
    useKb: true,
    mode: "chat" as "chat" | "search",
    hits: [] as CropHit[],
    searched: false,
    bottomId: "",
    convId: "" as string,
    historyOpen: false,
    convs: [] as Conv[],
    i18n: {} as Record<string, string>,
    inputPlaceholder: "",
    kbLift: 0,
    tabBarPx: 48,
  },
  _onKb: undefined as undefined | ((res: { height: number }) => void),
  onLoad() {
    const saved = wx.getStorageSync("ant-use-kb");
    this.setData({
      useKb: saved === "" ? true : saved === "1",
      tabBarPx: measureTabBarPx(),
    });
  },
  onShow() {
    applyTabBar();
    this.applyI18n();
    if (this._onKb) wx.offKeyboardHeightChange(this._onKb);
    this._onKb = (res: { height: number }) => {
      const h = res.height || 0;
      const lift = h > 0 ? Math.max(0, h - this.data.tabBarPx) : 0;
      this.setData({ kbLift: lift, bottomId: lift > 0 ? "bottom" : this.data.bottomId });
    };
    wx.onKeyboardHeightChange(this._onKb);
  },
  onHide() {
    if (this._onKb) wx.offKeyboardHeightChange(this._onKb);
    this.setData({ kbLift: 0 });
  },
  onUnload() {
    if (this._onKb) wx.offKeyboardHeightChange(this._onKb);
  },
  applyI18n() {
    applyNavTitle("chat.navTitle");
    const patch: Record<string, unknown> = {
      i18n: ns("chat"),
      inputPlaceholder: this.placeholder(),
      convs: this.data.convs.map((c) => ({ ...c, meta: convMeta(c) })),
    };
    if (!this.data.convId && this.data.messages.length === 1 && this.data.messages[0].role === "assistant") {
      patch.messages = [welcomeMsg()];
    }
    this.setData(patch);
  },
  placeholder(): string {
    if (this.data.mode === "search") return t("chat.searchPlaceholder");
    return this.data.useKb ? t("chat.kbPlaceholder") : t("chat.freePlaceholder");
  },
  toggleKb() {
    const v = !this.data.useKb;
    wx.setStorageSync("ant-use-kb", v ? "1" : "0");
    this.setData({ useKb: v, convId: "", inputPlaceholder: v ? t("chat.kbPlaceholder") : t("chat.freePlaceholder") });
  },
  toggleMode() {
    const mode = this.data.mode === "chat" ? "search" : "chat";
    this.setData({
      mode,
      hits: [],
      searched: false,
      inputPlaceholder: mode === "search"
        ? t("chat.searchPlaceholder")
        : (this.data.useKb ? t("chat.kbPlaceholder") : t("chat.freePlaceholder")),
    });
  },
  async openHistory() {
    try {
      const convs = await request<Conv[]>("/crop/conversations");
      this.setData({
        historyOpen: true,
        convs: (convs || []).map((c) => ({ ...c, meta: convMeta(c) })),
      });
    } catch {
      wx.showToast({ title: t("chat.loadFail"), icon: "none" });
    }
  },
  closeHistory() {
    this.setData({ historyOpen: false });
  },
  async pickConversation(e: WechatMiniprogram.TouchEvent) {
    const sid = e.currentTarget.dataset.sid as string;
    if (!sid) {
      this.setData({ historyOpen: false, messages: [welcomeMsg()], convId: "" });
      return;
    }
    try {
      const d = await request<{ messages: { role: string; content: string }[] }>(`/crop/conversations/${sid}`);
      const { parseMd } = require("../../utils/md-lite");
      const msgs: ChatMsg[] = (d.messages || []).map((m) => {
        const msg: ChatMsg = { role: m.role as "user" | "assistant", content: m.content };
        if (msg.role === "assistant" && msg.content) {
          msg.md = parseMd(msg.content) as MdBlock[];
        }
        return msg;
      });
      this.setData({ historyOpen: false, messages: msgs.length ? msgs : this.data.messages, convId: sid, mode: "chat" });
    } catch {
      wx.showToast({ title: t("chat.restoreFail"), icon: "none" });
    }
  },
  async renameConversation(e: WechatMiniprogram.TouchEvent) {
    const sid = e.currentTarget.dataset.sid as string;
    const cur = this.data.convs.find((c) => c.session_id === sid);
    const res = await wx.showModal({
      title: t("chat.renameTitle"),
      editable: true,
      placeholderText: cur?.title || "",
      confirmText: t("common.confirm"),
      cancelText: t("common.cancel"),
    });
    if (!res.confirm || !res.content?.trim()) return;
    try {
      await request(`/crop/conversations/${sid}/title`, { method: "PUT", data: { title: res.content.trim() } });
      const convs = await request<Conv[]>("/crop/conversations");
      this.setData({ convs: (convs || []).map((c) => ({ ...c, meta: convMeta(c) })) });
    } catch {
      wx.showToast({ title: t("chat.renameFail"), icon: "none" });
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
        wx.showToast({ title: t("chat.searchFail"), icon: "none" });
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
                patchLast({ steps: [...(last.steps || []), t("chat.retrieving", { query: tc.query })] });
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
      patchLast({ content: t("chat.errorPrefix", { message: (e as Error).message }) });
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
