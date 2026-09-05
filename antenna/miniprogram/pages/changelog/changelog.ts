import { request } from "../../utils/request";

interface ChangelogSection { title: string; items: string[] }
interface ChangelogEntry { version: string; date: string; sections: ChangelogSection[] }
interface VersionInfo { version: string; changelog: ChangelogEntry[] }

Page({
  data: {
    version: "",
    entries: [] as ChangelogEntry[],
    loading: true,
  },
  onLoad() {
    request<VersionInfo>("/system/version")
      .then((info) => this.setData({ version: info.version, entries: info.changelog, loading: false }))
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: "加载失败", icon: "none" });
      });
  },
});
