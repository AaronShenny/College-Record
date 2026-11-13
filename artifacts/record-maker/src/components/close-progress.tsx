import { useEffect, useRef } from "react";

/** Mounted even while startup/sign-in is showing; native close never disappears. */
export function CloseProgress({ state, message, retry, cancel }: {
  state: "idle" | "saving" | "error"; message?: string; retry: () => void; cancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (state !== "idle" && !dialog.current?.open) dialog.current?.showModal();
    if (state === "idle" && dialog.current?.open) dialog.current.close();
  }, [state]);
  return <dialog ref={dialog} className="crm-modal" aria-labelledby="closing-heading"
    onCancel={e => { e.preventDefault(); if (state === "error") cancel(); }}>
    <div className="crm" style={{ minHeight: 0, padding: 24 }} data-testid="dialog-safe-close">
      <h2 id="closing-heading">{state === "error" ? "Recordly is still open" : "Saving before closing"}</h2>
      <p role={state === "error" ? "alert" : "status"}>{message}</p>
      {state === "saving" ? <p className="hint">Please wait. Recordly will close only after Drive confirms the save.</p> :
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" autoFocus onClick={cancel} data-testid="button-return-editing">Return to editing</button>
          <button className="btn primary" onClick={retry} data-testid="button-retry-close">Retry save & close</button>
        </div>}
    </div>
  </dialog>;
}
