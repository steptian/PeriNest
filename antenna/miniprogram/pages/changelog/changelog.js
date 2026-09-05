"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request_1 = require("../../utils/request");
Page({
    data: {
        version: "",
        entries: [],
        loading: true,
    },
    onLoad() {
        (0, request_1.request)("/system/version")
            .then((info) => this.setData({ version: info.version, entries: info.changelog, loading: false }))
            .catch(() => {
            this.setData({ loading: false });
            wx.showToast({ title: "加载失败", icon: "none" });
        });
    },
});
