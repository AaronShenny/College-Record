import { FileText } from "lucide-react";
import { Shell } from "@/components/shell";
import { PageHead, href } from "@/components/kit";

const PLANNED = [
  ["Template upload and mapping", "Choose your college's Word template and map its placeholders to program fields."],
  ["Word record generation", "Assemble included code and output into a .docx you check in Microsoft Word."],
  ["PDF export", "Convert a generated record to PDF for submission."],
  ["CSV / question extraction", "Bring in a list of questions from your lab manual."],
];

export default function DocumentsPage() {
  return (
    <Shell active="documents" crumb="Documents">
      <div className="page">
        <PageHead eyebrow="Not yet available" title="Documents" description="Record generation is planned for a later milestone. Nothing on this page is wired yet, so there are no buttons that pretend to work." />
        <section className="panel panel-pad" style={{ display: "grid", gap: 14 }}>
          <div className="notice"><FileText size={15} /><span>For now, prepare each program completely in the editor: title, question, your source files and the output you supplied. That content is what future generation will use.</span></div>
          {PLANNED.map(([t, d], i) => (
            <div key={t} style={{ display: "flex", gap: 14, alignItems: "flex-start", borderTop: "1px solid #ecece4", paddingTop: 12 }}>
              <span className="todo-number" style={{ font: "12px 'DM Mono',monospace", color: "#a45237", background: "#f7e9df", padding: 7, borderRadius: 5 }}>0{i + 1}</span>
              <div style={{ flex: 1 }}><b>{t}</b><p className="hint" style={{ margin: "3px 0 0" }}>{d}</p></div>
              <span className="badge neutral">Planned</span>
            </div>
          ))}
          <a className="btn primary" style={{ justifySelf: "start" }} href={href("/subjects")}>Go to my subjects</a>
        </section>
      </div>
    </Shell>
  );
}
