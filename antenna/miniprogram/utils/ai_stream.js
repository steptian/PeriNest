"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamChat = streamChat;
const BASE_URL = () => getApp().globalData.apiBase;
function streamChat(messages, onDelta) {
    return new Promise((resolve, reject) => {
        let buf = "";
        const task = wx.request({
            url: `${BASE_URL()}/ai/chat/stream`,
            method: "POST",
            enableChunked: true,
            header: {
                "Content-Type": "application/json",
                "X-Client": "Antenna",
                Authorization: `Bearer ${getApp().globalData.token}`,
            },
            data: { messages },
            success: () => resolve(),
            fail: (err) => reject(new Error(err.errMsg)),
        });
        if (task && task.onChunkReceived) {
            task.onChunkReceived((res) => {
                const text = decodeChunk(res.data);
                buf += text;
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                    if (!line.startsWith("data:"))
                        continue;
                    try {
                        const data = JSON.parse(line.slice(5).trim());
                        if (data.delta)
                            onDelta(data.delta);
                        if (data.error)
                            reject(new Error(data.error));
                    }
                    catch { }
                }
            });
        }
    });
}
function decodeChunk(buffer) {
    const bytes = new Uint8Array(buffer);
    let out = "";
    let i = 0;
    while (i < bytes.length) {
        const b = bytes[i];
        if (b < 0x80) {
            out += String.fromCharCode(b);
            i += 1;
        }
        else if (b < 0xe0) {
            out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
            i += 2;
        }
        else if (b < 0xf0) {
            out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
            i += 3;
        }
        else {
            const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
            const off = cp - 0x10000;
            out += String.fromCharCode(0xd800 + (off >> 10), 0xdc00 + (off & 0x3ff));
            i += 4;
        }
    }
    return out;
}
