import React, {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {SHUFFLE_OPERATIONS_CSS} from "./shuffleOperationsAssets.js";

const OPS_INTERNAL_LAYOUT_CSS = `
  :host{display:block;width:100%;min-width:0;}
  .opsInAppRoot{width:100%;min-width:0;background:#f8fafc;}
  .opsInAppRoot section{padding-left:0!important;padding-right:0!important;}
  .opsInAppRoot .max-w-screen-2xl{max-width:none!important;width:100%!important;margin-left:0!important;margin-right:0!important;}
  .opsInAppRoot .opsActionGrid,
  .opsInAppRoot .opsCashGrid,
  .opsInAppRoot .opsExportGrid{width:100%!important;}
  .opsInAppRoot .opsActionGrid{grid-template-columns:repeat(auto-fit,minmax(270px,1fr))!important;}
  .opsInAppRoot .opsCashGrid{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))!important;}
  .opsInAppRoot .opsExportGrid{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))!important;}
  .opsInAppRoot .opsActionGrid > *,
  .opsInAppRoot .opsCashGrid > *,
  .opsInAppRoot .opsExportGrid > *{min-width:0;}
  .opsInAppRoot .opsActionGrid > *,
  .opsInAppRoot .opsCashGrid > button{min-height:160px;}
  .opsInAppRoot .opsCashGrid > button{padding:24px!important;}
  .opsInAppRoot .opsCashGrid .font-heading.text-xl{font-size:1.55rem!important;line-height:1.9rem!important;}
  .opsInAppRoot .opsActionGrid h3,
  .opsInAppRoot .opsExportGrid h3{font-size:0.98rem!important;}
  @media (max-width:900px){
    .opsInAppRoot .opsActionGrid,
    .opsInAppRoot .opsCashGrid,
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
  const nav = [
    ["operations","Opérations"],["cash","Encaissements"],["inventory","Inventaire"],["cash","Caisse"],["association","Associations"],["dashboard","CRM Achats"]
  ];
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
    <div className="flex items-center gap-3 mb-4"><div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}><SimpleIcon type={icon} className={`w-5 h-5 ${iconText}`}/></div><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>{badge}</span></div>
    <h3 className="font-heading font-semibold text-sm text-slate-900 mb-1">{title}</h3>
    <p className="text-xs text-slate-500 mb-4 leading-relaxed">{desc}</p>
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">{label}<ChevronIcon className="w-3 h-3"/></span>
  </>;
  const cls="group bg-white rounded-2xl border border-slate-200/80 p-5 hover:shadow-lg hover:shadow-indigo-500/5 hover:border-indigo-200 transition-all duration-300";
  if(file) return <label className={`${cls} ops-file-label cursor-pointer`}>{inner}<input type="file" accept={file} onChange={e=>onFile?.(e.target.files?.[0])}/></label>;
  return <button type="button" onClick={onClick} className={`${cls} text-left cursor-pointer`}>{inner}</button>;
}

function CashMetric({icon,tone,label,value,actionLabel,onClick,muted=false}){
  const bg = {green:"bg-green-50", sky:"bg-sky-50", violet:"bg-violet-50", amber:"bg-amber-50", rose:"bg-rose-50", teal:"bg-teal-50", indigo:"bg-indigo-50", fuchsia:"bg-fuchsia-50", orange:"bg-orange-50", cyan:"bg-cyan-50", lime:"bg-lime-50", pink:"bg-pink-50"}[tone] || "bg-indigo-50";
  const text = {green:"text-green-600", sky:"text-sky-600", violet:"text-violet-600", amber:"text-amber-600", rose:"text-rose-600", teal:"text-teal-600", indigo:"text-indigo-600", fuchsia:"text-fuchsia-600", orange:"text-orange-600", cyan:"text-cyan-600", lime:"text-lime-600", pink:"text-pink-600"}[tone] || "text-indigo-600";
  return <button type="button" onClick={onClick} className="bg-white rounded-2xl border border-slate-200/80 p-5 text-left cursor-pointer shadow-sm shadow-slate-200/50 hover:shadow-md hover:border-indigo-200 transition-all duration-300">
    <div className="flex items-center gap-3 mb-3"><div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}><SimpleIcon type={icon} className={`w-4 h-4 ${text}`}/></div></div>
    <p className="text-xs text-slate-500 mb-1">{label}</p>
    <p className="font-heading text-xl font-bold text-slate-900">{value}</p>
    <span className={`inline-block mt-3 text-xs font-semibold ${muted ? "text-slate-400" : text.includes("green") || text.includes("lime") ? "text-emerald-600 hover:text-emerald-700" : "text-indigo-600 hover:text-indigo-700"} transition-colors`}>{actionLabel}</span>
  </button>;
}

function ExportCard({icon,tone,title,desc,label,onClick,file,onFile}){
  const bg={violet:"from-violet-100 to-violet-50",emerald:"from-emerald-100 to-emerald-50",sky:"from-sky-100 to-sky-50",amber:"from-amber-100 to-amber-50",rose:"from-rose-100 to-rose-50"}[tone]||"from-indigo-100 to-indigo-50";
  const text={violet:"text-violet-600",emerald:"text-emerald-600",sky:"text-sky-600",amber:"text-amber-600",rose:"text-rose-600"}[tone]||"text-indigo-600";
  const btn={violet:"bg-indigo-600 hover:bg-indigo-700",emerald:"bg-emerald-600 hover:bg-emerald-700",sky:"bg-sky-600 hover:bg-sky-700",amber:"bg-amber-600 hover:bg-amber-700",rose:"bg-rose-600 hover:bg-rose-700"}[tone]||"bg-indigo-600 hover:bg-indigo-700";
  const content=<><div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${bg} flex items-center justify-center mb-5`}><SimpleIcon type={icon} className={`w-6 h-6 ${text}`}/></div><h3 className="font-heading font-semibold text-slate-900 mb-2">{title}</h3><p className="text-xs text-slate-500 leading-relaxed mb-5 grow">{desc}</p><span className={`w-full py-2.5 rounded-xl ${btn} text-white text-xs font-semibold active:scale-[0.98] transition-all duration-200 text-center block`}>{label}</span></>;
  const cls="group bg-white rounded-2xl border border-slate-200/80 p-6 hover:shadow-lg hover:shadow-indigo-500/5 hover:border-indigo-200 transition-all duration-300 flex flex-col";
  if(file) return <label className={`${cls} ops-file-label cursor-pointer`}>{content}<input type="file" accept={file} onChange={e=>onFile?.(e.target.files?.[0])}/></label>;
  return <button type="button" onClick={onClick} className={`${cls} text-left cursor-pointer`}>{content}</button>;
}

