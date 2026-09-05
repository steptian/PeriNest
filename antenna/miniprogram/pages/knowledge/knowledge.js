"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request_1 = require("../../utils/request");
Page({
    data: {
        mode: "ask",
        input: "",
        streaming: false,
        steps: [],
        answer: "",
        citations: [],
        hits: [],
        searched: false,
        error: "",
        bottomId: "",
    },
    switchMode(e) {
        const mode = e.currentTarget.dataset.mode;
        this.setData({
            mode,
            steps: [],
            answer: "",
            citations: [],
            hits: [],
            searched: false,
            error: "",
        });
    },
    onInput(e) {
        this.setData({ input: e.detail.value });
    },
    async send() {
        const text = (this.data.input || "").trim();
        if (!text || this.data.streaming)
            return;
        this.setData({ input: "", streaming: true, error: "", bottomId: "bottom" });
        if (this.data.mode === "search") {
            try {
                const res = await (0, request_1.request)("/crop/search", {
                    data: { query: text, top_k: 5 },
                });
                this.setData({ hits: res.hits || [], searched: true, bottomId: "bottom" });
            }
            catch (e) {
                this.setData({ error: e.message });
            }
            finally {
                this.setData({ streaming: false });
            }
            return;
        }
        this.setData({ steps: [], answer: "", citations: [] });
        const { streamChat } = require("../../utils/ai_stream");
        try {
            await streamChat([], () => { }, {
                url: "/crop/ask/stream",
                data: { query: text },
                onEvent: (data) => {
                    if (data.tool_call) {
                        const tc = data.tool_call;
                        this.setData({
                            steps: [...this.data.steps, `检索知识库：${tc.query}（第 ${tc.round} 轮）`],
                            bottomId: "bottom",
                        });
                    }
                    else if (data.delta) {
                        this.setData({ answer: this.data.answer + data.delta, bottomId: "bottom" });
                    }
                    else if (data.citations) {
                        this.setData({ citations: data.citations });
                    }
                    else if (data.error) {
                        this.setData({ error: data.error });
                    }
                },
            });
        }
        catch (e) {
            this.setData({ error: e.message });
        }
        finally {
            this.setData({ streaming: false });
        }
    },
});
