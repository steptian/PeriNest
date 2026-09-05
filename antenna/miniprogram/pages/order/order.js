"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request_1 = require("../../utils/request");
Page({
    data: {
        orders: [],
        isLoggedIn: false,
        loading: true,
        statusLabel: { pending: "待支付", paid: "已支付", shipped: "已发货", completed: "已完成", cancelled: "已取消" },
    },
    onShow() {
        const token = getApp().globalData.token;
        if (!token) {
            this.setData({ isLoggedIn: false, loading: false, orders: [] });
            return;
        }
        this.setData({ isLoggedIn: true, loading: true });
        (0, request_1.request)("/orders")
            .then((orders) => this.setData({ orders, loading: false }))
            .catch((e) => {
            this.setData({ loading: false });
            wx.showToast({ title: e.message.slice(0, 30), icon: "none" });
        });
    },
});
