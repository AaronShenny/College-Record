import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { Shell } from "@/components/shell";
import { EmptyState, fmtTime, href } from "@/components/kit";
import { SubjectDialog } from "@/components/dialogs";
import { SubjectList } from "@/components/subject-list";
import { activePrograms, activeSubjects, pad, useStore } from "@/hooks/use-workspace";

export default function Dashboard(_: { subjectsOnly?: boolean }) {
  const { workspace } = useStore();
  const [open, setOpen] = useState(false);
  const subjects = activeSubjects(workspace!);
  const last = subjects.flatMap(s => activePrograms(s).map(p => ({ s, p }))).sort((a, b) => b.p.updatedAt.localeCompare(a.p.updatedAt))[0];
  const newBtn = <button className="btn primary" onClick={() => setOpen(true)} data-testid="button-new-subject"><Plus size={14} /> New subject</button>;

  return (
    <Shell active="subjects" crumb="Subjects">
      <div className="page home">
        {subjects.length === 0 ? (
          <div className="panel">
            <EmptyState mark="01" title="Your record desk is empty" action={newBtn}>
              Add a subject such as Data Structures Lab. Inside it you add numbered programs, your own code and the output screenshots you took.
            </EmptyState>
          </div>
        ) : <>
          <div className="home-head">
            <h1>Subjects</h1>
            {newBtn}
          </div>
          {last && <a className="resume" href={href(`/program/${last.s.id}/${last.p.id}`)} data-testid="link-resume">
            <span className="resume-no mono">{pad(last.p.number)}</span>
            <span className="resume-copy"><small>Continue · {fmtTime(last.p.updatedAt)}</small><b>{last.p.title || "Untitled program"}</b><small>{last.s.name}</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </a>}
          <section className="panel panel-pad"><SubjectList subjects={subjects} onNew={() => setOpen(true)} /></section>
        </>}
      </div>
      <SubjectDialog open={open} onClose={() => setOpen(false)} />
    </Shell>
  );
}
