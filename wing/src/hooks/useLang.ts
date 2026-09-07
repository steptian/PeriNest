/** 语言切换 — i18next changeLanguage + localStorage 持久化 + <html lang> 同步 */
import { useTranslation } from "react-i18next";
import { LANG_KEY, type Lang } from "@/i18n";

export function useLang() {
  const { i18n } = useTranslation();
  const lang = (i18n.language as Lang) || "zh";

  const setLang = (next: Lang) => {
    void i18n.changeLanguage(next);
    localStorage.setItem(LANG_KEY, next);
    document.documentElement.lang = next;
  };

  return { lang, setLang };
}
