import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import type { Workspace } from "../src/lib/contracts";
import type { DashboardIndex } from "./summary-index";
import { verifyIndexContent } from "./verify-index";
import { frames, invoke, mark, pageSignals, waitFor, fail } from "./signals";
import "../src/index.css";
import "../src/app.css";

// This is a read-only summary screen, not a partly hydrated editable Workspace.
// No production provider, browser-storage fallback or save bridge is installed.
function SummaryScreen({ index }: { index: DashboardIndex }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(false);
  const [content, setContent] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(false);
  async function openContent() {
    if (loading) return;
    setLoading(true);
    try {
      await mark("detailRequested");
      const workspace = await invoke<Workspace>("load_fixture");
      verifyIndexContent(index, workspace);
      setContent(workspace);
    } catch { await fail(); }
  }
  const first = content?.subjects[0].programs[0];
  const image = first?.outputs.find(o => o.kind === "image");
  return <div className="crm"><main className="page home" style={{ maxWidth: 1100, margin: "40px auto" }}>
    <div className="eyebrow">Isolated synthetic benchmark · summary-first Rust reader</div>
    <h1>Subjects</h1>
    <p>4 subjects · 80 programs. Source code and screenshots load only on request. Editing and Drive are disabled.</p>
    <label>Search subjects <input data-testid="summary-search" value={query} onChange={e => setQuery(e.target.value)} /></label>
    {index.subjects.filter(s => s.name.toLowerCase().includes(query.toLowerCase())).map(subject =>
      <section className="panel" key={subject.id} data-testid="summary-subject" style={{ marginTop: 12, padding: 16 }}>
        <h2>{subject.name}</h2><p>Semester {subject.semester} · {subject.courseCode} · {subject.programs.length} programs</p>
        <p>First program: {subject.programs[0].number}. {subject.programs[0].title}</p>
      </section>)}
    <button className="btn" data-testid="summary-select" onClick={() => setSelected(true)}>Select first program</button>
    {selected && <div role="dialog" aria-label="Program summary" className="panel">
      <p data-testid="summary-selection">{index.subjects[0].programs[0].title}</p>
      <button className="btn" data-testid="summary-close" onClick={() => setSelected(false)}>Close</button>
    </div>}
    <button className="btn primary" data-testid="summary-load-content" disabled={loading} onClick={() => void openContent()}>
      {loading ? "Loading full test records…" : "Load code and screenshots"}
    </button>
    {first && <section className="panel" data-testid="summary-content">
      <h2>{first.title} — actual stored content</h2>
      <pre>{first.sources[0].code}</pre>
      {image?.kind === "image" && <img data-testid="summary-image" src={image.dataUrl} alt="Stored synthetic program output" />}
    </section>}
  </main></div>;
}

async function run() {
  await pageSignals();
  await mark("dashboardLoading");
  const index = await invoke<DashboardIndex>("load_summary");
  if (index.schemaVersion !== 2 || index.subjects.length !== 4 ||
      index.subjects.reduce((n, s) => n + s.programs.length, 0) !== 80) throw new Error("Incomplete summary");
  createRoot(document.getElementById("root")!).render(<SummaryScreen index={index} />);
  const select = await waitFor(() => document.querySelector<HTMLButtonElement>('[data-testid="summary-select"]'));
  if (document.querySelectorAll('[data-testid="summary-subject"]').length !== 4) throw new Error("Missing subjects");
  await mark("dashboardDataReady");
  await frames();
  await mark("dashboardPainted");
  await mark("dashboardOpening");
  select.click();
  await waitFor(() => document.querySelector('[data-testid="summary-selection"]'));
  await mark("dashboardClosing");
  document.querySelector<HTMLButtonElement>('[data-testid="summary-close"]')!.click();
  await waitFor(() => !document.querySelector('[data-testid="summary-selection"]'));
  await frames();
  await mark("interactionComplete");
  await new Promise(r => setTimeout(r, 250));
  await mark("responsive");
  document.getElementById("test-status")!.textContent = "Dashboard usable · Now separately checking deferred code and screenshots…";
  // Deliberately AFTER dashboard readiness. Report this second measurement,
  // rather than claiming record content or production features are ready.
  document.querySelector<HTMLButtonElement>('[data-testid="summary-load-content"]')!.click();
  const image = await waitFor(() => document.querySelector<HTMLImageElement>('[data-testid="summary-image"]'), 55_000);
  await image.decode();
  await frames();
  await mark("detailVerified");
  document.getElementById("test-status")!.textContent = "Summary interaction passed · All 80 full records verified · First code and screenshot displayed";
}
void run().catch(fail);
