import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { supabase } from './lib/supabase';
import { loadUserData, loadTeam, loadLogs, loadProfiles, syncTeam, syncLogs, syncProfiles, saveRate } from './lib/db';

// ── Constants ──
const ICONS = ["🎨","◆","🎬","✂️","✦","🎯","🔥","💎","🎭","📐","🖌️","⚡","🌟","📸","🎵","🧩"];
const PROFILE_EMOJIS = ["⚡","🏢","🚀","💼","🌟","👑","🎯","💎","🔥","🏆"];
const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const SPECIALTIES = ["موشن ديزاين","مونتاج","تصميم جرافيك","صوت وميكس","تصوير","سكربت وكتابة","فويس اوفر","ثري دي","كلر جريدنج","أخرى"];
const STATUS_MAP = {
  available:{bg:"rgba(52,211,153,0.12)",bd:"rgba(52,211,153,0.4)",tx:"#34d399",lb:"متوفر"},
  busy:{bg:"rgba(251,191,36,0.12)",bd:"rgba(251,191,36,0.4)",tx:"#fbbf24",lb:"مشغول"},
  unavailable:{bg:"rgba(239,68,68,0.12)",bd:"rgba(239,68,68,0.4)",tx:"#ef4444",lb:"غير متوفر"},
};

const mkExtra = (name, icon, price) => ({ id: "ex_" + Date.now() + Math.random().toString(36).slice(2,6), name, icon, perUnit: price });
const mkStyle = (name, icon, desc, min30, max30, isFixed=false, minF=0, maxF=0, extras=[]) => ({
  id: "s_" + Date.now() + Math.random().toString(36).slice(2,6), name, icon, desc, isFixed,
  minPer30: min30, maxPer30: max30, minFixed: minF, maxFixed: maxF,
  extras: extras,
});

const INIT_STYLES = [
  { id:"collage", name:"كولاج", icon:"🎨", desc:"تصميم + تحريك + أصوات + مونتاج", isFixed:false, minPer30:500, maxPer30:1000, minFixed:0, maxFixed:0,
    extras:[{id:"ex_design",name:"تصميم",icon:"🎨",perUnit:30},{id:"ex_sound",name:"صوت وميكس",icon:"🎵",perUnit:50},{id:"ex_vo",name:"فويس اوفر",icon:"🎙️",perUnit:60}] },
  { id:"flat", name:"فلات موشن", icon:"◆", desc:"تصميم وتحريك بسيط", isFixed:false, minPer30:300, maxPer30:750, minFixed:0, maxFixed:0,
    extras:[{id:"ex_design2",name:"تصميم",icon:"🎨",perUnit:25},{id:"ex_sound2",name:"صوت وميكس",icon:"🎵",perUnit:40}] },
  { id:"mixed", name:"مكسد ميديا", icon:"🎬", desc:"فيديو + موشن", isFixed:false, minPer30:250, maxPer30:500, minFixed:0, maxFixed:0,
    extras:[{id:"ex_mont",name:"مونتاج",icon:"✂️",perUnit:40},{id:"ex_sound3",name:"صوت",icon:"🎵",perUnit:35}] },
  { id:"editing", name:"مونتاج", icon:"✂️", desc:"قص وترتيب وتنسيق", isFixed:false, minPer30:500, maxPer30:1000, minFixed:0, maxFixed:0, extras:[] },
  { id:"graphics", name:"جرافكس دزاين", icon:"✦", desc:"بوستر / سوشال ميديا", isFixed:true, minPer30:0, maxPer30:0, minFixed:50, maxFixed:200, extras:[] },
];
const INIT_PROFILES = [{ id:"default", name:"الأساسي", emoji:"⚡", styles:JSON.parse(JSON.stringify(INIT_STYLES)) }];

// ── Helpers ──
function linkIcon(u){if(!u)return"🔗";const l=u.toLowerCase();if(l.includes("instagram"))return"📷";if(l.includes("t.me")||l.includes("telegram"))return"✈️";if(l.includes("x.com")||l.includes("twitter"))return"𝕏";if(l.includes("behance"))return"🅱️";if(l.includes("wa.me"))return"💬";if(l.includes("youtube"))return"▶️";return"🔗";}
function linkLabel(u){try{const x=new URL(u.startsWith("http")?u:"https://"+u);const p=x.pathname.replace(/^\/+|\/+$/g,"");return p?p.split("/")[0]:x.hostname.replace("www.","");}catch{return u?.substring(0,25)||"";}}
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt = n => Math.round(n).toLocaleString("en-US");

// ── Reusable number field (fixes the typing bug) ──
function NF({ val, set, sty }) {
  const [txt, setTxt] = useState(String(val ?? ""));
  const valRef = useState({ last: val })[0];
  useEffect(() => {
    if (val !== valRef.last) { setTxt(String(val ?? "")); valRef.last = val; }
  }, [val]);
  return <input type="text" inputMode="decimal" value={txt}
    onChange={e => { setTxt(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) { valRef.last = n; set(n); } }}
    onBlur={() => { const n = num(txt); setTxt(String(n)); valRef.last = n; set(n); }}
    style={{ ...inp, direction: "ltr", textAlign: "center", ...sty }} />;
}

