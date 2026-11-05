import "./_group.css";
import { Chrome, PageHead } from "./_shared/Chrome";

const subjects = [
  {code:"CSL 201",name:"Data Structures Lab",semester:"semester-04",done:"6 of 9 records ready",status:"In progress",tone:"warn",mark:"DS"},
  {code:"CSL 203",name:"Database Management Systems Lab",semester:"semester-04",done:"8 of 8 records ready",status:"Ready",tone:"good",mark:"DB"},
  {code:"CSL 301",name:"Object Oriented Programming Lab",semester:"semester-05",done:"3 of 10 records ready",status:"Needs attention",tone:"alert",mark:"OP"},
];

export function Dashboard() {
  return <Chrome active="Dashboard"><div className="page">
    <PageHead eyebrow="Your study desk · Wednesday, 12 March" title="Good afternoon, Raj." description="Pick up where you left off. Your records stay organized by semester and subject." actions={<a className="btn primary" href="/__mockup/preview/college-record-maker/Subject">＋ New subject</a>}/>
    <div className="dash-welcome">
      <div><div className="kicker">Current focus</div><h2>Data Structures Lab</h2><p>CSL 201 <span>·</span> semester-04 <span>·</span> 9 programs</p><a href="/__mockup/preview/college-record-maker/Subject" className="text-link">Continue this subject <span>→</span></a></div>
      <div className="welcome-progress"><div className="progress-count">6<span>/9</span></div><div><div className="progress-track"><i style={{width:"67%"}}/></div><div className="hint">6 complete · 2 need output · 1 needs code</div></div></div>
      <div className="welcome-stamp"><span>THIS WEEK</span><b>3</b><small>records to finish</small></div>
    </div>
    <div className="dash-grid">
      <section className="panel dash-subjects"><div className="section-title"><div><h2>Your subjects</h2><div className="hint">Stored as semester-XX / subject-name</div></div><a className="btn small" href="/__mockup/preview/college-record-maker/Subject">View subject</a></div>
        {subjects.map((s,i)=><a className="subject-row" href="/__mockup/preview/college-record-maker/Subject" key={s.code}><span className={`subject-mark mark-${i}`}>{s.mark}</span><span className="subject-info"><span className="subject-name">{s.name}</span><span className="subject-path mono">{s.semester} / {s.name.toLowerCase().replaceAll(" ","-")}</span></span><span className="subject-last">{s.done}</span><span className={`badge ${s.tone}`}>{s.status}</span><span className="row-chevron">›</span></a>)}
        <a className="add-subject" href="/__mockup/preview/college-record-maker/Subject">＋ <span>Create a subject record</span></a>
      </section>
      <aside className="dash-side">
        <section className="panel panel-pad">
          <div className="section-title"><h2>Next to finish</h2><span className="badge alert">3 items</span></div>
          <a href="/__mockup/preview/college-record-maker/ProgramEditor" className="todo"><span className="todo-number">04</span><span><b>Binary search tree traversal</b><small>Data Structures Lab · add output</small></span><span>→</span></a>
          <a href="/__mockup/preview/college-record-maker/ProgramEditor" className="todo"><span className="todo-number">07</span><span><b>Graph traversal using BFS</b><small>Data Structures Lab · add main code</small></span><span>→</span></a>
          <a href="/__mockup/preview/college-record-maker/ProgramEditor" className="todo"><span className="todo-number">09</span><span><b>Hash table operations</b><small>Data Structures Lab · add output</small></span><span>→</span></a>
        </section>
        <section className="panel offline-card"><span className="offline-symbol">⌁</span><div><h3>Local work is available</h3><p>2 saved changes are waiting for a connection. Drive status is shown separately.</p><a href="/__mockup/preview/college-record-maker/Settings">Review sync status →</a></div></section>
      </aside>
    </div>
    <div className="dash-bottom">
      <div className="panel recent-card"><div className="section-title"><h2>Recently opened</h2><span className="muted" style={{fontSize:11}}>Last worked on</span></div><div className="recent-list"><a href="/__mockup/preview/college-record-maker/ProgramEditor"><span className="recent-file">04</span><span><b>Binary search tree traversal</b><small>CSL 201 · Program 04</small></span><span className="recent-time">Today, 2:18 pm</span></a><a href="/__mockup/preview/college-record-maker/TemplateMapping"><span className="recent-file doc">T</span><span><b>DS Lab Record Template.docx</b><small>Data Structures Lab · mapping review</small></span><span className="recent-time">Yesterday</span></a></div></div>
      <div className="path-note"><div className="kicker">A place for your records</div><h2>One subject.<br/>One active template.</h2><p>Programs stay in number order. Each subject keeps its own template and mapping set.</p><span className="mono">semester-04 / data-structures-lab</span></div>
    </div>
    <div className="screen-footer"><span>Concept screen · example Rajagiri student data</span><span>Sign-in and Drive actions are not connected</span></div>
    <style>{`
      .dash-welcome{background:var(--teal);color:#f7f4eb;border-radius:12px;padding:22px 25px;display:grid;grid-template-columns:1.25fr 1fr 135px;align-items:center;gap:27px;margin:20px 0 22px;position:relative;overflow:hidden}
      .dash-welcome:after{content:'';position:absolute;width:240px;height:240px;border:1px solid #ffffff16;border-radius:50%;right:145px;top:-130px;box-shadow:0 0 0 28px #ffffff09,0 0 0 58px #ffffff07}
      .dash-welcome .kicker{color:#c7d8cc}.dash-welcome h2{font-size:24px;margin:4px 0}.dash-welcome p{font-size:11px;color:#d5dfd7;margin:0 0 12px}.dash-welcome p span{padding:0 5px;color:#d6b66c}
      .text-link{font-size:11px;font-weight:700;color:#f3d48c}.text-link span{padding-left:7px}
      .progress-count{font:500 30px 'Newsreader',serif;margin-bottom:8px}.progress-count span{font-size:16px;color:#bed0c6}
      .progress-track{width:100%;height:6px;background:#ffffff35;border-radius:10px;overflow:hidden}.progress-track i{display:block;height:100%;background:#e4bd66;border-radius:10px}.welcome-progress .hint{color:#d3ded8;margin-top:8px}
      .welcome-stamp{border-left:1px solid #ffffff38;padding-left:22px;display:grid;gap:3px}.welcome-stamp span{font:9px 'DM Mono',monospace;color:#d9c78e;letter-spacing:.1em}.welcome-stamp b{font:500 35px 'Newsreader',serif}.welcome-stamp small{font-size:10px;color:#d5dfd7}
      .dash-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(275px,.9fr);gap:17px}.dash-subjects{padding:18px}.subject-row{display:flex;align-items:center;gap:12px;padding:12px 8px;border-top:1px solid #ecece4}.subject-row:hover{background:#f8f7f0}.subject-mark{width:36px;height:36px;border-radius:8px;display:grid;place-items:center;background:#e0e9df;color:#476758;font:11px 'DM Mono',monospace}.mark-1{background:#f3e9d2;color:#8d6d30}.mark-2{background:#f2e2db;color:#985037}.subject-info{flex:1;min-width:0}.subject-name{display:block;font-size:12px;font-weight:700}.subject-path{display:block;font-size:9px;color:#89918a;margin-top:3px}.subject-last{font-size:10px;color:var(--muted);width:120px}.row-chevron{color:#8a9690;font-size:18px}.add-subject{display:inline-flex;gap:7px;align-items:center;margin:12px 7px 0;color:var(--teal);font-size:11px;font-weight:700}
      .dash-side{display:grid;gap:13px;align-content:start}.dash-side .panel-pad{padding:16px}.todo{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #eeece4}.todo-number{font:12px 'DM Mono',monospace;color:#a45237;background:#f7e9df;padding:7px;border-radius:5px}.todo b,.todo small{display:block}.todo b{font-size:10px}.todo small{font-size:9px;color:var(--muted);margin-top:3px}.todo>span:nth-child(2){flex:1}.todo>span:last-child{color:#8a9991}
      .offline-card{display:flex;gap:12px;padding:15px;background:#f0eee2;border:1px dashed #c5c5b7}.offline-symbol{width:28px;height:28px;border-radius:50%;background:#dfe7dc;color:var(--teal);display:grid;place-items:center;font-size:18px}.offline-card h3{font-size:12px;margin:0 0 4px}.offline-card p{font-size:10px;color:var(--muted);margin:0 0 7px}.offline-card a{font-size:10px;color:var(--teal);font-weight:700}
      .dash-bottom{display:grid;grid-template-columns:1.5fr 1fr;gap:17px;margin-top:17px}.recent-card{padding:17px}.recent-list>a{display:flex;align-items:center;gap:10px;border-top:1px solid #ecece4;padding:11px 0}.recent-file{width:31px;height:31px;background:#f2e6d8;border-radius:6px;display:grid;place-items:center;color:#a15135;font:11px 'DM Mono',monospace}.recent-file.doc{background:#e4eaec;color:#587383}.recent-list b,.recent-list small{display:block}.recent-list b{font-size:11px}.recent-list small{font-size:9px;color:var(--muted);margin-top:3px}.recent-time{margin-left:auto;font-size:9px;color:#87908b}.path-note{padding:18px 20px;background:#ede6d6;border-radius:10px;position:relative;overflow:hidden}.path-note:after{content:'04';position:absolute;right:14px;bottom:-28px;font:100px 'Newsreader',serif;color:#d7c9a8}.path-note h2{margin:7px 0;font-size:22px}.path-note p{font-size:10px;max-width:250px;color:#5e6c68}.path-note .mono{font-size:9px;color:#8c6542;background:#f8f4e9;padding:5px 8px;border-radius:4px;display:inline-block}
      @media(max-width:850px){.dash-grid,.dash-bottom{grid-template-columns:1fr}.dash-welcome{grid-template-columns:1fr 1fr}.welcome-stamp{display:none}.subject-last{display:none}}
      @media(max-width:500px){.dash-welcome{grid-template-columns:1fr}.dash-welcome .welcome-progress{max-width:250px}.subject-row{gap:8px}.subject-path{overflow:hidden;text-overflow:ellipsis}}
    `}</style>
  </div></Chrome>;
}
