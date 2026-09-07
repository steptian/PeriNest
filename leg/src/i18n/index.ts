/**
 * i18n 初始化 — Leg 三语（中/英/日）。
 *
 * 方案（wiki 待深入拍板版）：react-i18next + 静态 JSON 资源（无懒加载，模板务实）；
 * 语言偏好 localStorage `perinest-leg-lang` 持久化，默认 zh；fallback zh。
 * 用法：组件内 const { t } = useTranslation()；切换用 hooks/useLang 的 setLang。
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zh from "./zh.json";
import en from "./en.json";
import ja from "./ja.json";

export const LANG_KEY = "perinest-leg-lang";

export type Lang = "zh" | "en" | "ja";

/** 切换器展示（label 恒用各自语言自称，不随当前语言变） */
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
  interpolation: { escapeValue: false }, // React 已防注入
});

document.documentElement.lang = saved;

export default i18n;
