"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request_1 = require("../../utils/request");
Page({
    data: {
        appVersion: getApp().globalData.appVersion,
        isLoggedIn: false,
        username: "",
    },
    onShow() {
        const app = getApp();
        const token = app.globalData.token;
        this.setData({ isLoggedIn: !!token, username: "" });
        if (token) {
            (0, request_1.request)("/auth/me")
                .then((me) => this.setData({ username: me.username }))
                .catch(() => { });
        }
    },
    async logout() {
        wx.removeStorageSync("perinest_token");
        getApp().globalData.token = "";
        getApp().globalData.userInfo = null;
        wx.reLaunch({ url: "/pages/index/index" });
    },
});
