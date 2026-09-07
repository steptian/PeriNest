"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request_1 = require("../../utils/request");
const index_1 = require("../../i18n/index");
Page({
    data: {
        orders: [],
        isLoggedIn: false,
        loading: true,
        statusLabel: {},
        i18n: {},
    },
    onShow() {
        (0, index_1.applyTabBar)();
        this.applyI18n();
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
    applyI18n() {
        (0, index_1.applyNavTitle)("orders.navTitle");
        this.setData({ i18n: (0, index_1.ns)("orders"), statusLabel: (0, index_1.statusLabels)() });
    },
});
