"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const wx_auth_1 = require("../../utils/wx_auth");
const request_1 = require("../../utils/request");
const STATUS_LABEL = {
    pending: "待处理", paid: "已支付", shipped: "已发货",
    completed: "已完成", cancelled: "已取消",
};
Page({
    data: {
        version: "0.1.0",
        username: "",
        today: "",
        recentOrders: [],
    },
    onLoad() {
        (0, wx_auth_1.ensureLogin)()
            .then(() => this.refresh())
            .catch(() => wx.showToast({ title: "登录失败", icon: "none" }));
        const d = new Date();
        this.setData({
            today: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`,
        });
    },
    async refresh() {
        try {
            const me = await (0, request_1.request)("/auth/me");
            this.setData({ username: me.username });
        }
        catch { }
        try {
            const orders = await (0, request_1.request)("/orders", { data: { limit: 2 } });
            this.setData({
                recentOrders: orders.map((o) => ({ ...o, statusLabel: STATUS_LABEL[o.status] || o.status })),
            });
        }
        catch { }
    },
});
