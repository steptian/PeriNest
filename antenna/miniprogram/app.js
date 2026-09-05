"use strict";
const APP_VERSION = "0.9.1";
App({
    globalData: {
        appVersion: APP_VERSION,
        apiBase: "http://127.0.0.1:8000/api/v1",
        token: "",
        userInfo: null,
    },
    onLaunch() {
        const token = wx.getStorageSync("perinest_token");
        if (token)
            this.globalData.token = token;
    },
});
