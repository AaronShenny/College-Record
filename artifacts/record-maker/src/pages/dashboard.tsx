import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { Shell } from "@/components/shell";
import { EmptyState, href } from "@/components/kit";
import { SubjectDialog } from "@/components/dialogs";
import { SubjectList } from "@/components/subject-list";
import { activePrograms, activeSubjects, pad, useStore } from "@/hooks/use-workspace";

// `subjectsOnly` is accepted for the legacy #/subjects route; home and Subjects are the same page.
export default function Dashboard(_props: { subjectsOnly?: boolean }) {
  const { workspace } = useStore();
  const [open, setOpen] = useState(false);
  const subjects = activeSubjects(workspace!);
  const last = subjects.flatMap(s => activePrograms(s).map(p => ({ s, p }))).sort((a, b) => b.p.updatedAt.localeCompare(a.p.updatedAt))[0];

  return (
    <Shell active="subjects" crumb="Subjects">
      <div className="page home">
        <div className="home-head">
          <div><div className="eyebrow">Your record desk</div><h1>Subjects</h1></div>
          {last && <a className="resume" href={href(`/program/${last.s.id}/${last.p.id}`)} data-testid="link-resume">
            <span className="kicker">Continue</span><span><b className="mono">{pad(last.p.number)}</b> {last.p.title || "Untitled program"} <span className="muted">· {last.s.name}</span></span><ArrowRight size={14} /></a>}
        </div>
        {subjects.length === 0 ? (
          <div className="panel">
            <EmptyState mark="01" title="Your record desk is empty" action={<button className="btn primary" onClick={() => setOpen(true)} data-testid="button-new-subject"><Plus size={14} /> New subject</button>}>
              Start with one subject, for example Data Structures Lab. Inside it you add numbered programs with your code and output screenshots.
            </EmptyState>
          </div>
        ) : <SubjectList subjects={subjects} onNew={() => setOpen(true)} />}
      </div>
      <SubjectDialog open={open} onClose={() => setOpen(false)} />
    </Shell>
  );
}
