"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request_1 = require("../../utils/request");
const index_1 = require("../../i18n/index");
Page({
    data: {
        version: "",
        entries: [],
        loading: true,
        i18n: {},
    },
    onShow() {
        this.applyI18n();
    },
    applyI18n() {
        (0, index_1.applyNavTitle)("changelog.navTitle");
        this.setData({ i18n: (0, index_1.ns)("changelog") });
    },
    onLoad() {
        (0, request_1.request)("/system/version")
            .then((info) => this.setData({ version: info.version, entries: info.changelog, loading: false }))
            .catch(() => {
            this.setData({ loading: false });
            wx.showToast({ title: (0, index_1.t)("changelog.loadFail"), icon: "none" });
        });
    },
});
