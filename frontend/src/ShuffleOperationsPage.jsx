import React, {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {SHUFFLE_OPERATIONS_CSS} from "./shuffleOperationsAssets.js";

const OPS_INTERNAL_LAYOUT_CSS = `
  :host{display:block;width:100%;min-width:0;}
  .opsInAppRoot{
    width:100%;
    min-width:0;
    background:#f6f8fc;
    color:#0f172a;
    font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .opsInAppRoot .max-w-screen-2xl{max-width:1680px!important;width:100%!important;margin:0 auto!important;}
  .opsInAppRoot section{padding:12px 16px!important;}
  .opsInAppRoot .opsPanelWrap{
    background:#fff!important;
    border:1px solid #e6edf5!important;
    border-radius:28px!important;
    box-shadow:0 8px 24px rgba(15,23,42,.04)!important;
    padding:28px 32px!important;
  }
  .opsInAppRoot .opsPageHeading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:0 0 20px!important;}
  .opsInAppRoot .opsPageHeading h1,
  .opsInAppRoot .opsSectionTitle h2{
    font-family:Outfit,"Plus Jakarta Sans",Inter,ui-sans-serif,system-ui,sans-serif!important;
    font-size:24px!important;
    line-height:1.16!important;
    font-weight:800!important;
    letter-spacing:-.03em!important;
    color:#162447!important;
    margin:0!important;
  }
  .opsInAppRoot .opsPageHeading p,
  .opsInAppRoot .opsSectionTitle p{
    margin-top:10px!important;
    font-size:14px!important;
    line-height:1.55!important;
    font-weight:500!important;
    color:#718096!important;
    max-width:780px!important;
  }
  .opsInAppRoot .opsActionGrid,
  .opsInAppRoot .opsCashGrid,
  .opsInAppRoot .opsCashGridSecondary,
  .opsInAppRoot .opsExportGrid{width:100%!important;display:grid!important;}
  .opsInAppRoot .opsActionGrid{grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:22px!important;}
  .opsInAppRoot .opsCashGrid{
    grid-template-columns:repeat(6,minmax(0,1fr))!important;
    gap:18px!important;
    align-items:stretch!important;
    grid-auto-rows:1fr!important;
  }
  .opsInAppRoot .opsCashGridSecondary{grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:18px!important;}
  .opsInAppRoot .opsExportGrid{grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:18px!important;}
  .opsInAppRoot .opsActionGrid > *,
  .opsInAppRoot .opsCashGrid > *,
  .opsInAppRoot .opsCashGridSecondary > *,
  .opsInAppRoot .opsExportGrid > *{min-width:0;}
  .opsInAppRoot .opsActionCard,
  .opsInAppRoot .opsMetricCard,
  .opsInAppRoot .opsExportCard{
    background:#fff!important;
    border:1px solid #e8edf4!important;
    box-shadow:0 4px 14px rgba(15,23,42,.03)!important;
  }
  .opsInAppRoot .opsActionCard:hover,
  .opsInAppRoot .opsMetricCard:hover,
  .opsInAppRoot .opsExportCard:hover{
    border-color:#dbe5f1!important;
    box-shadow:0 8px 18px rgba(15,23,42,.05)!important;
  }
  .opsInAppRoot .opsActionCard{
    min-height:162px!important;
    border-radius:18px!important;
    padding:18px 18px 16px!important;
  }
  .opsInAppRoot .opsMetricCard{
    min-height:132px!important;
    height:132px!important;
    border-radius:16px!important;
    padding:14px 16px!important;
    display:flex!important;
    flex-direction:column!important;
    justify-content:space-between!important;
  }
  .opsInAppRoot .opsMetricCardWide{min-height:132px!important;height:132px!important;}

  .opsInAppRoot .opsExportCard{
    min-height:162px!important;
    border-radius:18px!important;
    padding:18px 18px 16px!important;
    display:flex!important;
    flex-direction:column!important;
    justify-content:space-between!important;
    gap:18px!important;
  }
  .opsInAppRoot .opsExportCardTop{
    display:flex!important;
    align-items:flex-start!important;
    gap:14px!important;
    min-height:80px!important;
  }
  .opsInAppRoot .opsExportIcon{
    width:44px!important;
    height:44px!important;
    min-width:44px!important;
    border-radius:14px!important;
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
    box-shadow:0 6px 18px rgba(15,23,42,.05)!important;
  }
  .opsInAppRoot .opsExportText{display:flex!important;flex-direction:column!important;gap:8px!important;min-width:0!important;}
  .opsInAppRoot .opsExportText h3{
    margin:0!important;
    font-family:Outfit,"Plus Jakarta Sans",Inter,ui-sans-serif,system-ui,sans-serif!important;
    font-size:15px!important;
    line-height:1.25!important;
    font-weight:800!important;
    color:#162447!important;
  }
  .opsInAppRoot .opsExportText p{
    margin:0!important;
    font-size:13px!important;
    line-height:1.5!important;
    font-weight:500!important;
    color:#718096!important;
  }
  .opsInAppRoot .opsExportButton{
    width:100%!important;
    min-height:44px!important;
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
    gap:10px!important;
    border-radius:12px!important;
    border:1.5px solid currentColor!important;
    font-size:14px!important;
    font-weight:800!important;
    line-height:1!important;
    transition:all .16s ease!important;
    background:#fff!important;
  }
  .opsInAppRoot .opsExportCard:hover .opsExportButton{transform:translateY(-1px)!important;}
  .opsInAppRoot .opsExportButton.bg-rose-600{background:#f43f5e!important;color:#fff!important;border-color:#f43f5e!important;}
  .opsInAppRoot .opsExportButton.bg-rose-600:hover{background:#e11d48!important;border-color:#e11d48!important;}
  .opsInAppRoot .opsChip{
    display:inline-flex!important;
    align-items:center!important;
    justify-content:center!important;
    min-height:32px!important;
    padding:0 16px!important;
    border-radius:10px!important;
    border:1px solid #e4ebf3!important;
    font-size:14px!important;
    font-weight:700!important;
    line-height:1!important;
    white-space:nowrap!important;
  }
  .opsInAppRoot .opsDateBox{display:flex!important;align-items:center!important;gap:14px!important;}
  .opsInAppRoot .opsDateLabel{font-size:13px!important;font-weight:800!important;color:#475569!important;}
  .opsInAppRoot .opsDateField{
    background:#fff!important;
    border:1px solid #e4ebf3!important;
    border-radius:12px!important;
    padding:0 14px!important;
    min-height:40px!important;
    font-size:14px!important;
    font-weight:700!important;
    color:#334155!important;
  }
  @media (max-width:1500px){
    .opsInAppRoot .opsActionGrid{grid-template-columns:repeat(3,minmax(0,1fr))!important;}
    .opsInAppRoot .opsCashGrid{grid-template-columns:repeat(3,minmax(0,1fr))!important;}
    .opsInAppRoot .opsCashGridSecondary{grid-template-columns:repeat(3,minmax(0,1fr))!important;}
    .opsInAppRoot .opsExportGrid{grid-template-columns:repeat(3,minmax(0,1fr))!important;}
  }
  @media (max-width:900px){
    .opsInAppRoot section{padding:10px 12px!important;}
    .opsInAppRoot .opsPanelWrap{padding:22px 20px!important;border-radius:22px!important;}
    .opsInAppRoot .opsActionGrid,
    .opsInAppRoot .opsCashGrid,
    .opsInAppRoot .opsCashGridSecondary,
    .opsInAppRoot .opsExportGrid{grid-template-columns:1fr!important;}
  }
`;

function ShadowOperationsFrame({children}){
  const hostRef = useRef(null);
  const [shadowRoot,setShadowRoot] = useState(null);
  useEffect(()=>{
    if(!hostRef.current) return;
    const root = hostRef.current.shadowRoot || hostRef.current.attachShadow({mode:"open"});
    setShadowRoot(root);
  },[]);
  return <div className="ops-shadow-root-wrap" ref={hostRef}>{shadowRoot && createPortal(<><style>{SHUFFLE_OPERATIONS_CSS}</style><style>{OPS_INTERNAL_LAYOUT_CSS}</style>{children}</>, shadowRoot)}</div>;
}

function CubeIcon({className=""}){
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
}
function ChevronIcon({className=""}){ return <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>; }
function SimpleIcon({type,className=""}){
  const common={fill:"none",stroke:"currentColor",strokeWidth:2,viewBox:"0 0 24 24",className};
  const paths={
    plus:<path d="M12 4v16m8-8H4"/>,
    sync:<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>,
    doc:<path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>,
    warn:<path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>,
    card:<path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>,
    eye:<><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></>,
    bell:<path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>,
    money:<path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>,
    wallet:<path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/>,
    receipt:<path d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/>,
    return:<path d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z"/>,
    calc:<path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>,
    box:<path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>,
    image:<path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>,
    cart:<path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"/>,
    calendar:<path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>,
    shield:<path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>,
    chart:<path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/>,
    db:<path d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375"/>,
    logout:<path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
  };
  return <svg {...common}>{paths[type] || paths.doc}</svg>;
}

function OpsNav({setTab, logout}){
  const nav = [["operations","Opérations"],["cash","Encaissements"],["inventory","Inventaire"],["cash","Caisse"],["association","Associations"],["dashboard","CRM Achats"]];
  return <nav className="bg-white border-b border-slate-200/80">
    <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center"><CubeIcon className="w-5 h-5 text-white"/></div>
        <span className="font-heading font-bold text-lg text-slate-900 tracking-tight">Smart Inventory</span>
      </div>
      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
        {nav.map(([id,label])=><button key={label} type="button" onClick={()=>setTab?.(id)} className={(id==="operations"?"text-indigo-600 border-b-2 border-indigo-600 pb-0.5":"hover:text-slate-900 transition-colors")+" ops-nav-button"}>{label}</button>)}
      </div>
      <div className="flex items-center gap-4">
        <button className="hidden sm:flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors ops-nav-button" type="button"><SimpleIcon type="bell" className="w-4 h-4"/></button>
        <button type="button" onClick={logout} title="Logout" className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold ops-nav-button">PI</button>
      </div>
    </div>
  </nav>;
}

function InventoryActionCard({icon,tone,badge,badgeClass,title,desc,label,onClick,file,onFile}){
  const iconBg = {violet:"bg-violet-50", blue:"bg-blue-50", emerald:"bg-emerald-50", amber:"bg-amber-50", rose:"bg-rose-50", teal:"bg-teal-50"}[tone] || "bg-indigo-50";
  const iconText = {violet:"text-violet-600", blue:"text-blue-600", emerald:"text-emerald-600", amber:"text-amber-600", rose:"text-rose-600", teal:"text-teal-600"}[tone] || "text-indigo-600";
  const inner = <>
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className={`w-[58px] h-[58px] rounded-[16px] ${iconBg} flex items-center justify-center`}><SimpleIcon type={icon} className={`w-7 h-7 ${iconText}`}/></div>
      <span className={`text-[14px] font-semibold px-4 py-1.5 rounded-full ${badgeClass}`}>{badge}</span>
    </div>
    <h3 className="font-heading font-semibold text-[16px] leading-[1.3] text-slate-900 mb-2">{title}</h3>
    <p className="text-[13px] leading-[1.55] text-slate-500 mb-6 min-h-[38px]">{desc}</p>
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-indigo-600">{label}<ChevronIcon className="w-3.5 h-3.5"/></span>
  </>;
  const cls="opsActionCard group";
  if(file) return <label className={`${cls} ops-file-label cursor-pointer`}>{inner}<input type="file" accept={file} onChange={e=>onFile?.(e.target.files?.[0])}/></label>;
  return <button type="button" onClick={onClick} className={`${cls} text-left cursor-pointer`}>{inner}</button>;
}

function CashMetric({icon,tone,label,value,actionLabel,onClick,muted=false,wide=false}){
  const bg = {green:"bg-green-50", sky:"bg-sky-50", violet:"bg-violet-50", amber:"bg-amber-50", rose:"bg-rose-50", teal:"bg-teal-50", indigo:"bg-indigo-50", fuchsia:"bg-fuchsia-50", orange:"bg-orange-50", cyan:"bg-cyan-50", lime:"bg-lime-50", pink:"bg-pink-50"}[tone] || "bg-indigo-50";
  const text = {green:"text-green-600", sky:"text-sky-600", violet:"text-violet-600", amber:"text-amber-600", rose:"text-rose-600", teal:"text-teal-600", indigo:"text-indigo-600", fuchsia:"text-fuchsia-600", orange:"text-orange-600", cyan:"text-cyan-600", lime:"text-lime-600", pink:"text-pink-600"}[tone] || "text-indigo-600";
  return <button type="button" onClick={onClick} className={`opsMetricCard ${wide ? "opsMetricCardWide" : ""} text-left cursor-pointer`}>
    <div className="flex items-center gap-3"><div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}><SimpleIcon type={icon} className={`w-5 h-5 ${text}`}/></div><p className="text-[13px] font-medium leading-[1.25] text-slate-500 mb-0">{label}</p></div>
    <p className="font-heading text-[18px] leading-none font-bold text-slate-900">{value}</p>
    <span className={`inline-block text-[13px] font-semibold ${muted ? "text-slate-400" : text.includes("green") || text.includes("lime") ? "text-emerald-600" : "text-indigo-600"}`}>{actionLabel}</span>
  </button>;
}

