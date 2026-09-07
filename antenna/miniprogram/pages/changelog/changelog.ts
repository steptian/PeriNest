import { request } from "../../utils/request";
import { applyNavTitle, ns, t } from "../../i18n/index";

interface InlineRun { t: "text" | "bold" | "code"; s: string }
interface ChangelogSection { title: string; items: InlineRun[][] }
interface ChangelogEntry { version: string; date: string; sections: ChangelogSection[] }
interface VersionInfo { version: string; changelog: ChangelogEntry[] }

Page({
  data: {
    version: "",
    entries: [] as ChangelogEntry[],
    loading: true,
    i18n: {} as Record<string, string>,
  },
  onShow() {
    this.applyI18n();
  },
  applyI18n() {
    applyNavTitle("changelog.navTitle");
    this.setData({ i18n: ns("changelog") });
  },
  onLoad() {
    request<VersionInfo>("/system/version")
      .then((info) => this.setData({ version: info.version, entries: info.changelog, loading: false }))
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: t("changelog.loadFail"), icon: "none" });
      });
  },
});
