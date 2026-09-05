"use strict";
Page({
    data: {
        messages: [{ role: "assistant", content: "你好，我是巢穴的神经索。琥珀中沉睡三亿年的生存智慧，随取随用。" }],
        input: "",
        streaming: false,
        bottomId: "",
    },
    onInput(e) {
        this.setData({ input: e.detail.value });
    },
    async send() {
        const text = (this.data.input || "").trim();
        if (!text || this.data.streaming)
            return;
        const next = [...this.data.messages, { role: "user", content: text }];
        this.setData({ messages: [...next, { role: "assistant", content: "" }], input: "", streaming: true, bottomId: "bottom" });
        try {
            const { streamChat } = require("../../utils/ai_stream");
            await streamChat(next, (delta) => {
                const msgs = this.data.messages;
                const last = msgs[msgs.length - 1];
                this.setData({ [`messages[${msgs.length - 1}].content`]: last.content + delta, bottomId: "bottom" });
            });
        }
        catch (e) {
            const msgs = this.data.messages;
            this.setData({ [`messages[${msgs.length - 1}].content`]: `出错了：${e.message}` });
        }
        finally {
            this.setData({ streaming: false });
        }
    },
});