function ExportCard({icon,tone,title,desc,label,onClick,file,onFile}){
  const bg={violet:"from-violet-100 to-violet-50",emerald:"from-emerald-100 to-emerald-50",sky:"from-sky-100 to-sky-50",amber:"from-amber-100 to-amber-50",rose:"from-rose-100 to-rose-50"}[tone]||"from-indigo-100 to-indigo-50";
  const text={violet:"text-violet-600",emerald:"text-emerald-600",sky:"text-sky-600",amber:"text-amber-600",rose:"text-rose-600"}[tone]||"text-indigo-600";
  const btnTone={violet:"text-violet-600 border-violet-300 hover:bg-violet-50",emerald:"text-emerald-600 border-emerald-300 hover:bg-emerald-50",sky:"text-sky-600 border-sky-300 hover:bg-sky-50",amber:"text-amber-600 border-amber-300 hover:bg-amber-50",rose:"bg-rose-600 hover:bg-rose-700 text-white border-rose-600 shadow-[0_10px_24px_rgba(244,63,94,0.18)]"}[tone]||"text-indigo-600 border-indigo-300 hover:bg-indigo-50";
  const content = <>
    <div className="opsExportCardTop">
      <div className={`opsExportIcon bg-gradient-to-br ${bg}`}><SimpleIcon type={icon} className={`w-7 h-7 ${text}`}/></div>
      <div className="opsExportText">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
    </div>
    <span className={`opsExportButton ${btnTone}`}>{label}</span>
  </>;
  const cls="opsExportCard group flex flex-col";
  if(file) return <label className={`${cls} ops-file-label cursor-pointer`}>{content}<input type="file" accept={file} onChange={e=>onFile?.(e.target.files?.[0])}/></label>;
  return <button type="button" onClick={onClick} className={`${cls} text-left cursor-pointer`}>{content}</button>;
}

