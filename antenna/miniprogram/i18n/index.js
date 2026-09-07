"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LANGS = exports.LANG_KEY = void 0;
exports.getLang = getLang;
exports.t = t;
exports.ns = ns;
exports.statusLabels = statusLabels;
exports.applyTabBar = applyTabBar;
exports.applyNavTitle = applyNavTitle;
exports.setLang = setLang;
const zh_1 = require("./zh");
const en_1 = require("./en");
const ja_1 = require("./ja");
exports.LANG_KEY = "perinest-antenna-lang";
exports.LANGS = [
    { code: "zh", label: "中文" },
    { code: "en", label: "EN" },
    { code: "ja", label: "日本語" },
];
const DICTS = { zh: zh_1.zh, en: en_1.en, ja: ja_1.ja };
const TAB_KEYS = ["nav.home", "nav.orders", "nav.chat", "nav.profile"];
function isLang(v) {
    return v === "zh" || v === "en" || v === "ja";
}
function lookup(node, parts) {
    let cur = node;
    for (const p of parts) {
        if (cur == null || typeof cur === "string")
            return undefined;
        cur = cur[p];
    }
    return typeof cur === "string" ? cur : undefined;
}
function getLang() {
    const saved = wx.getStorageSync(exports.LANG_KEY);
    return isLang(saved) ? saved : "zh";
}
function t(key, vars) {
    const parts = key.split(".");
    const raw = lookup(DICTS[getLang()], parts) ?? lookup(DICTS.zh, parts) ?? key;
    if (!vars)
        return raw;
    return raw.replace(/\{\{(\w+)\}\}/g, (_, name) => vars[name] == null ? "" : String(vars[name]));
}
function ns(name) {
    const parts = name.split(".");
    const take = (dict) => {
        let cur = dict;
        for (const p of parts) {
            if (cur == null || typeof cur === "string")
                return undefined;
            cur = cur[p];
        }
        if (cur == null || typeof cur === "string")
            return undefined;
        const out = {};
        for (const k of Object.keys(cur)) {
            const v = cur[k];
            if (typeof v === "string")
                out[k] = v;
        }
        return out;
    };
    return take(DICTS[getLang()]) ?? take(DICTS.zh) ?? {};
}
function statusLabels() {
    return {
        pending: t("status.pending"),
        paid: t("status.paid"),
        shipped: t("status.shipped"),
        completed: t("status.completed"),
        cancelled: t("status.cancelled"),
    };
}
function applyTabBar() {
    TAB_KEYS.forEach((key, index) => {
        wx.setTabBarItem({ index, text: t(key) });
    });
}
function applyNavTitle(key) {
    wx.setNavigationBarTitle({ title: t(key) });
}
function setLang(next) {
    if (!isLang(next))
        return;
    wx.setStorageSync(exports.LANG_KEY, next);
    applyTabBar();
}
