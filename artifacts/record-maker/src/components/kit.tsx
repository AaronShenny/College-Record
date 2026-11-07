import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useStore } from "@/hooks/use-workspace";

export function useHashRoute(canLeave?: () => boolean): string[] {
  const { drafts, notify } = useStore();
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const acceptedHash = useRef(window.location.hash);
  const guard = useRef(canLeave);
  guard.current = canLeave;
  const read = () => (window.location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
  const [parts, setParts] = useState<string[]>(read);
  useEffect(() => {
    const f = () => {
      if (draftsRef.current.size && window.location.hash !== acceptedHash.current) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search + acceptedHash.current);
        notify("Fix the highlighted unsaved fields before leaving this program. Your draft has not been discarded.", "error");
        const invalid = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        if (invalid) {
          const sourcePanel = invalid.closest<HTMLElement>('[role="tabpanel"][hidden]');
          if (sourcePanel) {
            const tabId = sourcePanel.getAttribute("aria-labelledby");
            if (tabId) document.getElementById(tabId)?.click();
          }
          let parent = invalid.parentElement;
          while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
          requestAnimationFrame(() => {
            invalid.focus();
            invalid.scrollIntoView({ block: "center" });
          });
        }
        return;
      }
      if (guard.current && !guard.current()) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search + acceptedHash.current);
        return;
      }
      acceptedHash.current = window.location.hash;
      setParts(read()); window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, [notify]);
  return parts;
}
export const href = (path: string) => "#" + path;
export const go = (path: string) => { window.location.hash = path; };

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="crm-modal" aria-labelledby={id} onClose={onClose} onCancel={e => { e.preventDefault(); onClose(); }}>
      {open && <div className="crm" style={{ minHeight: 0, background: "transparent" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px 6px" }}>
          <h2 id={id} style={{ margin: 0 }}>{title}</h2>
          <button className="icon-btn" aria-label="Close dialog" onClick={onClose} data-testid="button-close-dialog"><X size={15} /></button>
        </div>
        <div style={{ padding: "8px 18px 16px", display: "grid", gap: 14 }}>{children}</div>
        {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 18px", borderTop: "1px solid var(--line)", background: "#f8f6ee", borderRadius: "0 0 12px 12px" }}>{footer}</div>}
      </div>}
    </dialog>
  );
}

export function PageHead({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-head"><div style={{ minWidth: 0 }}><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p className="subhead">{description}</p>}</div>{actions && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>}</div>;
}

export function EmptyState({ mark, title, children, action }: { mark: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><div className="empty-sheet" aria-hidden="true">{mark}</div><h2>{title}</h2><p>{children}</p>{action}</div>;
}

export function fmtTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
