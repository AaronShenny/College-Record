import { go } from "./kit";

/** Cross-page "fix this" links: navigate, then focus the real input once it renders. */
type Intent = { selector?: string; programField?: { pid: string; field: string }; openSubjectEdit?: string };
const KEY = "crm-focus-intent";
export function goFocus(path: string, intent: Intent) {
  try { sessionStorage.setItem(KEY, JSON.stringify(intent)); } catch { /* storage unavailable: navigate only */ }
  go(path);
}
export function takeIntent(match: (i: Intent) => boolean): Intent | null {
  try {
    const raw = sessionStorage.getItem(KEY); if (!raw) return null;
    const i = JSON.parse(raw) as Intent; if (!match(i)) return null;
    if (!i.selector) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify({ selector: i.selector }));
    return i;
  } catch { return null; }
}
/** Poll briefly for a pending selector intent and focus it. */
export function runSelectorIntent() {
  let tries = 0;
  const tick = () => {
    let i: Intent | null = null;
    try { const raw = sessionStorage.getItem(KEY); i = raw ? JSON.parse(raw) as Intent : null; } catch { return; }
    if (!i?.selector || i.programField || i.openSubjectEdit) { if (i && tries++ < 20) window.setTimeout(tick, 100); return; }
    const el = document.querySelector<HTMLElement>(i.selector);
    if (el) { sessionStorage.removeItem(KEY); el.scrollIntoView({ block: "center" }); el.focus(); return; }
    if (tries++ < 25) window.setTimeout(tick, 100); else sessionStorage.removeItem(KEY);
  };
  window.setTimeout(tick, 60);
}
/** Where to send a missing required item. Program-level items open the editor and its disclosure. */
export function fixMissing(sid: string, pid: string, field: string, scopeOf: (id: string) => string | undefined) {
  if (field === "subject.name" || field === "semester" || field === "courseCode") {
    const sel = field === "subject.name" ? "input-subject-name" : field === "semester" ? "input-subject-semester" : "input-subject-code";
    return goFocus(`/subject/${sid}`, { openSubjectEdit: sid, selector: `[data-testid="${sel}"]` });
  }
  if (field.startsWith("custom:") && scopeOf(field.slice(7)) === "subject") {
    const id = field.slice(7);
    return goFocus(`/template/${sid}`, { selector: `[data-testid="input-field-${id}"], [data-testid="button-image-${id}"]` });
  }
  if (field.startsWith("Unknown") || (field.startsWith("custom:") && !scopeOf(field.slice(7)))) return goFocus(`/template/${sid}`, {});
  goFocus(`/program/${sid}/${pid}`, { programField: { pid, field } });
}
