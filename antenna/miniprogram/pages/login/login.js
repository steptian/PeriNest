"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request_1 = require("../../utils/request");
const index_1 = require("../../i18n/index");
Page({
    data: {
        username: "",
        password: "",
        error: "",
        loading: false,
        i18n: {},
    },
    onShow() {
        this.applyI18n();
    },
    applyI18n() {
        (0, index_1.applyNavTitle)("login.navTitle");
        this.setData({ i18n: (0, index_1.ns)("login") });
    },
    onUser(e) { this.setData({ username: e.detail.value }); },
    onPwd(e) { this.setData({ password: e.detail.value }); },
    async pwdLogin() {
        const { username, password } = this.data;
        if (!username || !password) {
            this.setData({ error: (0, index_1.t)("login.required") });
            return;
        }
        this.setData({ loading: true, error: "" });
        try {
            const resp = await (0, request_1.request)("/auth/login", {
                method: "POST",
                data: { username, password },
                auth: false,
            });
            const app = getApp();
            app.globalData.token = resp.access_token;
            wx.setStorageSync("perinest_token", resp.access_token);
            wx.showToast({ title: (0, index_1.t)("login.nested"), icon: "success" });
            setTimeout(() => wx.reLaunch({ url: "/pages/index/index" }), 600);
        }
        catch (e) {
            this.setData({ error: e.message.slice(0, 50) });
        }
        finally {
            this.setData({ loading: false });
        }
    },
    async wxLogin() {
        this.setData({ loading: true, error: "" });
        try {
            const { silentLogin } = require("../../utils/request");
            await silentLogin();
            wx.showToast({ title: (0, index_1.t)("login.nested"), icon: "success" });
            setTimeout(() => wx.reLaunch({ url: "/pages/index/index" }), 600);
        }
        catch (e) {
            this.setData({ error: (0, index_1.t)("login.wxFail", { message: e.message.slice(0, 40) }) });
        }
        finally {
            this.setData({ loading: false });
        }
    },
});
