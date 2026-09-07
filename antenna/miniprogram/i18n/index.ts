/**
 * Antenna 轻量 i18n — 自研 dict（无 i18next）。
 * 偏好 wx.Storage `perinest-antenna-lang`，默认/缺 key 回退 zh。
 * 微信壳（tabBar / 导航标题）须运行时 set，app.json 保持中文冷启动默认。
 * 字典必须是 .ts/.js：微信 require 不认 JSON（会去找 zh.json.js）。
 */
import { zh } from "./zh";
import { en } from "./en";
import { ja } from "./ja";

export const LANG_KEY = "perinest-antenna-lang";

export type Lang = "zh" | "en" | "ja";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "zh", label: "中文" },
  { code: "en", label: "EN" },
  { code: "ja", label: "日本語" },
];

type DictNode = { [k: string]: string | DictNode };

const DICTS: Record<Lang, DictNode> = { zh, en, ja };

const TAB_KEYS = ["nav.home", "nav.orders", "nav.chat", "nav.profile"] as const;

function isLang(v: unknown): v is Lang {
  return v === "zh" || v === "en" || v === "ja";
}

function lookup(node: DictNode | string | undefined, parts: string[]): string | undefined {
  let cur: DictNode | string | undefined = node;
  for (const p of parts) {
    if (cur == null || typeof cur === "string") return undefined;
    cur = cur[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function getLang(): Lang {
  const saved = wx.getStorageSync(LANG_KEY);
  return isLang(saved) ? saved : "zh";
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const parts = key.split(".");
  const raw = lookup(DICTS[getLang()], parts) ?? lookup(DICTS.zh, parts) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    vars[name] == null ? "" : String(vars[name])
  );
}

export function ns(name: string): Record<string, string> {
  const parts = name.split(".");
  const take = (dict: DictNode): Record<string, string> | undefined => {
    let cur: DictNode | string | undefined = dict;
    for (const p of parts) {
      if (cur == null || typeof cur === "string") return undefined;
      cur = cur[p];
    }
    if (cur == null || typeof cur === "string") return undefined;
    const out: Record<string, string> = {};
    for (const k of Object.keys(cur)) {
      const v = cur[k];
      if (typeof v === "string") out[k] = v;
    }
    return out;
  };
  return take(DICTS[getLang()]) ?? take(DICTS.zh) ?? {};
}

export function statusLabels(): Record<string, string> {
  return {
    pending: t("status.pending"),
    paid: t("status.paid"),
    shipped: t("status.shipped"),
    completed: t("status.completed"),
    cancelled: t("status.cancelled"),
  };
}

export function applyTabBar(): void {
  TAB_KEYS.forEach((key, index) => {
    wx.setTabBarItem({ index, text: t(key) });
  });
}

export function applyNavTitle(key: string): void {
  wx.setNavigationBarTitle({ title: t(key) });
}

export function setLang(next: Lang): void {
  if (!isLang(next)) return;
  wx.setStorageSync(LANG_KEY, next);
  applyTabBar();
}
