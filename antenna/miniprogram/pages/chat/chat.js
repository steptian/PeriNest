"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request_1 = require("../../utils/request");
Page({
    data: {
        messages: [{ role: "assistant", content: "你好，我是 AI 助手。可开知识库引用——回答基于你的企业知识，附来源。" }],
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
    },
    onLoad() {
        const saved = wx.getStorageSync("ant-use-kb");
        this.setData({ useKb: saved === "" ? true : saved === "1" });
    },
    toggleKb() {
        const v = !this.data.useKb;
        wx.setStorageSync("ant-use-kb", v ? "1" : "0");
        this.setData({ useKb: v, convId: "" });
    },
    toggleMode() {
        this.setData({ mode: this.data.mode === "chat" ? "search" : "chat", hits: [], searched: false });
    },
    async openHistory() {
        try {
            const convs = await (0, request_1.request)("/crop/conversations");
            this.setData({ historyOpen: true, convs: convs || [] });
        }
        catch {
            wx.showToast({ title: "加载失败", icon: "none" });
        }
    },
    closeHistory() {
        this.setData({ historyOpen: false });
    },
    async pickConversation(e) {
        const sid = e.currentTarget.dataset.sid;
        if (!sid) {
            this.setData({ historyOpen: false, messages: [{ role: "assistant", content: "你好，我是 AI 助手。可开知识库引用——回答基于你的企业知识，附来源。" }], convId: "" });
            return;
        }
        try {
            const d = await (0, request_1.request)(`/crop/conversations/${sid}`);
            const msgs = (d.messages || []).map((m) => ({ role: m.role, content: m.content }));
            this.setData({ historyOpen: false, messages: msgs.length ? msgs : this.data.messages, convId: sid, mode: "chat" });
        }
        catch {
            wx.showToast({ title: "恢复失败", icon: "none" });
        }
    },
    async renameConversation(e) {
        const sid = e.currentTarget.dataset.sid;
        const cur = this.data.convs.find((c) => c.session_id === sid);
        const res = await wx.showModal({ title: "重命名会话", editable: true, placeholderText: cur?.title || "" });
        if (!res.confirm || !res.content?.trim())
            return;
        try {
            await (0, request_1.request)(`/crop/conversations/${sid}/title`, { method: "PUT", data: { title: res.content.trim() } });
            const convs = await (0, request_1.request)("/crop/conversations");
            this.setData({ convs: convs || [] });
        }
        catch {
            wx.showToast({ title: "改名失败", icon: "none" });
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
                wx.showToast({ title: "搜索失败", icon: "none" });
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
                            patchLast({ steps: [...(last.steps || []), `检索：${tc.query}`] });
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
            patchLast({ content: `出错了：${e.message}` });
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
