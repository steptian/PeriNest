"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request_1 = require("../../utils/request");
const index_1 = require("../../i18n/index");
Page({
    data: {
        appVersion: getApp().globalData.appVersion,
        isLoggedIn: false,
        username: "",
        i18n: {},
        langs: index_1.LANGS,
        lang: "zh",
        nickname: "",
    },
    onShow() {
        (0, index_1.applyTabBar)();
        const app = getApp();
        const token = app.globalData.token;
        this.setData({ isLoggedIn: !!token, username: "" });
        this.applyI18n();
        if (token) {
            (0, request_1.request)("/auth/me")
                .then((me) => {
                this.setData({ username: me.username });
                this.applyI18n();
            })
                .catch(() => { });
        }
    },
    applyI18n() {
        (0, index_1.applyNavTitle)("profile.navTitle");
        const { username, isLoggedIn } = this.data;
        this.setData({
            i18n: (0, index_1.ns)("profile"),
            lang: (0, index_1.getLang)(),
            nickname: isLoggedIn ? (username || (0, index_1.t)("profile.member")) : (0, index_1.t)("profile.guest"),
        });
    },
    onSetLang(e) {
        const code = e.currentTarget.dataset.code;
        (0, index_1.setLang)(code);
        this.applyI18n();
    },
    async logout() {
        wx.removeStorageSync("perinest_token");
        getApp().globalData.token = "";
        getApp().globalData.userInfo = null;
        wx.reLaunch({ url: "/pages/index/index" });
    },
});