// ══════════════════════════════════════════════
// ── MAIN APP ──
// ══════════════════════════════════════════════
export default function App({ user, onSignOut }) {
  const [pg, setPg] = useState("calc");

  // Profiles
  const [profiles, setProfiles] = useState(INIT_PROFILES);
  const [apId, setApId] = useState("default");
  const [showPM, setShowPM] = useState(false);
  const [showPE, setShowPE] = useState(false);
  const [pf, setPf] = useState({ name: "", emoji: "⚡" });
  const [epId, setEpId] = useState(null);

  const ap = profiles.find(p => p.id === apId) || profiles[0];
  const styles = ap?.styles || INIT_STYLES;

  // Calculator
  const [selStyle, setSelStyle] = useState(null);
  const [dur, setDur] = useState(30);
  const [urg, setUrg] = useState(0);
  const [cur, setCur] = useState("USD");
  const [rate, setRate] = useState(1500);
  const [withTeam, setWithTeam] = useState(false);
  const [dCnt, setDCnt] = useState(1);
  const [extState, setExtState] = useState({});

  // Team
  const [team, setTeam] = useState([]);
  const [selMem, setSelMem] = useState([]);
  const [memCost, setMemCost] = useState({});

  // Logs
  const [logs, setLogs] = useState([]);
  const [logFilt, setLogFilt] = useState("");
  const [logView, setLogView] = useState("list");

  // Save modal
  const [showSave, setShowSave] = useState(false);
  const [sf, setSf] = useState({ client: "", notes: "" });

  // Final cost modal
  const [showFinal, setShowFinal] = useState(false);
  const [finalLogId, setFinalLogId] = useState(null);
  const [finalData, setFinalData] = useState({ received: "", teamCosts: {} });

  // Settings
  const [showSet, setShowSet] = useState(false);
  const [setTab, setSetTab] = useState("styles");
  const [eStyles, setEStyles] = useState([]);
  const [eRate, setERate] = useState(1500);
  const [esId, setEsId] = useState(null);
  const [sForm, setSForm] = useState(null);

  // ── Supabase Storage ──
  const [loading, setLoading] = useState(true);
  const prevTeamRef = useRef([]);
  const prevLogsRef = useRef([]);
  const prevProfilesRef = useRef(INIT_PROFILES);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const data = await loadUserData(user.id);
        if (data.profiles?.length > 0) {
          setProfiles(data.profiles);
          setApId(data.profiles[0].id);
          prevProfilesRef.current = data.profiles;
        }
        if (data.team) { setTeam(data.team); prevTeamRef.current = data.team; }
        if (data.logs) { setLogs(data.logs); prevLogsRef.current = data.logs; }
        if (data.rate) setRate(data.rate);
      } catch (e) { console.error('Load error:', e); }
      finally { setLoading(false); }
    })();

    // Real-time subscriptions
    const channel = supabase.channel(`rt-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members', filter: `user_id=eq.${user.id}` },
        () => loadTeam(user.id).then(t => { setTeam(t); prevTeamRef.current = t; }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_logs', filter: `user_id=eq.${user.id}` },
        () => loadLogs(user.id).then(l => { setLogs(l); prevLogsRef.current = l; }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${user.id}` },
        () => loadProfiles(user.id).then(p => { if (p.length > 0) { setProfiles(p); prevProfilesRef.current = p; } }))
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const svTeam = t => { const p = prevTeamRef.current; setTeam(t); prevTeamRef.current = t; syncTeam(p, t, user.id).catch(console.error); };
  const svLogs = l => { const p = prevLogsRef.current; setLogs(l); prevLogsRef.current = l; syncLogs(p, l, user.id).catch(console.error); };
  const svProf = p => { const prev = prevProfilesRef.current; setProfiles(p); prevProfilesRef.current = p; syncProfiles(prev, p, user.id).catch(console.error); };
  const svRate = r => { setRate(r); saveRate(r, user.id).catch(console.error); };

  const style = styles.find(s => s.id === selStyle);
  const styleExtras = style?.extras || [];
  const sym = cur === "USD" ? "$" : "د.ع";

  // ── Extras total ──
  const extTotal = useMemo(() => {
    let t = 0;
    styleExtras.forEach(ex => {
      const s = extState[ex.id];
      if (s?.on) t += (ex.perUnit || 0) * (s.qty || 1);
    });
    return t;
  }, [styleExtras, extState]);

  // ── Calculate ──
  const calc = useCallback(() => {
    if (!style) return { min:0, max:0, ft:0, et:0 };
    let min, max;
    if (style.isFixed) { min = (style.minFixed||0)*dCnt; max = (style.maxFixed||0)*dCnt; }
    else { const m = dur/30; min = style.minPer30*m; max = style.maxPer30*m; }
    min *= (1 + urg/100); max *= (1 + urg/100);
    min += extTotal; max += extTotal;
    let ft = 0;
    if (withTeam) ft = selMem.reduce((s,id) => s + (num(memCost[id])), 0);
    min += ft; max += ft;
    if (cur === "IQD") { min *= rate; max *= rate; }
    return { min:Math.round(min), max:Math.round(max), ft:cur==="IQD"?Math.round(ft*rate):ft, et:cur==="IQD"?Math.round(extTotal*rate):extTotal };
  }, [style, dur, urg, cur, rate, withTeam, selMem, memCost, dCnt, extTotal]);
  const res = calc();

  // ── Save to log ──
  const doSave = () => {
    if (!sf.client.trim() || !style) return;
    const usedExt = styleExtras.filter(ex => extState[ex.id]?.on).map(ex => ({ name:ex.name, icon:ex.icon, qty:extState[ex.id]?.qty||1, cost:(ex.perUnit||0)*(extState[ex.id]?.qty||1) }));
    const entry = {
      id: Date.now(), client: sf.client.trim(), notes: sf.notes, profile: ap.name, profileEmoji: ap.emoji,
      style: style.name, styleIcon: style.icon, duration: style.isFixed ? `${dCnt} تصميم` : `${dur} ثانية`,
      urgency: urg, currency: cur, priceMin: res.min, priceMax: res.max, extras: usedExt,
      teamMembers: withTeam ? selMem.map(mid => { const m = team.find(t=>t.id===mid); return m ? { id:m.id, name:m.name, estCost:memCost[mid]||0 } : null; }).filter(Boolean) : [],
      date: new Date().toISOString(), completed: false, finalReceived: null, finalTeamCosts: null,
    };
    svLogs([entry, ...logs]);
    setShowSave(false); setPg("log");
  };

  // ── Complete project (final cost) ──
  const openFinal = (log) => {
    setFinalLogId(log.id);
    const tc = {};
    (log.teamMembers||[]).forEach(m => { tc[m.id || m.name] = log.finalTeamCosts?.[m.id||m.name] ?? m.estCost ?? ""; });
    setFinalData({ received: log.finalReceived ?? "", teamCosts: tc });
    setShowFinal(true);
  };
  const saveFinal = () => {
    const updated = logs.map(l => l.id === finalLogId ? {
      ...l, completed: true, finalReceived: num(finalData.received),
      finalTeamCosts: Object.fromEntries(Object.entries(finalData.teamCosts).map(([k,v])=>[k,num(v)])),
    } : l);
    svLogs(updated);
    setShowFinal(false);
  };

  // ── Monthly ──
  const monthly = useMemo(() => {
    const m = {};
    logs.forEach(l => {
      const d = new Date(l.date);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (!m[k]) m[k] = { y:d.getFullYear(), mo:d.getMonth(), cnt:0, estMin:0, estMax:0, actualIn:0, actualOut:0, completedCnt:0 };
      m[k].cnt++;
      const r = l.currency==="IQD" ? (rate||1500) : 1;
      m[k].estMin += l.currency==="IQD" ? Math.round(l.priceMin/r) : l.priceMin;
      m[k].estMax += l.currency==="IQD" ? Math.round(l.priceMax/r) : l.priceMax;
      if (l.completed && l.finalReceived != null) {
        m[k].completedCnt++;
        m[k].actualIn += l.finalReceived;
        const teamOut = l.finalTeamCosts ? Object.values(l.finalTeamCosts).reduce((s,v)=>s+num(v),0) : 0;
        m[k].actualOut += teamOut;
      }
    });
    return Object.values(m).sort((a,b) => b.y-a.y || b.mo-a.mo);
  }, [logs, rate]);

  // ── Settings helpers ──
  const openSet = () => {
    setEStyles(JSON.parse(JSON.stringify(styles)));
    setERate(rate); setEsId(null); setSForm(null); setSetTab("styles"); setShowSet(true);
  };
  const saveSet = () => {
    const up = profiles.map(p => p.id === apId ? { ...p, styles: eStyles } : p);
    svProf(up); svRate(eRate);
    if (selStyle && !eStyles.find(s => s.id === selStyle)) setSelStyle(null);
    setShowSet(false);
  };

  const editStyle = s => { setEsId(s.id); setSForm(JSON.parse(JSON.stringify(s))); };
  const addNewStyle = () => { setEsId("new"); setSForm({ id:"s_"+Date.now(), name:"", icon:"🎯", desc:"", isFixed:false, minPer30:0, maxPer30:0, minFixed:0, maxFixed:0, extras:[] }); };
  const saveStyleForm = () => {
    if (!sForm || !sForm.name.trim()) return;
    if (esId === "new") setEStyles([...eStyles, sForm]);
    else setEStyles(eStyles.map(s => s.id === esId ? sForm : s));
    setEsId(null); setSForm(null);
  };
  const delStyle = id => { setEStyles(eStyles.filter(s=>s.id!==id)); if(esId===id){setEsId(null);setSForm(null);} };

  const addExtraToForm = () => { if(!sForm)return; setSForm({...sForm, extras:[...sForm.extras, {id:"ex_"+Date.now(),name:"",icon:"🎨",perUnit:0}]}); };
  const updateFormExtra = (idx, field, val) => {
    if(!sForm) return;
    const exs = [...sForm.extras];
    exs[idx] = { ...exs[idx], [field]: val };
    setSForm({ ...sForm, extras: exs });
  };
  const removeFormExtra = idx => { if(!sForm)return; setSForm({...sForm, extras: sForm.extras.filter((_,i)=>i!==idx)}); };

  const addProf=()=>{if(!pf.name.trim())return;const n={id:"p_"+Date.now(),name:pf.name.trim(),emoji:pf.emoji,styles:JSON.parse(JSON.stringify(INIT_STYLES))};svProf([...profiles,n]);setApId(n.id);setShowPE(false);};
  const updProf=()=>{if(!pf.name.trim())return;svProf(profiles.map(p=>p.id===epId?{...p,name:pf.name.trim(),emoji:pf.emoji}:p));setShowPE(false);setEpId(null);};
  const delProf=id=>{if(profiles.length<=1)return;const n=profiles.filter(p=>p.id!==id);svProf(n);if(apId===id)setApId(n[0].id);};

  const filtLogs = logFilt ? logs.filter(l=>l.client.includes(logFilt)||l.style.includes(logFilt)||l.notes?.includes(logFilt)) : logs;

  // ── Loading state ──
  if (loading) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(145deg,#0a0a0f,#12121a,#0d0d14)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:"16px"}}>
      <div style={{fontSize:"36px"}}>🧮</div>
      <div style={{color:"#d4af37",fontSize:"12px",letterSpacing:"4px"}}>جار التحميل...</div>
    </div>
  );

  // ══════════════════════════════════════════════
  // ── RENDER ──
  // ══════════════════════════════════════════════
  return (
    <div style={{direction:"rtl",minHeight:"100vh",background:"linear-gradient(145deg,#0a0a0f,#12121a,#0d0d14)",color:"#e8e6e1",fontFamily:"'Segoe UI',Tahoma,sans-serif",position:"relative"}}>
      <div style={{position:"fixed",top:"-200px",left:"-200px",width:"500px",height:"500px",background:"radial-gradient(circle,rgba(212,175,55,0.06),transparent 70%)",pointerEvents:"none",zIndex:0}}/>

      {/* Nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:"rgba(10,10,15,0.95)",backdropFilter:"blur(12px)",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",direction:"rtl"}}>
        {[{id:"calc",l:"الحاسبة",ic:"🧮"},{id:"log",l:"السجل",ic:"📋"},{id:"team",l:"الفريق",ic:"👥"}].map(t=>(
          <button key={t.id} onClick={()=>setPg(t.id)} style={{flex:1,padding:"12px 8px 14px",border:"none",background:"transparent",display:"flex",flexDirection:"column",alignItems:"center",gap:"4px",cursor:"pointer",color:pg===t.id?"#d4af37":"#555",borderTop:pg===t.id?"2px solid #d4af37":"2px solid transparent"}}>
            <span style={{fontSize:"20px"}}>{t.ic}</span><span style={{fontSize:"11px",fontWeight:pg===t.id?600:400}}>{t.l}</span>
          </button>))}
      </div>

      <div style={{maxWidth:"640px",margin:"0 auto",padding:"24px 20px 100px",position:"relative",zIndex:1}}>

        {/* ═══ CALCULATOR ═══ */}
        {pg==="calc"&&(<>
          {/* Profile btn */}
          <div style={{position:"absolute",top:"24px",right:"20px",zIndex:10}}>
            <button onClick={()=>setShowPM(!showPM)} style={{...pillBtn,background:"rgba(212,175,55,0.08)",borderColor:"rgba(212,175,55,0.25)",color:"#d4af37"}}>{ap.emoji} {ap.name} ▾</button>
            {showPM&&(<div style={{position:"absolute",top:"44px",right:0,background:"#1a1a24",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"12px",padding:"8px",minWidth:"200px",boxShadow:"0 12px 40px rgba(0,0,0,0.5)",animation:"fadeIn 0.2s",zIndex:20}}>
              {profiles.map(p=>(<div key={p.id} style={{display:"flex",alignItems:"center",gap:"8px",padding:"10px 12px",borderRadius:"8px",cursor:"pointer",background:apId===p.id?"rgba(212,175,55,0.1)":"transparent"}}>
                <div onClick={()=>{setApId(p.id);setShowPM(false);setSelStyle(null);setExtState({});}} style={{flex:1,display:"flex",alignItems:"center",gap:"8px"}}><span>{p.emoji}</span><span style={{fontSize:"13px",color:apId===p.id?"#d4af37":"#bbb"}}>{p.name}</span></div>
                <button onClick={e=>{e.stopPropagation();setEpId(p.id);setPf({name:p.name,emoji:p.emoji});setShowPE(true);setShowPM(false);}} style={iconBtn}>✎</button>
                {profiles.length>1&&<button onClick={e=>{e.stopPropagation();delProf(p.id);}} style={{...iconBtn,color:"#844"}}>✕</button>}
              </div>))}
              <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",marginTop:"4px",paddingTop:"4px"}}>
                <button onClick={()=>{setEpId(null);setPf({name:"",emoji:"⚡"});setShowPE(true);setShowPM(false);}} style={{width:"100%",padding:"10px",borderRadius:"8px",border:"none",background:"rgba(212,175,55,0.06)",color:"#d4af37",fontSize:"12px",cursor:"pointer"}}>+ بروفايل جديد</button>
              </div>
            </div>)}
          </div>
          {showPM&&<div style={{position:"fixed",inset:0,zIndex:5}} onClick={()=>setShowPM(false)}/>}

          <div style={{textAlign:"center",marginBottom:"36px"}}>
            <div style={{fontSize:"11px",letterSpacing:"6px",color:"#d4af37",marginBottom:"10px",fontWeight:600}}>حاسبة التسعير</div>
            <h1 style={{fontSize:"26px",fontWeight:300,margin:0,color:"#f5f3ef"}}>احسب سعر مشروعك</h1>
            <div style={goldLine}/>
          </div>
          <button onClick={openSet} style={{position:"absolute",top:"24px",left:"20px",...pillBtn}}>⚙</button>

          {/* Currency */}
          <div style={{marginBottom:"28px"}}>
            <div style={{display:"flex",justifyContent:"center"}}>{["USD","IQD"].map(c=>(<button key={c} onClick={()=>setCur(c)} style={togBtn(cur===c,c==="USD")}>{c==="USD"?"دولار $":"دينار د.ع"}</button>))}</div>
            {cur==="IQD"&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"10px",marginTop:"12px",animation:"fadeIn 0.3s"}}><span style={sm}>$1 =</span><NF val={rate} set={setRate} sty={{width:"90px",fontSize:"14px",color:"#d4af37"}}/><span style={sm}>د.ع</span></div>}
          </div>

          {/* Styles */}
          <div style={{marginBottom:"24px"}}><label style={secL}>نوع الخدمة</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
              {styles.map(s=>(<button key={s.id} onClick={()=>{setSelStyle(s.id);setExtState({});}} style={{padding:"14px 12px",border:"1px solid",borderColor:selStyle===s.id?"#d4af37":"rgba(255,255,255,0.06)",background:selStyle===s.id?"rgba(212,175,55,0.08)":"rgba(255,255,255,0.02)",borderRadius:"12px",cursor:"pointer",textAlign:"right",transition:"all 0.3s"}}
                onMouseEnter={e=>{if(selStyle!==s.id)e.currentTarget.style.borderColor="rgba(212,175,55,0.3)";}}
                onMouseLeave={e=>{if(selStyle!==s.id)e.currentTarget.style.borderColor="rgba(255,255,255,0.06)";}}>
                <div style={{fontSize:"18px",marginBottom:"4px"}}>{s.icon}</div>
                <div style={{fontSize:"14px",color:selStyle===s.id?"#f5f3ef":"#bbb",fontWeight:500,marginBottom:"3px"}}>{s.name}</div>
                <div style={{fontSize:"11px",color:"#555"}}>{s.isFixed?`$${s.minFixed}-${s.maxFixed}/قطعة`:`$${s.minPer30}-${s.maxPer30}/30ث`}</div>
                {s.extras?.length>0&&<div style={{fontSize:"10px",color:"#444",marginTop:"4px"}}>{s.extras.length} إضافات</div>}
              </button>))}
            </div>
          </div>

          {selStyle&&style&&<>
            {/* Duration / count */}
            <div style={{marginBottom:"24px",animation:"fadeIn 0.3s"}}>
              {style.isFixed?(<><label style={secL}>عدد التصاميم</label><div style={{display:"flex",alignItems:"center",gap:"16px",justifyContent:"center"}}><button onClick={()=>setDCnt(Math.max(1,dCnt-1))} style={stepBtn}>−</button><div style={{fontSize:"32px",fontWeight:300,color:"#d4af37",minWidth:"60px",textAlign:"center"}}>{dCnt}</div><button onClick={()=>setDCnt(dCnt+1)} style={stepBtn}>+</button></div></>):(<>
                <label style={secL}>المدة: {dur} ثانية {dur>=60?`(${(dur/60).toFixed(1)} دقيقة)`:""}</label>
                <input type="range" min="10" max="300" step="5" value={dur} onChange={e=>setDur(+e.target.value)} style={slider(dur,10,300,"#d4af37")}/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px",color:"#555",marginTop:"6px"}}><span>10 ثانية</span><span>5 دقائق</span></div></>)}
            </div>

            {/* Per-style extras */}
            {styleExtras.length>0&&(<div style={{marginBottom:"24px"}}>
              <label style={secL}>إضافات — {style.name}</label>
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                {styleExtras.map(ex=>{const ae=extState[ex.id];const on=ae?.on;return(
                  <div key={ex.id} style={{padding:"12px 14px",borderRadius:"10px",border:`1px solid ${on?"rgba(212,175,55,0.3)":"rgba(255,255,255,0.06)"}`,background:on?"rgba(212,175,55,0.06)":"rgba(255,255,255,0.02)",transition:"all 0.3s"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"10px",cursor:"pointer"}} onClick={()=>setExtState(p=>({...p,[ex.id]:{on:!on,qty:p[ex.id]?.qty||1}}))}>
                      <div style={chk(on)}>{on&&<span style={{color:"#0a0a0f",fontSize:"12px",fontWeight:700}}>✓</span>}</div>
                      <span style={{fontSize:"16px"}}>{ex.icon}</span>
                      <span style={{flex:1,fontSize:"13px",color:on?"#eee":"#888"}}>{ex.name}</span>
                      <span style={{fontSize:"12px",color:"#666"}}>${ex.perUnit}/وحدة</span>
                    </div>
                    {on&&(<div style={{marginTop:"10px",paddingTop:"10px",borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",alignItems:"center",gap:"10px",animation:"fadeIn 0.2s"}}>
                      <span style={sm}>العدد:</span>
                      <button onClick={()=>setExtState(p=>({...p,[ex.id]:{...p[ex.id],qty:Math.max(1,(p[ex.id]?.qty||1)-1)}}))} style={miniBtn}>−</button>
                      <span style={{fontSize:"16px",color:"#d4af37",minWidth:"30px",textAlign:"center"}}>{ae?.qty||1}</span>
                      <button onClick={()=>setExtState(p=>({...p,[ex.id]:{...p[ex.id],qty:(p[ex.id]?.qty||1)+1}}))} style={miniBtn}>+</button>
                      <span style={{fontSize:"12px",color:"#666",marginRight:"auto"}}> = ${(ex.perUnit||0)*(ae?.qty||1)}</span>
                    </div>)}
                  </div>);})}
              </div>
            </div>)}

            {/* Urgency */}
            <div style={{marginBottom:"24px"}}>
              <label style={secL}>الاستعجال: {urg===0?"عادي":`+${urg}%`}</label>
              <input type="range" min="0" max="100" step="5" value={urg} onChange={e=>setUrg(+e.target.value)} style={slider(urg,0,100,urg>50?"#ef4444":urg>25?"#fbbf24":"#34d399")}/>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px",color:"#555",marginTop:"6px"}}><span>عادي</span><span>مستعجل جداً</span></div>
            </div>

            {/* Team */}
            <div style={{marginBottom:"20px"}}><label style={secL}>طريقة العمل</label>
              <div style={{display:"flex"}}>{[{l:"شغل فردي",v:false},{l:"مع فريق",v:true}].map(o=>(<button key={String(o.v)} onClick={()=>setWithTeam(o.v)} style={togBtn(withTeam===o.v,!o.v)}>{o.l}</button>))}</div>
            </div>
            {withTeam&&(<div style={{marginBottom:"24px",padding:"16px",borderRadius:"14px",border:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.01)",animation:"fadeIn 0.3s"}}>
              {team.length===0?<div style={{textAlign:"center",padding:"16px",color:"#555",fontSize:"13px"}}>ما عندك أعضاء. روح <button onClick={()=>setPg("team")} style={{background:"none",border:"none",color:"#d4af37",cursor:"pointer",textDecoration:"underline",fontSize:"13px"}}>الفريق</button></div>
              :team.map(m=>{const isSel=selMem.includes(m.id);const st=STATUS_MAP[m.status];return(
                <div key={m.id} style={{padding:"10px 12px",marginBottom:"6px",background:isSel?"rgba(212,175,55,0.06)":"rgba(255,255,255,0.02)",borderRadius:"10px",border:`1px solid ${isSel?"rgba(212,175,55,0.3)":"rgba(255,255,255,0.05)"}`,opacity:m.status==="unavailable"?0.45:1,cursor:m.status==="unavailable"?"not-allowed":"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"10px"}} onClick={()=>m.status!=="unavailable"&&setSelMem(p=>p.includes(m.id)?p.filter(x=>x!==m.id):[...p,m.id])}>
                    <div style={chk(isSel)}>{isSel&&<span style={{color:"#0a0a0f",fontSize:"12px",fontWeight:700}}>✓</span>}</div>
                    <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:"6px"}}><span style={{fontSize:"13px",fontWeight:500,color:"#eee"}}>{m.name}</span><span style={{fontSize:"9px",padding:"2px 6px",borderRadius:"4px",background:st.bg,color:st.tx,border:`1px solid ${st.bd}`}}>{st.lb}</span></div><div style={{fontSize:"11px",color:"#666",marginTop:"2px"}}>{(m.specialties||[]).join(" · ")}</div></div>
                  </div>
                  {isSel&&<div style={{marginTop:"8px",paddingTop:"8px",borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",alignItems:"center",gap:"8px"}}><span style={{fontSize:"11px",color:"#888",whiteSpace:"nowrap"}}>التكلفة $:</span><NF val={memCost[m.id]||0} set={v=>setMemCost({...memCost,[m.id]:v})} sty={{flex:1,padding:"7px"}}/></div>}
                </div>);})}
            </div>)}

            {/* Result */}
            <div style={{background:"linear-gradient(135deg,rgba(212,175,55,0.06),rgba(212,175,55,0.02))",border:"1px solid rgba(212,175,55,0.2)",borderRadius:"16px",padding:"24px",textAlign:"center",marginTop:"8px"}}>
              <div style={{fontSize:"11px",letterSpacing:"3px",color:"#888",marginBottom:"14px"}}>السعر المقترح</div>
              <div style={{display:"flex",justifyContent:"center",alignItems:"baseline",gap:"10px",direction:"ltr",flexWrap:"wrap"}}>
                <span style={{fontSize:"13px",color:"#999"}}>{sym}</span>
                <span style={{fontSize:"38px",fontWeight:300,color:"#d4af37",lineHeight:1}}>{fmt(res.min)}</span>
                <span style={{fontSize:"18px",color:"#666"}}>—</span>
                <span style={{fontSize:"38px",fontWeight:300,color:"#d4af37",lineHeight:1}}>{fmt(res.max)}</span>
                <span style={{fontSize:"13px",color:"#999"}}>{sym}</span>
              </div>
              {(res.et>0||res.ft>0)&&<div style={{marginTop:"12px",display:"flex",gap:"8px",justifyContent:"center",flexWrap:"wrap"}}>
                {res.et>0&&<span style={tagSm("rgba(52,211,153,0.08)","#34d399")}>إضافات: {fmt(res.et)} {sym}</span>}
                {res.ft>0&&<span style={tagSm("rgba(212,175,55,0.08)","#d4af37")}>فريق: {fmt(res.ft)} {sym}</span>}
              </div>}
              <button onClick={()=>{setSf({client:"",notes:""});setShowSave(true);}} style={{marginTop:"16px",...goldBtn}}>📋 حفظ بالسجل</button>
            </div>
          </>}
        </>)}

        {/* ═══ LOG ═══ */}
        {pg==="log"&&(<>
          <div style={{textAlign:"center",marginBottom:"28px"}}><div style={{fontSize:"11px",letterSpacing:"6px",color:"#d4af37",marginBottom:"10px",fontWeight:600}}>سجل المشاريع</div><h1 style={{fontSize:"24px",fontWeight:300,margin:0,color:"#f5f3ef"}}>تاريخ أعمالك</h1><div style={goldLine}/></div>
          <div style={{display:"flex",marginBottom:"16px"}}>{[{id:"list",l:"السجل"},{id:"monthly",l:"الحساب الشهري"}].map(t=>(<button key={t.id} onClick={()=>setLogView(t.id)} style={togBtn(logView===t.id,t.id==="list")}>{t.l}</button>))}</div>

          {logView==="monthly"?(<>
            {monthly.length===0?<div style={{textAlign:"center",padding:"48px",color:"#444"}}><div style={{fontSize:"40px",marginBottom:"12px"}}>📊</div><div>ما عندك بيانات بعد</div></div>
            :monthly.map((m,i)=>(<div key={i} style={card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
                <div style={{fontSize:"16px",fontWeight:500,color:"#eee"}}>{MONTHS_AR[m.mo]} {m.y}</div>
                <div style={{fontSize:"12px",color:"#888",padding:"4px 10px",background:"rgba(255,255,255,0.04)",borderRadius:"6px"}}>{m.cnt} مشروع</div>
              </div>
              <div style={{marginBottom:"8px"}}><div style={{fontSize:"11px",color:"#888",marginBottom:"4px"}}>السعر التقريبي:</div><div style={{fontSize:"22px",fontWeight:300,color:"#d4af37",direction:"ltr",textAlign:"right"}}>${fmt(m.estMin)} — ${fmt(m.estMax)}</div></div>
              {m.completedCnt>0&&(<div style={{padding:"12px",background:"rgba(52,211,153,0.05)",borderRadius:"10px",border:"1px solid rgba(52,211,153,0.15)"}}>
                <div style={{fontSize:"11px",color:"#34d399",marginBottom:"6px"}}>✅ مكتمل: {m.completedCnt} مشروع</div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"13px"}}>
                  <span style={{color:"#34d399"}}>استلمت: ${fmt(m.actualIn)}</span>
                  <span style={{color:"#fbbf24"}}>دفعت فريق: ${fmt(m.actualOut)}</span>
                  <span style={{color:"#d4af37",fontWeight:600}}>صافي: ${fmt(m.actualIn - m.actualOut)}</span>
                </div>
              </div>)}
            </div>))}
          </>):(<>
            <input placeholder="ابحث..." value={logFilt} onChange={e=>setLogFilt(e.target.value)} style={{...inp,padding:"12px 16px",fontSize:"14px",borderRadius:"12px",marginBottom:"16px"}}/>
            {logs.length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px",marginBottom:"16px"}}>{[{l:"مشاريع",v:logs.length},{l:"عملاء",v:[...new Set(logs.map(l=>l.client))].length},{l:"مكتملة",v:logs.filter(l=>l.completed).length}].map((s,i)=>(<div key={i} style={{padding:"12px 8px",background:"rgba(255,255,255,0.02)",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.06)",textAlign:"center"}}><div style={{fontSize:"20px",fontWeight:300,color:"#d4af37"}}>{s.v}</div><div style={{fontSize:"10px",color:"#666",marginTop:"3px"}}>{s.l}</div></div>))}</div>}
            {filtLogs.length===0?<div style={{textAlign:"center",padding:"48px",color:"#444"}}><div style={{fontSize:"40px",marginBottom:"12px"}}>📋</div><div>{logs.length===0?"ما عندك مشاريع بعد":"ما لكيت نتائج"}</div></div>
            :filtLogs.map(log=>{
              const finalTeamTotal = log.finalTeamCosts ? Object.values(log.finalTeamCosts).reduce((s,v)=>s+num(v),0) : 0;
              const profit = log.completed ? (log.finalReceived||0) - finalTeamTotal : null;
              return(<div key={log.id} style={{...card,borderColor:log.completed?"rgba(52,211,153,0.3)":"rgba(255,255,255,0.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"8px"}}>
                  <div><div style={{fontSize:"15px",fontWeight:500,color:"#eee",marginBottom:"3px"}}>{log.client} {log.completed&&"✅"}</div><div style={{fontSize:"11px",color:"#666"}}>{new Date(log.date).toLocaleDateString("ar-IQ",{year:"numeric",month:"long",day:"numeric"})}</div></div>
                  <button onClick={()=>svLogs(logs.filter(l=>l.id!==log.id))} style={{...iconBtn,color:"#a44",border:"1px solid rgba(220,50,50,0.15)",background:"rgba(220,50,50,0.08)",alignSelf:"flex-start",fontSize:"11px",padding:"3px 8px"}}>حذف</button>
                </div>
                <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"8px"}}>
                  {log.profileEmoji&&<span style={tag("rgba(255,255,255,0.04)","#888")}>{log.profileEmoji} {log.profile}</span>}
                  <span style={tag("rgba(212,175,55,0.1)","#d4af37")}>{log.styleIcon} {log.style}</span>
                  <span style={tag("rgba(255,255,255,0.04)","#888")}>{log.duration}</span>
                  {log.urgency>0&&<span style={tag("rgba(251,191,36,0.1)","#fbbf24")}>+{log.urgency}%</span>}
                </div>
                {log.extras?.length>0&&<div style={{display:"flex",gap:"4px",flexWrap:"wrap",marginBottom:"6px"}}>{log.extras.map((ex,i)=>(<span key={i} style={tag("rgba(52,211,153,0.08)","#34d399")}>{ex.icon} {ex.name} ×{ex.qty}</span>))}</div>}
                <div style={{fontSize:"17px",fontWeight:400,color:"#d4af37",direction:"ltr",textAlign:"right"}}>{log.currency==="USD"?"$":"د.ع"} {fmt(log.priceMin)} — {fmt(log.priceMax)}</div>
                {log.teamMembers?.length>0&&<div style={{marginTop:"6px",fontSize:"11px",color:"#777"}}>الفريق: {log.teamMembers.map(m=>m.name).join(" · ")}</div>}
                {log.notes&&<div style={{marginTop:"4px",fontSize:"12px",color:"#555",fontStyle:"italic"}}>"{log.notes}"</div>}

                {log.completed?(<div style={{marginTop:"10px",padding:"12px",background:"rgba(52,211,153,0.05)",borderRadius:"10px",border:"1px solid rgba(52,211,153,0.15)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
                    <div style={{fontSize:"12px"}}><span style={{color:"#888"}}>استلمت: </span><span style={{color:"#34d399",fontWeight:600}}>${log.finalReceived}</span></div>
                    {finalTeamTotal>0&&<div style={{fontSize:"12px"}}><span style={{color:"#888"}}>فريق: </span><span style={{color:"#fbbf24"}}>${finalTeamTotal}</span></div>}
                    <div style={{fontSize:"13px"}}><span style={{color:"#888"}}>الصافي: </span><span style={{color:profit>=0?"#34d399":"#ef4444",fontWeight:600}}>${profit}</span></div>
                  </div>
                  <button onClick={()=>openFinal(log)} style={{marginTop:"8px",fontSize:"11px",color:"#888",background:"none",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"6px",padding:"4px 12px",cursor:"pointer"}}>تعديل</button>
                </div>):(<button onClick={()=>openFinal(log)} style={{marginTop:"10px",padding:"10px 20px",borderRadius:"8px",border:"1px dashed rgba(52,211,153,0.3)",background:"rgba(52,211,153,0.04)",color:"#34d399",fontSize:"12px",cursor:"pointer",width:"100%"}}>💰 إضافة التكلفة النهائية</button>)}
              </div>);})}
          </>)}
        </>)}

        {/* ═══ TEAM ═══ */}
        {pg==="team"&&<TeamPage team={team} save={svTeam} del={id=>{svTeam(team.filter(m=>m.id!==id));setSelMem(selMem.filter(x=>x!==id));const c={...memCost};delete c[id];setMemCost(c);}} upStatus={(id,st)=>svTeam(team.map(m=>m.id===id?{...m,status:st}:m))}/>}
      </div>

      {/* ═══ MODALS ═══ */}
      {/* Save */}
      {showSave&&<Modal close={()=>setShowSave(false)}>
        <h2 style={mTitle}>📋 حفظ بالسجل</h2>
        <div style={{marginBottom:"14px"}}><label style={sLbl}>اسم العميل *</label><input value={sf.client} onChange={e=>setSf({...sf,client:e.target.value})} placeholder="اكتب اسم العميل..." style={{...inp,padding:"12px 14px",fontSize:"14px"}} autoFocus/></div>
        <div style={{marginBottom:"14px"}}><label style={sLbl}>ملاحظات</label><input value={sf.notes} onChange={e=>setSf({...sf,notes:e.target.value})} placeholder="اختياري..." style={{...inp,padding:"12px 14px"}}/></div>
        <div style={{...previewBox}}>{ap.emoji} {style?.icon} {style?.name} · <span style={{color:"#d4af37"}}>{fmt(res.min)} - {fmt(res.max)} {sym}</span></div>
        <div style={{display:"flex",gap:"10px"}}><button onClick={doSave} style={{...goldBtn,flex:1,opacity:sf.client.trim()?1:0.4,cursor:sf.client.trim()?"pointer":"not-allowed"}}>حفظ</button><button onClick={()=>setShowSave(false)} style={cancelBtn}>إلغاء</button></div>
      </Modal>}

      {/* Final cost */}
      {showFinal&&<Modal close={()=>setShowFinal(false)}>
        <h2 style={mTitle}>💰 التكلفة النهائية</h2>
        {(()=>{const log=logs.find(l=>l.id===finalLogId);if(!log)return null;return(<>
          <div style={{marginBottom:"14px"}}><label style={sLbl}>المبلغ الي استلمته بالدولار</label><NF val={finalData.received} set={v=>setFinalData(p=>({...p,received:v}))} sty={{padding:"12px 14px",fontSize:"16px",color:"#34d399"}}/></div>
          {log.teamMembers?.length>0&&(<div style={{marginBottom:"14px"}}><label style={sLbl}>المبالغ الي دفعتها للفريق</label>
            {log.teamMembers.map(m=>(<div key={m.id||m.name} style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"8px"}}>
              <span style={{fontSize:"13px",color:"#bbb",flex:1}}>{m.name}</span>
              <NF val={finalData.teamCosts[m.id||m.name]||0} set={v=>setFinalData(p=>({...p,teamCosts:{...p.teamCosts,[m.id||m.name]:v}}))} sty={{width:"100px",fontSize:"14px"}}/>
              <span style={{fontSize:"12px",color:"#666"}}>$</span>
            </div>))}
          </div>)}
          {(()=>{const r=num(finalData.received);const t=Object.values(finalData.teamCosts).reduce((s,v)=>s+num(v),0);const p=r-t;return(
            <div style={{padding:"14px",background:p>=0?"rgba(52,211,153,0.06)":"rgba(239,68,68,0.06)",borderRadius:"10px",border:`1px solid ${p>=0?"rgba(52,211,153,0.2)":"rgba(239,68,68,0.2)"}`,marginBottom:"18px",textAlign:"center"}}>
              <div style={{fontSize:"13px",color:"#888",marginBottom:"4px"}}>الصافي</div>
              <div style={{fontSize:"28px",fontWeight:300,color:p>=0?"#34d399":"#ef4444"}}>${fmt(p)}</div>
            </div>);})()}
          <div style={{display:"flex",gap:"10px"}}><button onClick={saveFinal} style={{...goldBtn,flex:1}}>حفظ</button><button onClick={()=>setShowFinal(false)} style={cancelBtn}>إلغاء</button></div>
        </>);})()}
      </Modal>}

      {/* Profile editor */}
      {showPE&&<Modal close={()=>setShowPE(false)}>
        <h2 style={mTitle}>{epId?"تعديل البروفايل":"بروفايل جديد"}</h2>
        <div style={{marginBottom:"14px"}}><label style={sLbl}>الأيقونة</label><div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>{PROFILE_EMOJIS.map(e=>(<button key={e} onClick={()=>setPf({...pf,emoji:e})} style={{width:"36px",height:"36px",borderRadius:"8px",fontSize:"18px",border:`1px solid ${pf.emoji===e?"#d4af37":"rgba(255,255,255,0.06)"}`,background:pf.emoji===e?"rgba(212,175,55,0.15)":"rgba(255,255,255,0.02)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{e}</button>))}</div></div>
        <div style={{marginBottom:"18px"}}><label style={sLbl}>الاسم *</label><input value={pf.name} onChange={e=>setPf({...pf,name:e.target.value})} style={{...inp,padding:"12px",fontSize:"14px"}}/></div>
        <div style={{display:"flex",gap:"10px"}}><button onClick={epId?updProf:addProf} style={{...goldBtn,flex:1,opacity:pf.name.trim()?1:0.4}}>{epId?"حفظ":"إضافة"}</button><button onClick={()=>setShowPE(false)} style={cancelBtn}>إلغاء</button></div>
      </Modal>}

      {/* ═══ SETTINGS MODAL ═══ */}
      {showSet&&(<div style={overlay} onClick={()=>setShowSet(false)}><div onClick={e=>e.stopPropagation()} style={{background:"#16161e",borderRadius:"18px",border:"1px solid rgba(255,255,255,0.08)",maxWidth:"580px",width:"100%",maxHeight:"85vh",display:"flex",flexDirection:"column",direction:"rtl",overflow:"hidden"}}>
        <div style={{padding:"20px 24px 0",flexShrink:0}}>
          <h2 style={{margin:"0 0 14px",fontSize:"18px",fontWeight:400,color:"#f5f3ef"}}>إعدادات: {ap.emoji} {ap.name}</h2>
          <div style={{display:"flex"}}>{[{id:"styles",l:"الاستايلات"},{id:"exchange",l:"الصرف"}].map(t=>(<button key={t.id} onClick={()=>setSetTab(t.id)} style={{flex:1,padding:"10px",border:"none",background:setTab===t.id?"rgba(212,175,55,0.08)":"transparent",color:setTab===t.id?"#d4af37":"#666",fontSize:"12px",fontWeight:setTab===t.id?600:400,cursor:"pointer",borderBottom:setTab===t.id?"2px solid #d4af37":"2px solid rgba(255,255,255,0.06)"}}>{t.l}</button>))}</div>
        </div>
        <div style={{padding:"20px 24px",overflowY:"auto",flex:1}}>
          {setTab==="exchange"&&<div style={{padding:"20px",background:"rgba(212,175,55,0.04)",borderRadius:"14px",border:"1px solid rgba(212,175,55,0.15)"}}><label style={{fontSize:"14px",color:"#d4af37",display:"block",marginBottom:"14px",fontWeight:500}}>$1 = ? دينار</label><NF val={eRate} set={setERate} sty={{fontSize:"22px",color:"#d4af37",padding:"14px"}}/></div>}

          {setTab==="styles"&&(<>
            {sForm ? (<div style={{padding:"18px",background:"rgba(212,175,55,0.04)",borderRadius:"14px",border:"1px solid rgba(212,175,55,0.2)",marginBottom:"12px",animation:"fadeIn 0.3s"}}>
              <div style={{fontSize:"14px",color:"#d4af37",marginBottom:"14px",fontWeight:500}}>{esId==="new"?"استايل جديد":"تعديل الاستايل"}</div>
              <div style={{display:"grid",gap:"10px"}}>
                <div><label style={sLbl}>الأيقونة</label><div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>{ICONS.map(ic=>(<button key={ic} onClick={()=>setSForm({...sForm,icon:ic})} style={{width:"30px",height:"30px",borderRadius:"6px",fontSize:"14px",border:`1px solid ${sForm.icon===ic?"#d4af37":"rgba(255,255,255,0.06)"}`,background:sForm.icon===ic?"rgba(212,175,55,0.15)":"rgba(255,255,255,0.02)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{ic}</button>))}</div></div>
                <div><label style={sLbl}>الاسم *</label><input value={sForm.name} onChange={e=>setSForm({...sForm,name:e.target.value})} style={inp}/></div>
                <div><label style={sLbl}>الوصف</label><input value={sForm.desc} onChange={e=>setSForm({...sForm,desc:e.target.value})} style={inp}/></div>
                <div><label style={sLbl}>التسعير</label><div style={{display:"flex"}}>{[{l:"حسب المدة",v:false},{l:"ثابت/قطعة",v:true}].map(o=>(<button key={String(o.v)} onClick={()=>setSForm({...sForm,isFixed:o.v})} style={togBtn(sForm.isFixed===o.v,!o.v)}>{o.l}</button>))}</div></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                  <div><label style={sLbl}>الأدنى ($)</label><NF val={sForm.isFixed?sForm.minFixed:sForm.minPer30} set={v=>setSForm({...sForm,[sForm.isFixed?"minFixed":"minPer30"]:v})}/></div>
                  <div><label style={sLbl}>الأعلى ($)</label><NF val={sForm.isFixed?sForm.maxFixed:sForm.maxPer30} set={v=>setSForm({...sForm,[sForm.isFixed?"maxFixed":"maxPer30"]:v})}/></div>
                </div>
                <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:"12px",marginTop:"4px"}}>
                  <label style={{...sLbl,fontSize:"12px",color:"#d4af37"}}>إضافات هذا الاستايل</label>
                  {sForm.extras.map((ex,i)=>(<div key={i} style={{display:"flex",gap:"6px",alignItems:"center",marginBottom:"8px",padding:"8px 10px",background:"rgba(255,255,255,0.02)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)"}}>
                    <input value={ex.name} onChange={e=>updateFormExtra(i,"name",e.target.value)} placeholder="الاسم" style={{...inp,flex:1,padding:"6px 8px",fontSize:"12px"}}/>
                    <NF val={ex.perUnit} set={v=>updateFormExtra(i,"perUnit",v)} sty={{width:"70px",padding:"6px",fontSize:"12px"}}/>
                    <span style={{fontSize:"10px",color:"#666"}}>$/وحدة</span>
                    <button onClick={()=>removeFormExtra(i)} style={{...iconBtn,color:"#a44",fontSize:"14px"}}>✕</button>
                  </div>))}
                  <button onClick={addExtraToForm} style={{padding:"8px",borderRadius:"6px",border:"1px dashed rgba(212,175,55,0.3)",background:"rgba(212,175,55,0.04)",color:"#d4af37",fontSize:"11px",cursor:"pointer",width:"100%"}}>+ إضافة</button>
                </div>
              </div>
              <div style={{display:"flex",gap:"8px",marginTop:"14px"}}><button onClick={saveStyleForm} style={{...goldBtn,flex:1,padding:"9px",fontSize:"12px",opacity:sForm.name.trim()?1:0.4}}>{esId==="new"?"إضافة":"حفظ"}</button><button onClick={()=>{setEsId(null);setSForm(null);}} style={cancelBtn}>إلغاء</button></div>
            </div>)
            : (<>
              {eStyles.map(s=>(<div key={s.id} style={{padding:"12px 14px",marginBottom:"8px",background:"rgba(255,255,255,0.02)",borderRadius:"12px",border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:"12px"}}>
                <div style={{fontSize:"22px"}}>{s.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:"13px",fontWeight:500,color:"#eee"}}>{s.name}</div>
                  <div style={{fontSize:"11px",color:"#666"}}>{s.isFixed?`$${s.minFixed}-${s.maxFixed}/قطعة`:`$${s.minPer30}-${s.maxPer30}/30ث`}{s.extras?.length>0?` · ${s.extras.length} إضافات`:""}</div>
                </div>
                <button onClick={()=>editStyle(s)} style={{padding:"5px 10px",borderRadius:"6px",fontSize:"11px",cursor:"pointer",border:"1px solid rgba(212,175,55,0.3)",background:"rgba(212,175,55,0.08)",color:"#d4af37"}}>تعديل</button>
                <button onClick={()=>delStyle(s.id)} style={{padding:"5px 10px",borderRadius:"6px",fontSize:"11px",cursor:"pointer",border:"1px solid rgba(220,50,50,0.2)",background:"rgba(220,50,50,0.08)",color:"#c44"}}>حذف</button>
              </div>))}
              <button onClick={addNewStyle} style={{width:"100%",padding:"12px",borderRadius:"10px",border:"1px dashed rgba(212,175,55,0.3)",background:"rgba(212,175,55,0.04)",color:"#d4af37",fontSize:"13px",cursor:"pointer",marginTop:"4px"}}>+ استايل جديد</button>
            </>)}
          </>)}
        </div>
        <div style={{padding:"14px 24px",borderTop:"1px solid rgba(255,255,255,0.06)",flexShrink:0,display:"flex",flexDirection:"column",gap:"8px"}}>
          <div style={{display:"flex",gap:"10px"}}>
            <button onClick={saveSet} style={{...goldBtn,flex:1}}>حفظ</button>
            <button onClick={()=>setShowSet(false)} style={cancelBtn}>إلغاء</button>
          </div>
          <button onClick={onSignOut} style={{width:"100%",padding:"9px",borderRadius:"8px",border:"1px solid rgba(239,68,68,0.2)",background:"rgba(239,68,68,0.05)",color:"#ef4444",fontSize:"12px",cursor:"pointer"}}>
            تسجيل الخروج من الحساب
          </button>
        </div>
      </div></div>)}

      <style>{`input[type="range"]::-webkit-slider-thumb{appearance:none;width:20px;height:20px;background:#d4af37;border-radius:50%;cursor:pointer;box-shadow:0 0 12px rgba(212,175,55,0.4)}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}input:focus{border-color:rgba(212,175,55,0.4)!important;outline:none}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(212,175,55,0.2);border-radius:3px}`}</style>
    </div>
  );
}

// ── Modal wrapper ──
function Modal({ close, children }) {
  return (<div style={overlay} onClick={close}><div onClick={e=>e.stopPropagation()} style={{background:"#16161e",borderRadius:"18px",padding:"28px",border:"1px solid rgba(255,255,255,0.08)",maxWidth:"440px",width:"100%",direction:"rtl",maxHeight:"80vh",overflowY:"auto"}}>{children}</div></div>);
}

// ── Team Page ──
function TeamPage({ team, save, del, upStatus }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name:"",specialties:[],links:[],rate:"",status:"available" });
  const [newLink, setNewLink] = useState("");
  const startAdd=()=>{setEditId(null);setForm({name:"",specialties:[],links:[],rate:"",status:"available"});setShowAdd(true);};
  const startEdit=m=>{setEditId(m.id);setForm({name:m.name,specialties:m.specialties||[],links:m.links||[],rate:m.rate||"",status:m.status});setShowAdd(true);};
  const cancel=()=>{setShowAdd(false);setEditId(null);};
  const togSpec=s=>setForm(f=>({...f,specialties:f.specialties.includes(s)?f.specialties.filter(x=>x!==s):[...f.specialties,s]}));
  const addLink=()=>{if(!newLink.trim())return;let u=newLink.trim();if(!u.startsWith("http"))u="https://"+u;setForm(f=>({...f,links:[...f.links,u]}));setNewLink("");};
  const doSave=()=>{if(!form.name.trim())return;if(editId)save(team.map(m=>m.id===editId?{...m,...form}:m));else save([...team,{id:Date.now(),...form}]);cancel();};

  return(<>
    <div style={{textAlign:"center",marginBottom:"28px"}}><div style={{fontSize:"11px",letterSpacing:"6px",color:"#d4af37",marginBottom:"10px",fontWeight:600}}>إدارة الفريق</div><h1 style={{fontSize:"24px",fontWeight:300,margin:0,color:"#f5f3ef"}}>فريقك</h1><div style={goldLine}/></div>
    {team.length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px",marginBottom:"20px"}}>{[{l:"الكل",v:team.length,c:"#d4af37"},{l:"متوفرين",v:team.filter(m=>m.status==="available").length,c:"#34d399"},{l:"مشغولين",v:team.filter(m=>m.status==="busy").length,c:"#fbbf24"}].map((s,i)=>(<div key={i} style={{padding:"12px 8px",background:"rgba(255,255,255,0.02)",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.06)",textAlign:"center"}}><div style={{fontSize:"20px",fontWeight:300,color:s.c}}>{s.v}</div><div style={{fontSize:"10px",color:"#666",marginTop:"3px"}}>{s.l}</div></div>))}</div>}
    {team.length===0&&!showAdd&&<div style={{textAlign:"center",padding:"48px",color:"#444"}}><div style={{fontSize:"40px",marginBottom:"12px"}}>👥</div><div>ما عندك أعضاء بعد</div></div>}
    {team.map(m=>{const st=STATUS_MAP[m.status];if(editId===m.id&&showAdd)return null;return(
      <div key={m.id} style={{padding:"14px",marginBottom:"10px",background:"rgba(255,255,255,0.02)",borderRadius:"14px",border:`1px solid ${st.bd}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"8px"}}>
          <div><div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}><span style={{fontSize:"15px",fontWeight:500,color:"#eee"}}>{m.name}</span><span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"4px",background:st.bg,color:st.tx,border:`1px solid ${st.bd}`}}>{st.lb}</span></div>
          {(m.specialties||[]).length>0&&<div style={{display:"flex",gap:"4px",flexWrap:"wrap",marginBottom:"6px"}}>{m.specialties.map((s,i)=><span key={i} style={tag("rgba(212,175,55,0.08)","#d4af37")}>{s}</span>)}</div>}
          {m.rate&&<div style={{fontSize:"11px",color:"#888"}}>السعر: ${m.rate}</div>}</div>
          <div style={{display:"flex",gap:"6px"}}><button onClick={()=>startEdit(m)} style={{padding:"5px 10px",borderRadius:"6px",fontSize:"11px",cursor:"pointer",border:"1px solid rgba(212,175,55,0.3)",background:"rgba(212,175,55,0.08)",color:"#d4af37"}}>تعديل</button><button onClick={()=>del(m.id)} style={{padding:"5px 10px",borderRadius:"6px",fontSize:"11px",cursor:"pointer",border:"1px solid rgba(220,50,50,0.2)",background:"rgba(220,50,50,0.08)",color:"#c44"}}>حذف</button></div>
        </div>
        {(m.links||[]).length>0&&<div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginTop:"6px"}}>{m.links.map((u,i)=>(<a key={i} href={u} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:"5px",padding:"5px 10px",borderRadius:"6px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#bbb",fontSize:"12px",textDecoration:"none"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="#d4af37";e.currentTarget.style.color="#d4af37";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.08)";e.currentTarget.style.color="#bbb";}}><span>{linkIcon(u)}</span><span>{linkLabel(u)}</span></a>))}</div>}
        <div style={{display:"flex",gap:"6px",marginTop:"10px"}}>{Object.entries(STATUS_MAP).map(([k,v])=>(<button key={k} onClick={()=>upStatus(m.id,k)} style={{padding:"4px 12px",borderRadius:"6px",fontSize:"10px",cursor:"pointer",border:`1px solid ${m.status===k?v.bd:"rgba(255,255,255,0.06)"}`,background:m.status===k?v.bg:"transparent",color:m.status===k?v.tx:"#555"}}>{v.lb}</button>))}</div>
      </div>);})}

    {showAdd&&(<div style={{padding:"18px",background:"rgba(212,175,55,0.04)",borderRadius:"14px",border:"1px solid rgba(212,175,55,0.2)",marginBottom:"12px",animation:"fadeIn 0.3s"}}>
      <div style={{fontSize:"14px",color:"#d4af37",marginBottom:"16px",fontWeight:500}}>{editId?"تعديل":"إضافة عضو جديد"}</div>
      <div style={{display:"grid",gap:"12px"}}>
        <div><label style={sLbl}>الاسم *</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={inp}/></div>
        <div><label style={sLbl}>الاختصاصات</label><div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>{SPECIALTIES.map(s=>(<button key={s} onClick={()=>togSpec(s)} style={{padding:"6px 12px",borderRadius:"6px",fontSize:"12px",cursor:"pointer",border:`1px solid ${form.specialties.includes(s)?"#d4af37":"rgba(255,255,255,0.08)"}`,background:form.specialties.includes(s)?"rgba(212,175,55,0.12)":"rgba(255,255,255,0.02)",color:form.specialties.includes(s)?"#d4af37":"#888"}}>{s}</button>))}</div></div>
        <div><label style={sLbl}>الروابط</label>
          {form.links.length>0&&<div style={{display:"flex",flexDirection:"column",gap:"6px",marginBottom:"10px"}}>{form.links.map((u,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px 10px",background:"rgba(255,255,255,0.03)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)"}}><span style={{fontSize:"16px"}}>{linkIcon(u)}</span><span style={{flex:1,fontSize:"12px",color:"#bbb",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",direction:"ltr",textAlign:"right"}}>{linkLabel(u)}</span><button onClick={()=>setForm(f=>({...f,links:f.links.filter((_,idx)=>idx!==i)}))} style={{...iconBtn,color:"#a44"}}>✕</button></div>))}</div>}
          <div style={{display:"flex",gap:"6px"}}><input placeholder="الصق رابط..." value={newLink} onChange={e=>setNewLink(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addLink()} style={{...inp,flex:1,padding:"8px 10px",direction:"ltr",textAlign:"right"}}/><button onClick={addLink} style={{padding:"8px 14px",borderRadius:"8px",border:"1px solid rgba(212,175,55,0.3)",background:"rgba(212,175,55,0.1)",color:"#d4af37",cursor:"pointer",fontSize:"16px",flexShrink:0}}>+</button></div>
        </div>
        <div><label style={sLbl}>السعر المعتاد ($)</label><NF val={form.rate} set={v=>setForm({...form,rate:v})} sty={{direction:"ltr"}}/></div>
      </div>
      <div style={{display:"flex",gap:"8px",marginTop:"16px"}}><button onClick={doSave} style={{...goldBtn,flex:1,opacity:form.name.trim()?1:0.4}}>{editId?"حفظ":"إضافة"}</button><button onClick={cancel} style={cancelBtn}>إلغاء</button></div>
    </div>)}
    {!showAdd&&<button onClick={startAdd} style={{width:"100%",padding:"14px",borderRadius:"12px",border:"1px dashed rgba(212,175,55,0.3)",background:"rgba(212,175,55,0.04)",color:"#d4af37",fontSize:"14px",cursor:"pointer",marginTop:"8px"}}>+ إضافة عضو جديد</button>}
  </>);
}

// ── Shared styles ──
const inp={width:"100%",padding:"10px 12px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",color:"#e8e6e1",fontSize:"13px",outline:"none",direction:"rtl",boxSizing:"border-box"};
const secL={fontSize:"12px",color:"#888",letterSpacing:"2px",display:"block",marginBottom:"10px",fontWeight:600};
const sLbl={fontSize:"11px",color:"#777",display:"block",marginBottom:"6px"};
const sm={fontSize:"12px",color:"#888"};
const goldLine={width:"40px",height:"1px",background:"linear-gradient(90deg,transparent,#d4af37,transparent)",margin:"14px auto 0"};
const stepBtn={width:"40px",height:"40px",borderRadius:"10px",border:"1px solid rgba(212,175,55,0.3)",background:"rgba(212,175,55,0.08)",color:"#d4af37",fontSize:"20px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"};
const miniBtn={width:"28px",height:"28px",borderRadius:"6px",border:"1px solid rgba(212,175,55,0.3)",background:"rgba(212,175,55,0.08)",color:"#d4af37",fontSize:"16px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"};
const iconBtn={background:"none",border:"none",color:"#666",cursor:"pointer",fontSize:"12px",padding:"2px 6px"};
const pillBtn={background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#888",borderRadius:"10px",padding:"8px 14px",cursor:"pointer",fontSize:"13px"};
const goldBtn={padding:"12px 28px",borderRadius:"10px",border:"none",background:"linear-gradient(135deg,#d4af37,#b8962e)",color:"#0a0a0f",fontSize:"13px",fontWeight:600,cursor:"pointer"};
const cancelBtn={padding:"12px 24px",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#888",fontSize:"14px",cursor:"pointer"};
const overlay={position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(8px)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"};
const mTitle={margin:"0 0 20px",fontSize:"18px",fontWeight:400,color:"#f5f3ef"};
const previewBox={padding:"12px",background:"rgba(255,255,255,0.03)",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.05)",marginBottom:"18px",fontSize:"12px",color:"#888",lineHeight:1.8};
const card={padding:"14px",marginBottom:"8px",background:"rgba(255,255,255,0.02)",borderRadius:"12px",border:"1px solid rgba(255,255,255,0.06)"};
const chk=on=>({width:"20px",height:"20px",borderRadius:"5px",border:`2px solid ${on?"#d4af37":"rgba(255,255,255,0.15)"}`,background:on?"#d4af37":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.2s"});
const tag=(bg,c)=>({fontSize:"12px",padding:"3px 8px",borderRadius:"5px",background:bg,color:c,border:`1px solid ${c}22`});
const tagSm=(bg,c)=>({padding:"8px 12px",background:bg,borderRadius:"8px",fontSize:"11px",color:c});
const togBtn=(active,isRight)=>({padding:"10px 24px",border:"1px solid",borderColor:active?"#d4af37":"rgba(255,255,255,0.06)",background:active?"rgba(212,175,55,0.12)":"rgba(255,255,255,0.02)",color:active?"#d4af37":"#666",cursor:"pointer",fontSize:"13px",fontWeight:active?600:400,flex:1,borderRadius:isRight?"0 8px 8px 0":"8px 0 0 8px",transition:"all 0.3s"});
const slider=(v,min,max,color)=>({width:"100%",height:"4px",appearance:"none",background:`linear-gradient(to left, ${color} ${((v-min)/(max-min))*100}%, rgba(255,255,255,0.08) ${((v-min)/(max-min))*100}%)`,borderRadius:"2px",outline:"none",cursor:"pointer"});
