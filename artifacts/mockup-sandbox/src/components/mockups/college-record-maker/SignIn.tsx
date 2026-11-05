import "./_group.css";
import { useState } from "react";

export function SignIn() {
  const [notice,setNotice]=useState(false);
  return <div className="crm sign-in">
    <div className="signin-bar"><div className="brand"><span className="brand-mark">R</span><span><span className="brand-name">Record maker</span><span className="brand-sub">Rajagiri study desk</span></span></div><span className="sample-tag">Prototype · sample data</span></div>
    <main className="signin-layout">
      <section className="signin-story">
        <div className="eyebrow">A quieter way to finish the record</div>
        <h1>Make room for<br/><em>the work itself.</em></h1>
        <p>Bring your own code, outputs and subject template together in one orderly study space.</p>
        <div className="signin-illustration" aria-hidden="true">
          <div className="paper-sheet"><div className="paper-line short"/><div className="paper-line"/><div className="paper-line medium"/><div className="paper-chip">[MAIN_CODE]</div><div className="paper-line"/><div className="paper-line short"/></div>
          <div className="stationery"><span className="stationery-tab">LAB&nbsp; 04</span><div className="pen"/><div className="pencil"/></div>
          <div className="illustration-caption">Your record. Your Drive. Your pace.</div>
        </div>
      </section>
      <section className="signin-card">
        <div className="eyebrow">Student access</div>
        <h2>Sign in to your workspace</h2>
        <p className="muted">Use your Rajagiri Google account to continue.</p>
        <button className="btn google-btn" onClick={()=>setNotice(true)} aria-label="Continue with Google demo" data-testid="button-google-demo"><span className="google-g">G</span>Continue with Google <span className="prototype-action">Demo</span></button>
        <div className="signin-divider"><span>Access is limited to</span></div>
        <div className="domain-rule"><span className="domain-check">✓</span><div><strong>rajagiri.edu</strong><p>Only an eligible college account is allowed.</p></div></div>
        <div className="domain-rule restricted"><span className="domain-lock">×</span><div><strong>Other accounts are not accepted</strong><p>Personal Google accounts and other domains are excluded.</p></div></div>
        {notice&&<div className="notice blue" role="status"><span className="notice-icon">i</span><span>Demo only — Google sign-in is not connected. No account was authenticated.</span></div>}
        <div className="signin-ownership"><span className="ownership-mark">↗</span><div><strong>Your own Drive, not a shared college folder.</strong><p>Record files belong to the student workspace. Prototype screen; Drive is not connected.</p></div></div>
        <div className="signin-legal">By continuing, you would use your college identity. OAuth approval and account consent remain unresolved.</div>
      </section>
    </main>
    <footer className="signin-footer"><span>COLLEGE RECORD MAKER <i>·</i> WINDOWS DESKTOP CONCEPT</span><span>Built for long lab sessions</span></footer>
    <style>{`
      .signin-bar{height:72px;display:flex;align-items:center;justify-content:space-between;padding:0 7.5%;border-bottom:1px solid var(--line);background:#f7f4eb}
      .signin-bar .brand{padding:0}.signin-layout{max-width:1080px;margin:0 auto;display:grid;grid-template-columns:1fr 410px;gap:95px;align-items:center;min-height:735px;padding:54px 30px}
      .signin-story h1{font:500 56px/1.02 'Newsreader',serif;letter-spacing:-1.2px;margin:10px 0 17px}.signin-story h1 em{color:var(--rust);font-style:normal}
      .signin-story>p{font-size:15px;color:var(--muted);max-width:400px;line-height:1.7}
      .signin-illustration{height:276px;max-width:450px;position:relative;margin-top:47px;background:#e5e6d8;border-radius:14px;overflow:hidden}
      .signin-illustration:before{content:'';position:absolute;width:260px;height:260px;background:#d5e3db;border-radius:50%;left:195px;top:43px}
      .paper-sheet{position:absolute;width:202px;height:226px;left:80px;top:24px;background:#fffdf7;border:1px solid #dad7cb;box-shadow:8px 10px 0 #c8c9bc;padding:24px 19px;transform:rotate(-5deg)}
      .paper-line{height:4px;background:#c9d0c9;margin:12px 0;width:100%}.paper-line.short{width:45%}.paper-line.medium{width:72%}.paper-chip{background:#edf1e8;padding:9px 7px;color:#4d695f;font:9px 'DM Mono',monospace;margin-top:17px}
      .stationery{position:absolute;left:290px;top:56px;width:95px;height:140px;transform:rotate(15deg)}.stationery-tab{background:var(--rust);color:white;padding:6px 10px;font:10px 'DM Mono',monospace;position:absolute;top:0;left:5px}
      .pen,.pencil{position:absolute;width:11px;height:130px;top:22px;left:25px;border-radius:8px;background:#315d5a}.pencil{left:51px;background:#d9ac50;height:118px;top:31px}
      .illustration-caption{position:absolute;bottom:15px;left:20px;color:#556662;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
      .signin-card{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:31px;box-shadow:var(--shadow)}.signin-card h2{font:600 25px 'Newsreader',serif;margin:4px 0 7px}.signin-card>.muted{font-size:12px;margin-bottom:23px}
      .google-btn{width:100%;height:46px;justify-content:flex-start!important;padding:0 12px!important;position:relative}.google-g{font:bold 17px Arial;color:#4285f4;width:23px}.google-btn .prototype-action{margin-left:auto}
      .signin-divider{display:flex;align-items:center;gap:10px;color:#87908a;font-size:10px;margin:21px 0}.signin-divider:before,.signin-divider:after{content:'';height:1px;background:var(--line);flex:1}
      .domain-rule{display:flex;gap:10px;padding:11px 0;border-bottom:1px solid #eeeae0}.domain-rule strong{font-size:12px}.domain-rule p{color:var(--muted);font-size:10px;margin:3px 0 0}.domain-check,.domain-lock{width:20px;height:20px;border-radius:50%;background:var(--teal-pale);color:var(--teal);display:grid;place-items:center;font-size:11px}.domain-lock{background:#f0ece5;color:#8b7770}
      .signin-ownership{display:flex;gap:10px;margin-top:19px;padding:13px;background:#f0f3eb;border-radius:7px}.ownership-mark{font-size:19px;color:var(--teal)}.signin-ownership strong{font-size:11px}.signin-ownership p{font-size:10px;color:var(--muted);margin:3px 0 0;line-height:1.5}.signin-legal{font-size:9px;color:#8b918a;line-height:1.5;margin-top:17px}
      .signin-footer{display:flex;justify-content:space-between;padding:17px 7.5%;font-size:9px;letter-spacing:.09em;color:#7e8881;border-top:1px solid var(--line)}.signin-footer i{color:var(--rust);font-style:normal}
      @media(max-width:800px){.signin-layout{grid-template-columns:1fr;gap:28px;padding:36px 20px;max-width:520px}.signin-story h1{font-size:44px}.signin-illustration{height:190px;margin-top:25px}.paper-sheet{transform:scale(.78) rotate(-5deg);transform-origin:top left;left:30px}.stationery{left:230px;transform:scale(.78) rotate(15deg);transform-origin:top left}.signin-footer{padding:15px 20px;gap:12px;flex-wrap:wrap}}
    `}</style>
  </div>;
}
