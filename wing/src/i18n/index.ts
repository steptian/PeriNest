/**
 * i18n 初始化 — Wing 三语（中/英/日），同 Leg 试点模式。
 *
 * react-i18next + 静态 JSON；偏好 localStorage `perinest-wing-lang` 持久化，
 * 默认 zh，fallback zh。业务页 key 分批补充（缺 key 时 i18next 回退 zh——
 * 渐进替换安全，任意时刻页面可编译可运行）。
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zh from "./zh.json";
import en from "./en.json";
import ja from "./ja.json";

export const LANG_KEY = "perinest-wing-lang";

export type Lang = "zh" | "en" | "ja";

/** 切换器展示（label 恒用各自语言自称） */
export const LANGS: { code: Lang; label: string }[] = [
  { code: "zh", label: "中文" },
  { code: "en", label: "EN" },
  { code: "ja", label: "日本語" },
];

const saved = (localStorage.getItem(LANG_KEY) as Lang) || "zh";

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
    ja: { translation: ja },
  },
  lng: saved,
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
});

document.documentElement.lang = saved;

export default i18n;
