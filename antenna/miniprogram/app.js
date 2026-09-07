"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./i18n/index");
const APP_VERSION = "0.13.0";
App({
    globalData: {
        appVersion: APP_VERSION,
        apiBase: "http://10.10.14.72:8000/api/v1",
        token: "",
        userInfo: null,
    },
    onLaunch() {
        const token = wx.getStorageSync("perinest_token");
        if (token)
            this.globalData.token = token;
        (0, index_1.applyTabBar)();
    },
});