export default function ShuffleOperationsPage({
  setTab, logout, cashDate, canChangeCashDate, onCashDateChange,
  shortageText, surplusText, inventoryActions, cashMetrics, exportActions, hideChrome=false
}){
  return <ShadowOperationsFrame>
    <div className={`antialiased font-body bg-body text-body min-h-screen ${hideChrome ? "opsInAppRoot" : ""}`}>
      {!hideChrome && <OpsNav setTab={setTab} logout={logout}/>}      
      <section>
        <div className="max-w-screen-2xl mx-auto">
          <div className="opsPanelWrap">
            <div className="opsPageHeading">
              <div>
                <h1>Actions Inventaire</h1>
                <p>Toutes les actions nécessaires pour la gestion de votre inventaire.</p>
              </div>
            </div>
            <div className="opsActionGrid">
              {inventoryActions.map(a=><InventoryActionCard key={a.title} {...a} />)}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-screen-2xl mx-auto">
          <div className="opsPanelWrap">
            <div className="mb-7">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                    <SimpleIcon type="card" className="w-4 h-4" />
                  </div>
                  <div className="opsSectionTitle">
                    <h2>Opérations de caisse</h2>
                    <p>Suivi des flux financiers entrants et sortants.</p>
                  </div>
                </div>
                <div className="flex flex-col items-start lg:items-end gap-4">
                  <div className="flex flex-wrap items-center justify-end gap-4">
                    <span className="opsChip bg-rose-50 text-rose-700 border-rose-200">Montant manquant: {shortageText || 'DH 0'}</span>
                    <span className="opsChip bg-emerald-50 text-emerald-700 border-emerald-200">Montant surplus: {surplusText || 'DH 0'}</span>
                  </div>
                  <div className="opsDateBox">
                    <label className="opsDateLabel">Date de caisse</label>
                    <input type="date" value={cashDate} disabled={!canChangeCashDate} onChange={e=>onCashDateChange?.(e.target.value)} className="opsDateField focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 disabled:bg-slate-50 disabled:text-slate-400" />
                  </div>
                </div>
              </div>
            </div>
            <div className="opsCashGrid">
              {cashMetrics.map(m=><CashMetric key={m.label} {...m} />)}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-screen-2xl mx-auto">
          <div className="opsPanelWrap">
            <div className="mb-8 opsSectionTitle">
              <h2>Exports et sauvegardes locales</h2>
              <p>Exporter les données de vos CTRL et générer des rapports détaillés locaux.</p>
            </div>
            <div className="opsExportGrid">
              {exportActions.map(a=><ExportCard key={a.title} {...a} />)}
            </div>
          </div>
        </div>
      </section>

      {!hideChrome && <footer className="bg-white border-t border-slate-200/80 py-8 px-6 mt-6">
        <div className="max-w-screen-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3"><div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center"><CubeIcon className="w-4 h-4 text-white"/></div><span className="font-heading font-semibold text-sm text-slate-900">Smart Inventory</span></div>
          <p className="text-xs text-slate-400">© 2026 Smart Inventory. Tous droits réservés.</p>
          <div className="flex items-center gap-4"><button onClick={logout} className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-500 transition-colors py-2 px-4 rounded-xl border border-slate-200 hover:border-red-200 ops-nav-button"><SimpleIcon type="logout" className="w-4 h-4"/>Logout</button></div>
        </div>
      </footer>}
    </div>
  </ShadowOperationsFrame>;
}
