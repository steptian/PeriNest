"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request_1 = require("../../utils/request");
const index_1 = require("../../i18n/index");
function welcomeMsg() {
    return { role: "assistant", content: (0, index_1.t)("chat.welcome") };
}
function convMeta(c) {
    const ch = c.channel === "free" ? (0, index_1.t)("chat.channelFree") : (0, index_1.t)("chat.channelKb");
    return `${ch} · ${(0, index_1.t)("chat.messageCount", { count: c.message_count })} · ${c.last_time}`;
}
function measureTabBarPx() {
    const sys = wx.getSystemInfoSync();
    const inset = sys.screenHeight - (sys.safeArea?.bottom ?? sys.screenHeight);
    const fallback = 48 + Math.max(0, inset);
    try {
        const menu = wx.getMenuButtonBoundingClientRect();
        const navHeight = (menu.top - sys.statusBarHeight) * 2 + menu.height + sys.statusBarHeight;
        const tab = sys.screenHeight - sys.windowHeight - navHeight;
        return tab > 20 ? tab : fallback;
    }
    catch {
        return fallback;
    }
}
Page({
    data: {
        messages: [welcomeMsg()],
        input: "",
        streaming: false,
        useKb: true,
        mode: "chat",
        hits: [],
        searched: false,
        bottomId: "",
        convId: "",
        historyOpen: false,
        convs: [],
        i18n: {},
        inputPlaceholder: "",
        kbLift: 0,
        tabBarPx: 48,
    },
    _onKb: undefined,
    onLoad() {
        const saved = wx.getStorageSync("ant-use-kb");
        this.setData({
            useKb: saved === "" ? true : saved === "1",
            tabBarPx: measureTabBarPx(),
        });
    },
    onShow() {
        (0, index_1.applyTabBar)();
        this.applyI18n();
        if (this._onKb)
            wx.offKeyboardHeightChange(this._onKb);
        this._onKb = (res) => {
            const h = res.height || 0;
            const lift = h > 0 ? Math.max(0, h - this.data.tabBarPx) : 0;
            this.setData({ kbLift: lift, bottomId: lift > 0 ? "bottom" : this.data.bottomId });
        };
        wx.onKeyboardHeightChange(this._onKb);
    },
    onHide() {
        if (this._onKb)
            wx.offKeyboardHeightChange(this._onKb);
        this.setData({ kbLift: 0 });
    },
    onUnload() {
        if (this._onKb)
            wx.offKeyboardHeightChange(this._onKb);
    },
    applyI18n() {
        (0, index_1.applyNavTitle)("chat.navTitle");
        const patch = {
            i18n: (0, index_1.ns)("chat"),
            inputPlaceholder: this.placeholder(),
            convs: this.data.convs.map((c) => ({ ...c, meta: convMeta(c) })),
        };
        if (!this.data.convId && this.data.messages.length === 1 && this.data.messages[0].role === "assistant") {
            patch.messages = [welcomeMsg()];
        }
        this.setData(patch);
    },
    placeholder() {
        if (this.data.mode === "search")
            return (0, index_1.t)("chat.searchPlaceholder");
        return this.data.useKb ? (0, index_1.t)("chat.kbPlaceholder") : (0, index_1.t)("chat.freePlaceholder");
    },
    toggleKb() {
        const v = !this.data.useKb;
        wx.setStorageSync("ant-use-kb", v ? "1" : "0");
        this.setData({ useKb: v, convId: "", inputPlaceholder: v ? (0, index_1.t)("chat.kbPlaceholder") : (0, index_1.t)("chat.freePlaceholder") });
    },
    toggleMode() {
        const mode = this.data.mode === "chat" ? "search" : "chat";
        this.setData({
            mode,
            hits: [],
            searched: false,
            inputPlaceholder: mode === "search"
                ? (0, index_1.t)("chat.searchPlaceholder")
                : (this.data.useKb ? (0, index_1.t)("chat.kbPlaceholder") : (0, index_1.t)("chat.freePlaceholder")),
        });
    },
    async openHistory() {
        try {
            const convs = await (0, request_1.request)("/crop/conversations");
            this.setData({
                historyOpen: true,
                convs: (convs || []).map((c) => ({ ...c, meta: convMeta(c) })),
            });
        }
        catch {
            wx.showToast({ title: (0, index_1.t)("chat.loadFail"), icon: "none" });
        }
    },
    closeHistory() {
        this.setData({ historyOpen: false });
    },
    async pickConversation(e) {
        const sid = e.currentTarget.dataset.sid;
        if (!sid) {
            this.setData({ historyOpen: false, messages: [welcomeMsg()], convId: "" });
            return;
        }
        try {
            const d = await (0, request_1.request)(`/crop/conversations/${sid}`);
            const { parseMd } = require("../../utils/md-lite");
            const msgs = (d.messages || []).map((m) => {
                const msg = { role: m.role, content: m.content };
                if (msg.role === "assistant" && msg.content) {
                    msg.md = parseMd(msg.content);
                }
                return msg;
            });
            this.setData({ historyOpen: false, messages: msgs.length ? msgs : this.data.messages, convId: sid, mode: "chat" });
        }
        catch {
            wx.showToast({ title: (0, index_1.t)("chat.restoreFail"), icon: "none" });
        }
    },
    async renameConversation(e) {
        const sid = e.currentTarget.dataset.sid;
        const cur = this.data.convs.find((c) => c.session_id === sid);
        const res = await wx.showModal({
            title: (0, index_1.t)("chat.renameTitle"),
            editable: true,
            placeholderText: cur?.title || "",
            confirmText: (0, index_1.t)("common.confirm"),
            cancelText: (0, index_1.t)("common.cancel"),
        });
        if (!res.confirm || !res.content?.trim())
            return;
        try {
            await (0, request_1.request)(`/crop/conversations/${sid}/title`, { method: "PUT", data: { title: res.content.trim() } });
            const convs = await (0, request_1.request)("/crop/conversations");
            this.setData({ convs: (convs || []).map((c) => ({ ...c, meta: convMeta(c) })) });
        }
        catch {
            wx.showToast({ title: (0, index_1.t)("chat.renameFail"), icon: "none" });
        }
    },
    onInput(e) {
        this.setData({ input: e.detail.value });
    },
    async send() {
        const text = (this.data.input || "").trim();
        if (!text || this.data.streaming)
            return;
        this.setData({ input: "", streaming: true, bottomId: "bottom" });
        if (this.data.mode === "search") {
            try {
                const res = await (0, request_1.request)("/crop/search", { data: { query: text, top_k: 5 } });
                this.setData({ hits: res.hits || [], searched: true, bottomId: "bottom" });
            }
            catch (e) {
                wx.showToast({ title: (0, index_1.t)("chat.searchFail"), icon: "none" });
            }
            finally {
                this.setData({ streaming: false });
            }
            return;
        }
        const next = [...this.data.messages, { role: "user", content: text }];
        const useKb = this.data.useKb;
        this.setData({
            messages: [...next, { role: "assistant", content: "", steps: [], citations: [] }],
            bottomId: "bottom",
        });
        const patchLast = (patch) => {
            const msgs = this.data.messages;
            const last = msgs[msgs.length - 1];
            this.setData({ [`messages[${msgs.length - 1}]`]: { ...last, ...patch }, bottomId: "bottom" });
        };
        try {
            if (useKb) {
                if (!this.data.convId) {
                    this.setData({ convId: `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` });
                }
                const { streamChat } = require("../../utils/ai_stream");
                await streamChat([], () => { }, {
                    url: "/crop/ask/stream",
                    data: { query: text, conversation_id: this.data.convId },
                    onEvent: (ev) => {
                        if (ev.tool_call) {
                            const tc = ev.tool_call;
                            const msgs = this.data.messages;
                            const last = msgs[msgs.length - 1];
                            patchLast({ steps: [...(last.steps || []), (0, index_1.t)("chat.retrieving", { query: tc.query })] });
                        }
                        else if (ev.delta) {
                            const msgs = this.data.messages;
                            const last = msgs[msgs.length - 1];
                            patchLast({ content: last.content + ev.delta });
                        }
                        else if (ev.citations) {
                            patchLast({ citations: ev.citations });
                        }
                        else if (ev.error) {
                            patchLast({ content: ev.error });
                        }
                    },
                });
            }
            else {
                if (!this.data.convId) {
                    this.setData({ convId: `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` });
                }
                const { streamChat } = require("../../utils/ai_stream");
                const plain = next.map((m) => ({ role: m.role, content: m.content }));
                await streamChat(plain, (delta) => {
                    const msgs = this.data.messages;
                    const last = msgs[msgs.length - 1];
                    patchLast({ content: last.content + delta });
                }, { data: { messages: plain, conversation_id: this.data.convId } });
            }
        }
        catch (e) {
            patchLast({ content: (0, index_1.t)("chat.errorPrefix", { message: e.message }) });
        }
        finally {
            const msgs = this.data.messages;
            const last = msgs[msgs.length - 1];
            if (last && last.role === "assistant" && last.content) {
                const { parseMd } = require("../../utils/md-lite");
                const md = parseMd(last.content);
                this.setData({ [`messages[${msgs.length - 1}].md`]: md });
            }
            this.setData({ streaming: false });
        }
    },
});