export default function ShuffleOperationsPage({
  setTab, logout, cashDate, canChangeCashDate, onCashDateChange,
  formatValue, headerSolde, headerCash, shortageText, surplusText, inventoryActions, cashMetrics, exportActions, hideChrome=false
}){
  return <ShadowOperationsFrame>
    <div className={`antialiased font-body bg-body text-body bg-slate-50 text-slate-800 min-h-screen ${hideChrome ? "opsInAppRoot" : ""}`}>
      {!hideChrome && <OpsNav setTab={setTab} logout={logout}/>}
      <section className="py-10 px-6">
        <div className="max-w-screen-2xl mx-auto">
          <div className="mb-2"><p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Pour aux essentiels et certaines de ces outils et la progression locale</p></div>
          <div className="mb-8"><h1 className="font-heading text-2xl font-bold text-slate-900 mb-1">Actions Inventaire</h1><p className="text-sm text-slate-500">Toutes les actions nécessaires pour la gestion de votre inventaire.</p></div>
          <div className="opsActionGrid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {inventoryActions.map(a=><InventoryActionCard key={a.title} {...a}/>) }
          </div>
        </div>
      </section>
      <section className="py-10 px-6">
        <div className="max-w-screen-2xl mx-auto">
          <div className="border-t border-slate-200 pt-8 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                  <SimpleIcon type="card" className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-heading text-lg font-bold text-slate-900 leading-tight mb-1">Opérations de caisse</h2>
                  <p className="text-xs text-slate-500">Suivi des flux financiers entrants et sortants.</p>
                </div>
              </div>
              <div className="flex flex-col items-start lg:items-end gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                    Montant manquant: {shortageText || 'DH 0'}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    Montant surplus: {surplusText || 'DH 0'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Date de caisse</label>
                  <input type="date" value={cashDate} disabled={!canChangeCashDate} onChange={e=>onCashDateChange?.(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 disabled:bg-slate-50 disabled:text-slate-400" />
                </div>
              </div>
            </div>
          </div>
          <div className="opsCashGrid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
            {cashMetrics.slice(0,6).map(m=><CashMetric key={m.label} {...m}/>) }
          </div>
          <div className="opsCashGrid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {cashMetrics.slice(6).map(m=><CashMetric key={m.label} {...m}/>) }
          </div>
        </div>
      </section>
      <section className="py-10 px-6">
        <div className="max-w-screen-2xl mx-auto">
          <div className="mb-8"><h2 className="font-heading text-2xl font-bold text-slate-900 mb-2">Exports et sauvegarde locales</h2><p className="text-sm text-slate-500">Exporter les données de vos CTRL et générer des rapports détaillés locaux.</p></div>
          <div className="opsExportGrid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {exportActions.map(a=><ExportCard key={a.title} {...a}/>) }
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
