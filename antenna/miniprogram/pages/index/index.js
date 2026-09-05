"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const wx_auth_1 = require("../../utils/wx_auth");
Page({
    data: { version: "0.1.0" },
    onLoad() {
        (0, wx_auth_1.ensureLogin)().catch(() => wx.showToast({ title: "登录失败", icon: "none" }));
    },
});
