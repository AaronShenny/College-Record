import { useState } from "react";
import { ArrowRight, CloudOff, Plus } from "lucide-react";
import { Shell } from "@/components/shell";
import { EmptyState, PageHead, fmtTime, href } from "@/components/kit";
import { SubjectDialog } from "@/components/dialogs";
import { SubjectList } from "@/components/subject-list";
import { activePrograms, activeSubjects, pad, programState, slug, useStore } from "@/hooks/use-workspace";
import { pendingItemCount } from "@/lib/contracts";

export default function Dashboard({ subjectsOnly = false }: { subjectsOnly?: boolean }) {
  const { workspace } = useStore();
  const [open, setOpen] = useState(false);
  const subjects = activeSubjects(workspace!);
  const all = subjects.flatMap(s => activePrograms(s).map(p => ({ s, p, st: programState(p) })));
  const ready = all.filter(x => x.st.tone === "good").length;
  const todo = all.filter(x => x.st.tone !== "good").sort((a, b) => b.p.updatedAt.localeCompare(a.p.updatedAt));
  const recent = [...all].sort((a, b) => b.p.updatedAt.localeCompare(a.p.updatedAt)).slice(0, 4);
  const focus = recent[0]?.s ?? [...subjects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const focusProgs = focus ? activePrograms(focus) : [];
  const focusReady = focusProgs.filter(p => programState(p).tone === "good").length;
  const newBtn = <button className="btn primary" onClick={() => setOpen(true)} data-testid="button-new-subject"><Plus size={14} /> New subject</button>;

  return (
    <Shell active={subjectsOnly ? "subjects" : "dashboard"} crumb={subjectsOnly ? "Subjects" : "Dashboard"}>
      <div className="page">
        {subjects.length === 0 ? (
          <div className="panel">
            <EmptyState mark="01" title="Your record desk is empty" action={newBtn}>
              Start with one subject, for example your Data Structures Lab. Inside it you add numbered programs with their question, your own source files and the output screenshots you took.
            </EmptyState>
            <div style={{ padding: "0 24px 22px" }}><div className="notice blue">This workspace is local. Nothing is uploaded, and no sample records are included, so everything you see here is yours.</div></div>
          </div>
        ) : subjectsOnly ? (
          <>
            <PageHead eyebrow={`${subjects.length} active subject${subjects.length === 1 ? "" : "s"}`} title="Subjects" description="Each subject keeps its own numbered programs. Search by name or course code, or filter by semester." actions={newBtn} />
            <section className="panel panel-pad"><SubjectList subjects={subjects} onNew={() => setOpen(true)} /></section>
          </>
        ) : (
          <>
            <PageHead eyebrow={new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })} title="Your study desk" description="Pick up where you left off. Records stay organized by semester and subject." actions={newBtn} />
            {focus && (
              <div className="dash-welcome">
                <div><div className="kicker">Current focus</div><h2>{focus.name}</h2>
                  <p>{focus.courseCode || "No course code"} · semester {focus.semester} · {focusProgs.length} program{focusProgs.length === 1 ? "" : "s"}</p>
                  <a href={href(`/subject/${focus.id}`)} className="text-link" data-testid="link-focus-subject">Continue this subject <ArrowRight size={13} /></a></div>
                <div className="welcome-progress"><div className="progress-count">{focusReady}<span>/{focusProgs.length}</span></div>
                  <div className="progress-track"><i style={{ width: `${focusProgs.length ? (focusReady / focusProgs.length) * 100 : 0}%` }} /></div>
                  <div className="hint">{focusProgs.length ? `${focusReady} ready · ${focusProgs.length - focusReady} still need something` : "Add your first program to this subject"}</div></div>
                <div className="welcome-stamp"><span>ALL SUBJECTS</span><b>{todo.length}</b><small>record{todo.length === 1 ? "" : "s"} to finish</small></div>
              </div>
            )}
            <div className="dash-grid">
              <section className="panel panel-pad">
                <div className="section-title"><div><h2>Your subjects</h2><div className="hint">Shown as semester-XX / subject-name</div></div><span className="badge neutral">{ready}/{all.length} programs ready</span></div>
                <SubjectList subjects={subjects} onNew={() => setOpen(true)} />
              </section>
              <aside className="dash-side">
                <section className="panel panel-pad">
                  <div className="section-title"><h2>Next to finish</h2><span className={`badge ${todo.length ? "alert" : "good"}`}>{todo.length} item{todo.length === 1 ? "" : "s"}</span></div>
                  {todo.length === 0 && <p className="hint">{all.length ? "Every program has a title, question, code and output." : "No programs yet. Open a subject to add one."}</p>}
                  {todo.slice(0, 5).map(({ s, p, st }) => (
                    <a key={p.id} href={href(`/program/${s.id}/${p.id}`)} className="todo" data-testid={`link-todo-${p.id}`}>
                      <span className="todo-number">{pad(p.number)}</span>
                      <span><b>{p.title || "Untitled program"}</b><small>{s.name} · {st.missing.length ? "add " + st.missing[0] : st.label.toLowerCase()}</small></span>
                      <ArrowRight size={13} color="#8a9991" aria-hidden="true" />
                    </a>
                  ))}
                </section>
                <section className="panel offline-card">
                  <span className="offline-symbol"><CloudOff size={15} /></span>
                  <div><h3>Local work only</h3><p>{pendingItemCount(workspace!)} item{pendingItemCount(workspace!) === 1 ? "" : "s"} are waiting for a future Drive sync. Google sign-in is not connected in this build.</p><a href={href("/settings")}>Review runtime and storage</a></div>
                </section>
                {recent[0] && <div className="path-note" data-num={pad(recent[0].p.number)}>
                  <div className="kicker">Last worked on · {fmtTime(recent[0].p.updatedAt)}</div>
                  <h2>{recent[0].p.title || "Untitled program"}</h2>
                  <p>{recent[0].s.name}</p>
                  <a className="btn small" href={href(`/program/${recent[0].s.id}/${recent[0].p.id}`)}>Open in editor</a>
                  <div className="mono hint">semester-{pad(recent[0].s.semester)} / {slug(recent[0].s.name)}</div>
                </div>}
              </aside>
            </div>
          </>
        )}
        <div className="screen-footer"><span>Local foundation build · no code is ever executed</span><span>Sign-in and Drive sync are not connected</span></div>
      </div>
      <SubjectDialog open={open} onClose={() => setOpen(false)} />
    </Shell>
  );
}
