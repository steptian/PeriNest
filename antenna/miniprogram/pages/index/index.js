"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const wx_auth_1 = require("../../utils/wx_auth");
const request_1 = require("../../utils/request");
const index_1 = require("../../i18n/index");
Page({
    data: {
        version: "0.1.0",
        username: "",
        today: "",
        recentOrders: [],
        welcomeTitle: "",
        i18n: {},
    },
    onLoad() {
        (0, wx_auth_1.ensureLogin)()
            .then(() => this.refresh())
            .catch(() => wx.showToast({ title: (0, index_1.t)("home.loginFail"), icon: "none" }));
        const d = new Date();
        this.setData({
            today: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`,
        });
    },
    onShow() {
        (0, index_1.applyTabBar)();
        this.applyI18n();
    },
    applyI18n() {
        (0, index_1.applyNavTitle)("home.navTitle");
        const labels = (0, index_1.statusLabels)();
        const username = this.data.username;
        this.setData({
            i18n: (0, index_1.ns)("home"),
            welcomeTitle: username ? (0, index_1.t)("home.welcomeName", { name: username }) : (0, index_1.t)("home.welcome"),
            recentOrders: this.data.recentOrders.map((o) => ({
                ...o,
                statusLabel: labels[o.status] || o.status,
            })),
        });
    },
    goOrders() {
        wx.switchTab({ url: "/pages/order/order" });
    },
    async refresh() {
        try {
            const me = await (0, request_1.request)("/auth/me");
            this.setData({ username: me.username });
        }
        catch { }
        try {
            const orders = await (0, request_1.request)("/orders", { data: { limit: 2 } });
            const labels = (0, index_1.statusLabels)();
            this.setData({
                recentOrders: orders.map((o) => ({ ...o, statusLabel: labels[o.status] || o.status })),
            });
        }
        catch { }
        this.applyI18n();
    },
});
