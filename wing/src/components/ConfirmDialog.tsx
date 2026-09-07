/** 危险操作二次确认（琥珀标本馆风格） */
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ConfirmDialog({
  open, title, message, confirmText, danger = true, onConfirm, onCancel,
}: {
  open: boolean; title: string; message: string;
  confirmText?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div className="panel-solid w-96 rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          {danger && <AlertTriangle className="h-5 w-5 text-red-500" />}
          <h3 className="font-specimen text-lg font-bold">{title}</h3>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{message}</p>
        <div className="flex justify-end gap-2.5">
          <button className="rounded-xl border px-4 py-2 text-sm hover:bg-muted" onClick={onCancel}>{t("dialog.cancel")}</button>
          <button
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white ${danger ? "bg-red-500 hover:bg-red-600" : "btn-amber"}`}
            onClick={onConfirm}
          >{confirmText ?? t("dialog.confirm")}</button>
        </div>
      </div>
    </div>
  );
}
