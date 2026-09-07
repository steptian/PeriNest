import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

/** 通用弹窗壳（表单/详情共用） */
export default function Modal({
  open, title, onClose, children, width = "w-[480px]",
}: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; width?: string }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className={`panel-solid max-h-[85vh] overflow-y-auto rounded-xl p-6 ${width}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-specimen text-lg font-bold">{title}</h3>
          <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" onClick={onClose} aria-label={t("dialog.close")}><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
