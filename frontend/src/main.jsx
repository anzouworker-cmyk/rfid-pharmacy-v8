
import React, {useEffect, useMemo, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import axios from "axios";
import Papa from "papaparse";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
function mediaUrl(url){
  const u = String(url || "").trim();
  if(!u) return "";
  if(/^https?:\/\//i.test(u) || u.startsWith("data:") || u.startsWith("blob:")) return u;
  if(u.startsWith("/")) return API.replace(/\/$/, "") + u;
  return u;
}

function apiErrorMessage(e, action="requête API"){
  const status = e?.response?.status;
  const detail = e?.response?.data?.detail || e?.response?.data?.message || e?.message || "";
  if(!e?.response){
    return `Erreur ${action}: API inaccessible ou CORS bloqué. Vérifiez VITE_API_URL et FRONTEND_ORIGINS dans Render.`;
  }
  if(status===401) return `Erreur ${action}: session expirée. Déconnectez-vous puis reconnectez-vous.`;
  if(status===403) return `Erreur ${action}: accès refusé. Connectez-vous avec admin/admin123.`;
  return `Erreur ${action}${status ? ` (${status})` : ""}${detail ? `: ${detail}` : ""}`;
}
const LS_PRODUCTS="rfid_v7_products";
const LS_ASSOC="rfid_v7_associations";
const LS_DETECTED_EPCS="rfid_v7_detected_epcs";

function saveLS(k,v){ localStorage.setItem(k,JSON.stringify(v)); }
function loadLS(k,def){ try{return JSON.parse(localStorage.getItem(k)||"")}catch{return def} }
function norm(v){ return String(v ?? "").trim().replaceAll(" ","").replaceAll("-","").toUpperCase(); }
function isLikelyEpc(v){
  const s=norm(v);
  if(!s || ["EPC","TAG","RFID","DATE","PID","PRODUIT","PRODUCT"].includes(s)) return false;
  return /^[0-9A-F]{8,64}$/i.test(s) || s.length >= 12;
}
function extractDetectedEpcs(rows){
  const epcs=[];
  (rows||[]).forEach(row=>{
    const cells=Array.isArray(row) ? row : Object.values(row||{});
    for(const cell of cells){
      const v=norm(cell);
      if(isLikelyEpc(v)){ epcs.push(v); break; }
    }
  });
  return [...new Set(epcs)];
}

function downloadJSON(filename, data){
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function readJSONFile(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => {
      try{ resolve(JSON.parse(reader.result)); }
      catch(e){ reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file, "utf-8");
  });
}

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function exportCSV(filename, rows, cols){
  const esc = v => `"${String(v ?? "").replaceAll('"','""')}"`;
  const csv = [cols.join(";"), ...rows.map(r => cols.map(c => esc(r[c])).join(";"))].join("\n");
  const blob = new Blob(["\ufeff" + csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function cleanSearchText(v){
  return String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function downloadTextPDF(filename, title, lines){
  const safe = v => String(v ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/[()\\]/g, " ")
    .slice(0, 105);
  const allLines=[title, "", ...(lines||[])].map(safe).slice(0, 48);
  const bodyLines=["BT", "/F1 12 Tf", "50 800 Td", "16 TL", ...allLines.map(line=>`(${line}) Tj T*`), "ET"];
  const stream=bodyLines.join("\n");
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];
  let pdf="%PDF-1.4\n";
  const offsets=[0];
  objects.forEach((obj,i)=>{
    offsets.push(pdf.length);
    pdf += `${i+1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart=pdf.length;
  pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(o=>{ pdf += `${String(o).padStart(10,"0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  const blob=new Blob([pdf],{type:"application/pdf"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

function useLocalStore(){
  const [productsState,setProductsState]=useState(()=>loadLS(LS_PRODUCTS,[]));
  const [associationsState,setAssociationsState]=useState(()=>loadLS(LS_ASSOC,[]));
  const [detectedEpcsState,setDetectedEpcsState]=useState(()=>loadLS(LS_DETECTED_EPCS,[]));
  function setProducts(rows){ setProductsState(rows); saveLS(LS_PRODUCTS,rows); }
  function setAssociations(rows){ setAssociationsState(rows); saveLS(LS_ASSOC,rows); }
  function setDetectedEpcs(rows){
    const cleaned=[...new Set((rows||[]).map(norm).filter(Boolean))];
    setDetectedEpcsState(cleaned);
    saveLS(LS_DETECTED_EPCS,cleaned);
  }
  return {products:productsState,setProducts,associations:associationsState,setAssociations,detectedEpcs:detectedEpcsState,setDetectedEpcs};
}







function SidebarBrandIcon({className=""}){
  return <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M32 8 50 18v28L32 56 14 46V18L32 8Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round"/>
    <path d="M32 8v20m18-10-18 10-18-10" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round"/>
    <path d="M32 28v28" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
  </svg>
}

function SmartInventoryLogo({className=""}){
  return <div className={`smartSidebarLogo ${className}`.trim()} aria-label="Smart Inventory">
    <SidebarBrandIcon className="smartSidebarLogoIcon"/>
    <div className="smartSidebarLogoText">
      <span className="smartSidebarLogoSmart">Smart</span>
      <span className="smartSidebarLogoInventory">Inventory</span>
    </div>
  </div>
}

function SidebarGlyph({name, active=false}){
  const stroke = active ? "#ffffff" : "#c8d4e6";
  const common = {stroke, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none"};
  if(name==="dashboard"){
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.6" fill={active ? "#ffffff" : "#c8d4e6"}/>
      <rect x="14" y="3" width="7" height="7" rx="1.6" fill={active ? "#ffffff" : "#c8d4e6"}/>
      <rect x="3" y="14" width="7" height="7" rx="1.6" fill={active ? "#ffffff" : "#c8d4e6"}/>
      <rect x="14" y="14" width="7" height="7" rx="1.6" fill={active ? "#ffffff" : "#c8d4e6"}/>
    </svg>;
  }
  if(name==="operations"){
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="4" width="12" height="16" rx="2.2" {...common}/>
      <path d="M9 4.8h6" {...common}/>
      <path d="M9 10h6" {...common}/>
      <path d="M9 14.5h4.5" {...common}/>
    </svg>;
  }
  if(name==="association"){
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="1.2" fill={stroke}/>
      <path d="M8.6 8.2A6.4 6.4 0 0 0 8.6 15.8" {...common}/>
      <path d="M15.4 8.2A6.4 6.4 0 0 1 15.4 15.8" {...common}/>
      <path d="M5.1 5.1A10.7 10.7 0 0 0 5.1 18.9" {...common}/>
      <path d="M18.9 5.1A10.7 10.7 0 0 1 18.9 18.9" {...common}/>
    </svg>;
  }
  if(name==="inventory"){
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8V6a2 2 0 0 1 2-2h2" {...common}/>
      <path d="M16 4h2a2 2 0 0 1 2 2v2" {...common}/>
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" {...common}/>
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" {...common}/>
      <path d="M9 9v6" {...common}/><path d="M12 8v8" {...common}/><path d="M15 9v6" {...common}/>
    </svg>;
  }
  if(name==="ai"){
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.2 5.3c-.8 0-1.5.4-2 .9-.6-.2-1.2-.2-1.8 0-1 .4-1.7 1.4-1.7 2.6 0 .4.1.8.3 1.2-.6.5-1 1.3-1 2.2 0 1.3.8 2.4 2 2.8.2 1.5 1.4 2.5 2.9 2.5.5 0 1-.1 1.4-.4.5.6 1.2.9 2 .9.8 0 1.5-.3 2-.9.4.3.9.4 1.4.4 1.5 0 2.7-1 2.9-2.5 1.2-.4 2-1.5 2-2.8 0-.9-.4-1.7-1-2.2.2-.4.3-.8.3-1.2 0-1.1-.6-2.2-1.7-2.6-.6-.2-1.2-.2-1.8 0-.5-.5-1.2-.9-2-.9-.6 0-1.2.2-1.7.5-.5-.3-1.1-.5-1.7-.5Z" {...common}/>
      <path d="M12 8.5v7" {...common}/><path d="M9.2 11.1 12 12.5l2.8-1.4" {...common}/><path d="M9.2 15 12 13.5 14.8 15" {...common}/>
    </svg>;
  }
  if(name==="platform"){
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="9" r="2.5" {...common}/><circle cx="16" cy="9" r="2.5" {...common}/><path d="M4.5 18c.6-2 2.1-3 3.5-3s2.9 1 3.5 3" {...common}/><path d="M12.5 18c.6-2 2.1-3 3.5-3s2.9 1 3.5 3" {...common}/>
    </svg>;
  }
  if(name==="dashboardAdmin"){
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 18 7.2 6.8a1.2 1.2 0 0 1 1.2-.9h7.2a1.2 1.2 0 0 1 1.2.9L19 18" {...common}/><path d="M4 18h16" {...common}/><path d="M9.2 10.2h5.6" {...common}/>
    </svg>;
  }
  if(name==="logout"){
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10" {...common}/>
      <path d="M13 8l4 4-4 4" {...common}/><path d="M9 12h8" {...common}/>
    </svg>;
  }

  if(name==="upload") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V9" {...common}/><path d="m8 13 4-4 4 4" {...common}/><path d="M5 20h14" {...common}/><path d="M6 4h12" {...common}/></svg>;
  if(name==="link") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.8 14.2 14.2 9.8" {...common}/><path d="M10.8 6.2 12 5a4 4 0 0 1 5.7 5.7l-1.2 1.2" {...common}/><path d="M13.2 17.8 12 19a4 4 0 0 1-5.7-5.7l1.2-1.2" {...common}/></svg>;
  if(name==="barcode") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14" {...common}/><path d="M8 5v14" {...common}/><path d="M12 5v14" {...common}/><path d="M15 5v14" {...common}/><path d="M19 5v14" {...common}/></svg>;
  if(name==="trash") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" {...common}/><path d="M10 11v6" {...common}/><path d="M14 11v6" {...common}/><path d="M6 7l1 14h10l1-14" {...common}/><path d="M9 7V4h6v3" {...common}/></svg>;
  if(name==="save") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5V4Z" {...common}/><path d="M8 4v6h8V4" {...common}/><path d="M8 20v-6h8v6" {...common}/></svg>;
  if(name==="restore") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7" {...common}/><path d="M4 5v5h5" {...common}/><path d="M12 8v5l3 2" {...common}/></svg>;
  if(name==="chart") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10" {...common}/><path d="M12 20V5" {...common}/><path d="M19 20v-7" {...common}/><path d="M3 20h18" {...common}/></svg>;
  return null;
}


function DashIcon({name}){
  const common={fill:"none",stroke:"currentColor",strokeWidth:2.1,strokeLinecap:"round",strokeLinejoin:"round"};
  if(name==="box") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 7.1 12 11.2l7.5-4.1L12 3Z" {...common}/><path d="M4.5 7.1v8.4L12 20l7.5-4.5V7.1" {...common}/><path d="M12 11.2V20" {...common}/></svg>;
  if(name==="tag") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13.1 13.1 20a2.2 2.2 0 0 1-3.1 0L4 14V4h10l6 6a2.2 2.2 0 0 1 0 3.1Z" {...common}/><circle cx="9" cy="9" r="1.5" fill="currentColor"/></svg>;
  if(name==="rfid") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13.5a10 10 0 0 1 14 0" {...common}/><path d="M8.2 16.5a5.8 5.8 0 0 1 7.6 0" {...common}/><path d="M11.3 19.3a1.1 1.1 0 0 1 1.4 0" {...common}/></svg>;
  if(name==="warning") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 4.9 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0Z" {...common}/><path d="M12 9v5" {...common}/><path d="M12 17.5h.01" {...common}/></svg>;
  if(name==="check") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" {...common}/></svg>;
  if(name==="doc") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7V3Z" {...common}/><path d="M14 3v5h5" {...common}/><path d="M9.5 12h5" {...common}/><path d="M9.5 16h5" {...common}/></svg>;
  if(name==="clock") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" {...common}/><path d="M12 7.8v4.7l3 1.9" {...common}/></svg>;
  if(name==="download") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11" {...common}/><path d="m8 11 4 4 4-4" {...common}/><path d="M5 20h14" {...common}/></svg>;
  if(name==="bell") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 9a5 5 0 0 0-10 0c0 5-2 6-2 6h14s-2-1-2-6Z" {...common}/><path d="M10 19a2 2 0 0 0 4 0" {...common}/></svg>;
  if(name==="dots") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>;
  return null;
}

function App(){
  const [token,setToken]=useState(localStorage.token||"");
  const [me,setMe]=useState(null);
  const [tab,setTab]=useState("dashboard");
  const [sidebarCollapsed,setSidebarCollapsed]=useState(localStorage.sidebarCollapsed==="1");
  const auth={headers:{Authorization:`Bearer ${token}`}};

  useEffect(()=>{ if(token) axios.get(`${API}/me`,auth).then(r=>setMe(r.data)).catch(()=>logout()) },[token]);

  function logout(){ localStorage.removeItem("token"); setToken(""); setMe(null); }
  function toggleSidebar(){
    const next=!sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.sidebarCollapsed=next ? "1" : "0";
  }

  if(!token) return <Login setToken={setToken}/>;

  const displayName = me?.username || "Utilisateur";
  const accountName = me?.pharmacy_name || displayName;
  const roleName = me?.role==="platform_admin" ? "Administrateur" : "Utilisateur";

  const pageTitle =
    tab==="operations" ? "Operations" :
    tab==="dashboard" ? "Dashboard" :
    tab==="association" ? "Associations RFID" :
    tab==="inventory" ? "Inventaire RFID réel" :
    tab==="ai" ? "Assistant IA" :
    tab==="platform" ? "Clients SaaS" :
    tab==="dashboardAdmin" ? "Publicités" : "Smart Inventory";


  const menu=[
    {id:"dashboard",label:"Dashboard",icon:"dashboard"},
    {id:"operations",label:"Operations",icon:"operations"},
    {id:"association",label:"Associations RFID",icon:"association"},
    {id:"inventory",label:"Inventaire RFID",icon:"inventory"},
    {id:"ai",label:"Assistant IA",icon:"ai"},
  ];
  if(me?.role==="platform_admin"){
    menu.push({id:"platform",label:"Clients SaaS",icon:"platform"});
    menu.push({id:"dashboardAdmin",label:"Publicités",icon:"dashboardAdmin"});
  }

  return <div className={sidebarCollapsed ? "appShell whiteShell sidebarIsCollapsed" : "appShell whiteShell"}>
    <aside className="sidebar whiteSidebar">
      <div className="whiteBrand">
        <SmartInventoryLogo className="sidebarBrandLogo"/>
      </div>

      <nav className="whiteNav">
        {menu.map(m=>{ const active = tab===m.id; return <button key={m.id} title={m.label} className={active ? "whiteNavItem active" : "whiteNavItem"} onClick={()=>setTab(m.id)}>
          <span className="navIconTile"><SidebarGlyph name={m.icon} active={active}/></span>
          <b>{m.label}</b>
        </button>})}
      </nav>

      <div className="whiteSideBottom">
        <button className="whiteLogout" onClick={logout}><span className="navIconTile"><SidebarGlyph name="logout"/></span><b>Log out</b></button>
      </div>
    </aside>

    <section className="whiteMain">
      <header className="whiteTopbar">
        <button className="hamburger" onClick={toggleSidebar} aria-label="Menu">☰</button>
        <h1 className="topPageTitle">{pageTitle}</h1>
        <div className="whiteAccount">
          <span className="whiteAvatar" aria-hidden="true">AD</span>
          <div>
            <b>{accountName}</b>
            <small>{roleName}</small>
          </div>
        </div>
      </header>

      <main className="whiteContent">
        {tab==="operations" && <Operations/>}
        {tab==="dashboard" && <Dashboard setTab={setTab}/>}
        {tab==="ai" && <AIAssistant/>}
        {tab==="association" && <Association/>}
        {tab==="inventory" && <Inventory/>}
        {tab==="platform" && <Platform auth={auth}/>}
        {tab==="dashboardAdmin" && <DashboardAdmin auth={auth}/>}
      </main>
      <footer className="whiteFooter">© 2026 Smart Inventory. All rights reserved.</footer>
    </section>
  </div>
}


function Operations(){
  const {products,associations,detectedEpcs,setProducts,setAssociations,setDetectedEpcs}=useLocalStore();
  const [scanModal,setScanModal]=useState(null);
  const [barcode,setBarcode]=useState("");
  const [epc,setEpc]=useState("");
  const [selectedProduct,setSelectedProduct]=useState(null);
  const [msg,setMsg]=useState("");

  function importProducts(file){
    if(!file) return;
    Papa.parse(file,{header:true,skipEmptyLines:true,complete:(res)=>{
      const rows=res.data.map((r,i)=>({
        PID:r.PID||r.pid||String(i+1),
        Produit:r.Produit||r.produit||r.name||r.Nom||"",
        Catégorie:r["Catégorie"]||r.categorie||r.category||"",
        Zone:r.Zone||r.zone||"",
        Stock:r.Stock||r.stock||"",
        "Code barre 1":r["Code barre 1"]||r.barcode||r.codebarre||r.UPC||"",
        "Code barre 2":r["Code barre 2"]||""
      }));
      setProducts(rows);
      setMsg(`${rows.length} produits importés.`);
    }});
  }

  function importAssociations(file){
    if(!file) return;
    Papa.parse(file,{header:true,skipEmptyLines:true,complete:(res)=>{
      const rows=res.data.map((r)=>({
        PID:r.PID||r.pid||"",
        Produit:r.Produit||r.produit||"",
        "Code barre 1":r["Code barre 1"]||"",
        "Code barre 2":r["Code barre 2"]||"",
        EPC:norm(r.EPC||r.epc||r.Tag||""),
        Date:r.Date||new Date().toISOString()
      })).filter(x=>x.EPC);
      setAssociations([...associations,...rows]);
      setMsg(`${rows.length} associations RFID importées.`);
    }});
  }

  function openBarcode(){ setScanModal("barcode"); setBarcode(""); setSelectedProduct(null); setMsg(""); }
  function openEpc(){ setScanModal("epc"); setEpc(""); setMsg(""); }

  function findByBarcode(){
    const code=norm(barcode);
    const p=products.find(x=>norm(x["Code barre 1"])===code || norm(x["Code barre 2"])===code || norm(x.PID)===code);
    setSelectedProduct(p||null);
    setMsg(p ? `Produit trouvé: ${p.Produit}` : "Aucun produit trouvé.");
  }

  function associateEpc(){
    if(!selectedProduct){ setMsg("Scannez d'abord un code-barres produit."); return; }
    if(!epc.trim()){ setMsg("Saisir EPC RFID."); return; }
    const item={
      PID:selectedProduct.PID,
      Produit:selectedProduct.Produit,
      "Code barre 1":selectedProduct["Code barre 1"],
      "Code barre 2":selectedProduct["Code barre 2"],
      EPC:norm(epc),
      Date:new Date().toISOString()
    };
    setAssociations([...associations,item]);
    setMsg(`EPC associé à ${selectedProduct.Produit}.`);
    setEpc("");
  }

  function importDetectedEpc(file){
    if(!file) return;
    Papa.parse(file,{header:false,skipEmptyLines:true,complete:(res)=>{
      const rows=extractDetectedEpcs(res.data);
      setDetectedEpcs(rows);
      downloadJSON(`epc_detectes_${new Date().toISOString().slice(0,10)}.json`,{epcs:rows,date:new Date().toISOString()});
      setMsg(`${rows.length} EPC détectés importés et enregistrés pour comparer le stock.`);
    }});
  }

  function clearAssociations(){
    if(confirm("Supprimer toutes les associations RFID locales ?")){
      setAssociations([]);
      setMsg("Toutes les associations RFID ont été supprimées.");
    }
  }

  function exportProducts(){ exportCSV("produits_locaux.csv",products,Object.keys(products[0]||{})); }
  function exportAssociations(){ exportCSV("associations_rfid.csv",associations,Object.keys(associations[0]||{})); }
  function exportProductsWithoutRfid(){
    const associatedPids=new Set(associations.map(a=>String(a.PID)));
    const rows=products.filter(p=>!associatedPids.has(String(p.PID))).map(p=>({...p,"Statut RFID":"Non associé"}));
    exportCSV("produits_sans_rfid.csv",rows,["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","Statut RFID"]);
  }
  function exportCoverageReport(){
    const associatedPids=new Set(associations.map(a=>String(a.PID)));
    const productsWithRfid=products.filter(p=>associatedPids.has(String(p.PID))).length;
    const productsWithoutRfid=Math.max(products.length-productsWithRfid,0);
    const coverage=products.length ? Math.round((productsWithRfid/products.length)*100) : 0;
    const rows=[{"Produits locaux":products.length,"Produits avec RFID":productsWithRfid,"Produits sans RFID":productsWithoutRfid,"Associations RFID":associations.length,"Couverture RFID":coverage+"%","Date rapport":new Date().toISOString()}];
    exportCSV("rapport_couverture_rfid.csv",rows,Object.keys(rows[0]));
  }
  function backupProject(){
    downloadJSON(`pharmainventory_backup_${new Date().toISOString().slice(0,10)}.json`,{products,associations,detectedEpcs,backup_date:new Date().toISOString()});
  }
  async function restoreProject(file){
    if(!file) return;
    try{
      const data=await readJSONFile(file);
      if(Array.isArray(data.products)) setProducts(data.products);
      if(Array.isArray(data.associations)) setAssociations(data.associations);
      if(Array.isArray(data.detectedEpcs)) setDetectedEpcs(data.detectedEpcs);
      setMsg("Projet restauré.");
    }catch(e){ alert("Fichier JSON invalide"); }
  }

  return <section className="operationsPage">
    <h1>Operations</h1>
    <p>Import, scan, associations, EPC détectés, exports et sauvegardes locales.</p>

    <div className="operationsActionPanel">
      <h2>Actions RFID</h2>
      <p className="notice">Lancez les opérations principales de gestion RFID.</p>
      <div className="operationGrid workflowGrid">
      <label className="operationCard white fileCardOp">
        <div className="opIcon"><DashIcon name="upload"/></div><h3>Importer CSV pharmacie</h3><p>Importer le catalogue produits.</p><span>Choisir CSV</span>
        <input type="file" accept=".csv" onChange={e=>importProducts(e.target.files[0])}/>
      </label>

      <label className="operationCard white fileCardOp">
        <div className="opIcon"><DashIcon name="link"/></div><h3>Importer associations RFID</h3><p>Importer les associations Produit ↔ EPC.</p><span>Choisir CSV</span>
        <input type="file" accept=".csv" onChange={e=>importAssociations(e.target.files[0])}/>
      </label>

      <button className="operationCard blue" onClick={openBarcode}>
        <div className="opIcon"><DashIcon name="barcode"/></div><h3>Scanner code-barres produit</h3><p>Ouvrir une fenêtre pour saisir le code-barres.</p><span>Scanner</span>
      </button>

      <button className="operationCard green" onClick={openEpc}>
        <div className="opIcon"><DashIcon name="rfid"/></div><h3>Scanner EPC RFID</h3><p>Ouvrir une fenêtre pour saisir le tag EPC.</p><span>Scanner</span>
      </button>

      <label className="operationCard white fileCardOp">
        <div className="opIcon"><DashIcon name="barcode"/></div><h3>Importer EPC détectés</h3><p>Importer un CSV/TXT EPC détectés.</p><span>Choisir fichier</span>
        <input type="file" accept=".csv,.txt" onChange={e=>importDetectedEpc(e.target.files[0])}/>
      </label>

      <button className="operationCard dangerOp" onClick={clearAssociations}>
        <div className="opIcon"><DashIcon name="trash"/></div><h3>Vider toutes associations</h3><p>Supprimer toutes les associations RFID locales.</p><span>Vider</span>
      </button>
    </div>
    </div>

    <div className="exportsPanel">
      <h2>Exports et sauvegardes locales</h2>
      <p className="notice">Exportez vos tableaux, rapports RFID et sauvegardes locales.</p>
      <div className="exportOperationGrid">
        <button className="exportOperationCard" onClick={exportProducts}><div className="opIcon"><DashIcon name="box"/></div><h3>Produits locaux</h3><p>Exporter le catalogue importé complet.</p><span>Exporter</span></button>
        <button className="exportOperationCard" onClick={exportAssociations}><div className="opIcon"><DashIcon name="link"/></div><h3>Associations RFID</h3><p>Exporter les produits liés aux EPC RFID.</p><span>Exporter</span></button>
        <button className="exportOperationCard" onClick={exportProductsWithoutRfid}><div className="opIcon"><DashIcon name="tag"/></div><h3>Produits sans RFID</h3><p>Exporter les articles à associer.</p><span>Exporter</span></button>
        <button className="exportOperationCard blue" onClick={exportCoverageReport}><div className="opIcon"><DashIcon name="chart"/></div><h3>Couverture RFID</h3><p>Exporter les KPI de couverture.</p><span>Exporter</span></button>
        <button className="exportOperationCard green" onClick={backupProject}><div className="opIcon"><DashIcon name="save"/></div><h3>Sauvegarde projet</h3><p>Créer un backup JSON complet.</p><span>Backup</span></button>
        <label className="exportOperationCard fileCard"><div className="opIcon"><DashIcon name="restore"/></div><h3>Restaurer projet</h3><p>Importer un backup JSON local.</p><span>Choisir fichier</span><input type="file" accept=".json" onChange={e=>restoreProject(e.target.files[0])}/></label>
      </div>
    </div>

    {msg && <p className="success opMessage">{msg}</p>}

    {scanModal && <div className="modalOverlay">
      <div className="scanModal">
        <button className="modalClose" onClick={()=>setScanModal(null)}>×</button>
        {scanModal==="barcode" && <>
          <h2>Scanner code-barres produit</h2>
          <p>Saisissez ou scannez le code-barres du produit.</p>
          <input autoFocus value={barcode} onChange={e=>setBarcode(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")findByBarcode()}} placeholder="Code-barres ou PID"/>
          <button className="primaryBtn" onClick={findByBarcode}>Rechercher produit</button>
          {selectedProduct && <div className="foundProduct"><b>{selectedProduct.Produit}</b><small>PID: {selectedProduct.PID}</small></div>}
        </>}

        {scanModal==="epc" && <>
          <h2>Scanner EPC RFID</h2>
          <p>Saisissez ou scannez l’EPC RFID à associer au produit sélectionné.</p>
          {selectedProduct ? <div className="foundProduct"><b>{selectedProduct.Produit}</b><small>PID: {selectedProduct.PID}</small></div> : <p className="err">Aucun produit sélectionné. Scannez d’abord le code-barres.</p>}
          <input autoFocus value={epc} onChange={e=>setEpc(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")associateEpc()}} placeholder="EPC RFID"/>
          <button className="primaryBtn" onClick={associateEpc}>Associer EPC</button>
        </>}
      </div>
    </div>}

    <div className="pageFooterLikeDashboard">© 2026 Smart Inventory. Tous droits réservés.</div>
  </section>
}


function Login({setToken}){
  const [u,setU]=useState("demo");
  const [p,setP]=useState("demo123");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  async function login(e){
    e.preventDefault();
    setErr("");
    setLoading(true);
    const form=new URLSearchParams();
    form.append("username",u);
    form.append("password",p);
    try{
      const r=await axios.post(`${API}/auth/login`,form,{
        headers:{"Content-Type":"application/x-www-form-urlencoded"}
      });
      localStorage.token=r.data.access_token;
      setToken(r.data.access_token);
    }catch(e){
      if(!e.response){
        setErr(`API backend inaccessible. Vérifiez VITE_API_URL: ${API}`);
      }else if(e.response.status===402){
        setErr("Abonnement expiré");
      }else if(e.response.status===401){
        setErr("Connexion échouée. Essayez demo/demo123 ou admin/admin123 après redéploiement du backend.");
      }else{
        setErr(e.response?.data?.detail || "Erreur serveur pendant la connexion.");
      }
    }
    setLoading(false);
  }

  return <div className="login pharmaLogin">
    <form onSubmit={login} className="loginCard">
      <SmartInventoryLogo className="loginCodeLogo"/>

      <label>Utilisateur</label>
      <input value={u} onChange={e=>setU(e.target.value)} placeholder="Utilisateur"/>

      <label>Mot de passe</label>
      <input value={p} onChange={e=>setP(e.target.value)} placeholder="Mot de passe" type="password"/>

      <button type="submit" className="primaryLoginBtn" disabled={loading}>{loading ? "Connexion..." : "Connexion"}</button>

      {err && <p className="err">{err}</p>}

      <div className="loginHelp">
        <small>Compte démo : demo / demo123</small><br/>
        <small>Compte admin : admin / admin123</small>
      </div>
    </form>
  </div>
}


function findProduct(products,value){
  const v=String(value||"").trim();
  return products.find(p => 
    String(p.PID||"").trim()===v ||
    String(p["Code barre 1"]||"").trim()===v ||
    String(p["Code barre 2"]||"").trim()===v
  );
}



function AIAssistant(){
  const {products,associations,detectedEpcs}=useLocalStore();
  const [messages,setMessages]=useState(()=>[
    {role:"assistant",content:"Bonjour, je suis votre agent RFID. Je peux lister les produits manquants, filtrer par zone/catégorie/nom, générer un plan d’action, créer un rapport CSV/PDF, détecter les doublons EPC et expliquer pourquoi un produit est Présent, Manquant ou Non associé."}
  ]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const messagesEndRef=useRef(null);

  const agentData=useMemo(()=>{
    const associatedByPid = new Map();
    const epcToAssociations = new Map();
    associations.forEach(a=>{
      const pid=String(a.PID||"");
      const epc=norm(a.EPC);
      if(!pid || !epc) return;
      if(!associatedByPid.has(pid)) associatedByPid.set(pid,[]);
      associatedByPid.get(pid).push(epc);
      if(!epcToAssociations.has(epc)) epcToAssociations.set(epc,[]);
      epcToAssociations.get(epc).push(a);
    });
    const detectedSet = new Set((detectedEpcs||[]).map(norm).filter(Boolean));
    const rows=products.map(p=>{
      const pid=String(p.PID||"");
      const epcs=associatedByPid.get(pid) || [];
      const detectedForProduct=epcs.filter(epc=>detectedSet.has(epc));
      const status=epcs.length===0 ? "Non associé" : detectedForProduct.length ? "Présent" : "Manquant";
      return {
        PID:p.PID || "",
        Produit:p.Produit || p.produit || p.name || p.Nom || "",
        Catégorie:p["Catégorie"] || p.Catégorie || p.categorie || p.category || "",
        Zone:p.Zone || p.zone || "",
        Stock:p.Stock || p.stock || "",
        "Code barre 1":p["Code barre 1"] || p.barcode || p.UPC || "",
        "Code barre 2":p["Code barre 2"] || "",
        "EPC associé":epcs.join(", "),
        "EPC détecté":detectedForProduct.join(", "),
        "Statut RFID":status,
        _epcs:epcs,
        _detectedForProduct:detectedForProduct
      };
    });
    const duplicateEpcs=[...epcToAssociations.entries()]
      .filter(([epc,items])=>epc && items.length>1)
      .map(([epc,items])=>({epc,items}));
    return {rows,detectedSet,duplicateEpcs};
  },[products,associations,detectedEpcs]);

  const rows=agentData.rows;
  const presentRows=rows.filter(r=>r["Statut RFID"]==="Présent");
  const missingRows=rows.filter(r=>r["Statut RFID"]==="Manquant");
  const noAssociationRows=rows.filter(r=>r["Statut RFID"]==="Non associé");
  const productsWithRfid=rows.filter(r=>r._epcs.length>0).length;
  const productsWithoutRfid=noAssociationRows.length;
  const presentCount=presentRows.length;
  const missingCount=missingRows.length;
  const noAssociationCount=noAssociationRows.length;
  const coverage=products.length ? Math.round((productsWithRfid/products.length)*100) : 0;
  const stockAccuracy=products.length ? Math.round((presentCount/products.length)*100) : 0;

  useEffect(()=>{ messagesEndRef.current?.scrollIntoView({behavior:"smooth",block:"end"}); },[messages,loading]);

  function extractLimit(q){
    const n=String(q).match(/\b(\d{1,4})\b/);
    return Math.max(1, Math.min(n ? Number(n[1]) : 20, 200));
  }

  function rowLine(r,i){
    return `${i+1}. PID ${r.PID || "-"} — ${r.Produit || "Sans nom"} | Zone: ${r.Zone || "-"} | Catégorie: ${r.Catégorie || "-"} | Statut: ${r["Statut RFID"]} | EPC: ${r["EPC associé"] || "-"}`;
  }

  function filterRows(baseRows,q){
    const text=cleanSearchText(q);
    let filtered=[...baseRows];
    const applied=[];
    const uniqueZones=[...new Set(rows.map(r=>r.Zone).filter(Boolean))].sort((a,b)=>String(b).length-String(a).length);
    const uniqueCategories=[...new Set(rows.map(r=>r.Catégorie).filter(Boolean))].sort((a,b)=>String(b).length-String(a).length);
    const zoneFound=uniqueZones.find(z=>cleanSearchText(z).length>=2 && text.includes(cleanSearchText(z)));
    const catFound=uniqueCategories.find(c=>cleanSearchText(c).length>=2 && text.includes(cleanSearchText(c)));
    if(zoneFound){
      filtered=filtered.filter(r=>cleanSearchText(r.Zone).includes(cleanSearchText(zoneFound)));
      applied.push(`zone: ${zoneFound}`);
    }
    if(catFound){
      filtered=filtered.filter(r=>cleanSearchText(r.Catégorie).includes(cleanSearchText(catFound)));
      applied.push(`catégorie: ${catFound}`);
    }

    const explicitName=String(q).match(/(?:nom|produit|chercher|recherche)\s*[:=]?\s*([\wÀ-ÿ0-9\- ]{3,50})/i);
    if(explicitName){
      const name=cleanSearchText(explicitName[1]).replace(/\b(est|manquant|present|présent|absent|non|associe|associé|dans|zone|categorie|catégorie)\b.*$/i, "").trim();
      if(name.length>=3){
        filtered=filtered.filter(r=>cleanSearchText(`${r.Produit} ${r.PID} ${r["Code barre 1"]} ${r["Code barre 2"]}`).includes(name));
        applied.push(`nom: ${explicitName[1].trim()}`);
      }
    }
    return {filtered,applied};
  }

  function chooseRowsByIntent(q){
    const text=cleanSearchText(q);
    if(/non\s*assoc|sans\s*(epc|tag|association)/i.test(text)) return {base:noAssociationRows,label:"produits non associés"};
    if(/present|présent|detecte|détecté/i.test(text)) return {base:presentRows,label:"produits présents"};
    if(/manquant|absent|missing/i.test(text)) return {base:missingRows,label:"produits manquants"};
    return {base:rows,label:"produits"};
  }

  function findProductInQuestion(q){
    const text=cleanSearchText(q);
    let found=rows.find(r=>r.PID && text.includes(cleanSearchText(r.PID)));
    if(found) return found;
    const stop=new Set(["pourquoi","produit","est","manquant","present","présent","associe","associé","statut","explique","donne","moi","avec","dans","zone","categorie","catégorie"]);
    const tokens=text.split(/[^a-z0-9]+/).filter(t=>t.length>=4 && !stop.has(t));
    return rows.find(r=>tokens.some(t=>cleanSearchText(`${r.Produit} ${r["Code barre 1"]} ${r["Code barre 2"]}`).includes(t)));
  }

  function explainProduct(r){
    if(!r) return "Je n’ai pas trouvé le produit demandé. Indiquez le PID, le code-barres ou une partie du nom du produit.";
    if(r["Statut RFID"]==="Présent"){
      return `Produit trouvé : ${r.Produit || "Sans nom"} (PID ${r.PID || "-"}).\nStatut : Présent.\nRaison : ce produit possède au moins un EPC associé (${r["EPC associé"]}) et au moins un de ces EPC est présent dans le CSV des EPC détectés (${r["EPC détecté"]}).`;
    }
    if(r["Statut RFID"]==="Manquant"){
      return `Produit trouvé : ${r.Produit || "Sans nom"} (PID ${r.PID || "-"}).\nStatut : Manquant.\nRaison : ce produit possède un EPC associé (${r["EPC associé"]}), mais aucun de ses EPC n’existe dans le dernier CSV des EPC détectés. Il est donc attendu dans le stock, mais non lu par le lecteur RFID.`;
    }
    return `Produit trouvé : ${r.Produit || "Sans nom"} (PID ${r.PID || "-"}).\nStatut : Non associé.\nRaison : aucun EPC n’est lié à ce produit dans le tableau des associations. Il faut d’abord associer un tag EPC au produit avant de pouvoir savoir s’il est présent ou manquant.`;
  }

  function buildActionPlan(){
    const steps=[];
    if((detectedEpcs||[]).length===0) steps.push("1. Importer le dernier CSV des EPC détectés pour calculer le stock réel.");
    if(missingCount>0) steps.push(`${steps.length+1}. Traiter les produits manquants : vérifier physiquement les rayons et refaire un scan RFID ciblé.`);
    if(noAssociationCount>0) steps.push(`${steps.length+1}. Associer les produits non associés à un EPC avant le prochain inventaire.`);
    if(agentData.duplicateEpcs.length>0) steps.push(`${steps.length+1}. Corriger les doublons EPC : un même EPC ne doit pas être lié à plusieurs produits.`);
    steps.push(`${steps.length+1}. Exporter un rapport CSV/PDF après correction pour garder une preuve d’inventaire.`);
    return `Plan d’action recommandé :\n${steps.join("\n")}\n\nRésumé actuel : ${products.length} produits, ${presentCount} présents, ${missingCount} manquants, ${noAssociationCount} non associés, ${agentData.duplicateEpcs.length} doublon(s) EPC.`;
  }

  function duplicateReport(){
    if(agentData.duplicateEpcs.length===0) return "Aucun doublon EPC détecté dans le tableau des associations.";
    const lines=agentData.duplicateEpcs.slice(0,30).map((d,i)=>{
      const linked=d.items.map(a=>`PID ${a.PID || "-"} ${a.Produit || ""}`.trim()).join(" | ");
      return `${i+1}. EPC ${d.epc} utilisé ${d.items.length} fois : ${linked}`;
    });
    return `Doublons EPC détectés : ${agentData.duplicateEpcs.length}\n${lines.join("\n")}${agentData.duplicateEpcs.length>30 ? "\n... liste limitée aux 30 premiers doublons." : ""}`;
  }

  function exportRowsToCSV(q){
    const intent=chooseRowsByIntent(q);
    const {filtered,applied}=filterRows(intent.base,q);
    const cols=["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","EPC associé","EPC détecté","Statut RFID"];
    const suffix=intent.label.replaceAll(" ","_").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    exportCSV(`rapport_${suffix}.csv`,filtered,cols);
    return `CSV généré : ${filtered.length} ${intent.label}${applied.length ? ` (${applied.join(", ")})` : ""}.`;
  }

  function exportRowsToPDF(q){
    const intent=chooseRowsByIntent(q);
    const {filtered,applied}=filterRows(intent.base,q);
    const title=`Smart Inventory - Rapport ${intent.label}`;
    const lines=[
      `Date: ${new Date().toLocaleString("fr-CA")}`,
      `Produits: ${products.length}`,
      `Presents: ${presentCount}`,
      `Manquants: ${missingCount}`,
      `Non associes: ${noAssociationCount}`,
      `EPC detectes importes: ${(detectedEpcs||[]).length}`,
      `Filtres: ${applied.length ? applied.join(", ") : "aucun"}`,
      "",
      ...filtered.slice(0,30).map(rowLine)
    ];
    downloadTextPDF(`rapport_${intent.label.replaceAll(" ","_")}.pdf`,title,lines);
    return `PDF généré : résumé + ${Math.min(filtered.length,30)} ligne(s) listée(s). Pour une liste complète, demandez aussi un rapport CSV.`;
  }

  function buildLocalResponse(q){
    const text=cleanSearchText(q);
    if(/\b(pdf)\b/.test(text)) return exportRowsToPDF(q);
    if(/\b(csv)\b|export/.test(text)) return exportRowsToCSV(q);
    if(/doublon|duplicate|meme epc|même epc/.test(text)) return duplicateReport();
    if(/plan|action|priorite|priorité|semaine/.test(text)) return buildActionPlan();
    if(/pourquoi|explique|raison/.test(text)) return explainProduct(findProductInQuestion(q));

    const intent=chooseRowsByIntent(q);
    const {filtered,applied}=filterRows(intent.base,q);
    if(/montre|affiche|liste|donne|chercher|recherche|filtre|filtrer|absent|manquant|present|présent|non\s*assoc/.test(text)){
      const limit=extractLimit(q);
      const lines=filtered.slice(0,limit).map(rowLine);
      if(!lines.length) return `Aucun résultat trouvé pour ${intent.label}${applied.length ? ` avec ${applied.join(", ")}` : ""}.`;
      return `${filtered.length} ${intent.label} trouvé(s)${applied.length ? ` avec filtre ${applied.join(", ")}` : ""}.\n\n${lines.join("\n")}${filtered.length>limit ? `\n\nListe limitée aux ${limit} premiers résultats. Demandez un CSV pour exporter toute la liste.` : ""}`;
    }

    return `Résumé RFID actuel :\n• Produits : ${products.length}\n• Présents : ${presentCount}\n• Manquants : ${missingCount}\n• Non associés : ${noAssociationCount}\n• Couverture RFID : ${coverage}%\n• Présence réelle selon EPC détectés : ${stockAccuracy}%\n• Doublons EPC : ${agentData.duplicateEpcs.length}\n\nJe peux aussi répondre à : “montre-moi les 20 produits absents”, “filtre les manquants par zone”, “crée un rapport CSV”, “crée un rapport PDF”, “détecte les doublons EPC”, ou “explique pourquoi PID X est manquant”.`;
  }

  async function sendMessage(text){
    const q=String(text || input || "").trim();
    if(!q || loading) return;
    setInput("");
    setMessages(prev=>[...prev,{role:"user",content:q}]);
    setLoading(true);
    window.setTimeout(()=>{
      try{
        const answer=buildLocalResponse(q);
        setMessages(prev=>[...prev,{role:"assistant",content:answer}]);
      }catch(e){
        setMessages(prev=>[...prev,{role:"assistant",content:"Erreur pendant l’analyse locale. Vérifiez que les fichiers produits, associations et EPC détectés sont bien importés."}]);
      }
      setLoading(false);
    },180);
  }

  const quickQuestions=[
    "Montre-moi les 20 produits absents",
    "Filtrer les manquants par zone",
    "Génère un plan d’action",
    "Détecte les doublons EPC",
    "Créer rapport CSV des manquants",
    "Créer rapport PDF résumé"
  ];

  return <section className="aiChatPage">
    <div className="aiChatTop">
      <div>
        <span className="aiChatBadge">Agent local gratuit</span>
        <h2>Chat inventaire RFID</h2>
        <p>L’agent analyse le catalogue, les associations et le CSV des EPC détectés. Il peut lister, filtrer, expliquer et exporter les données.</p>
      </div>
      <div className="aiChatScore">
        <b>{stockAccuracy}%</b>
        <span>présence réelle</span>
      </div>
    </div>

    <div className="aiChatLayout">
      <div className="aiChatPanel">
        <div className="aiMessages">
          {messages.map((m,i)=><div key={i} className={m.role==="user" ? "aiBubble user" : "aiBubble assistant"}>
            <span>{m.role==="user" ? "Vous" : "Agent RFID"}</span>
            <p>{m.content}</p>
          </div>)}
          {loading && <div className="aiBubble assistant typing"><span>Agent RFID</span><p>Analyse en cours...</p></div>}
          <div ref={messagesEndRef}/>
        </div>

        <div className="aiQuickChips">
          {quickQuestions.map(q=><button type="button" key={q} onClick={()=>sendMessage(q)} disabled={loading}>{q}</button>)}
        </div>

        <div className="aiComposer">
          <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter" && !e.shiftKey){e.preventDefault();sendMessage();}}} placeholder="Exemple : montre-moi les 20 produits absents en zone A..."/>
          <button type="button" onClick={()=>sendMessage()} disabled={loading || !input.trim()}>{loading ? "..." : "Envoyer"}</button>
        </div>
      </div>

      <aside className="aiContextPanel">
        <h3>Contexte actuel</h3>
        <div className="aiContextStat"><span>Produits</span><b>{products.length}</b></div>
        <div className="aiContextStat"><span>Associations EPC</span><b>{associations.length}</b></div>
        <div className="aiContextStat"><span>EPC détectés importés</span><b>{(detectedEpcs||[]).length}</b></div>
        <div className="aiContextStat"><span>Présents</span><b>{presentCount}</b></div>
        <div className="aiContextStat"><span>Manquants</span><b>{missingCount}</b></div>
        <div className="aiContextStat"><span>Non associés</span><b>{noAssociationCount}</b></div>
        <div className="aiContextStat"><span>Doublons EPC</span><b>{agentData.duplicateEpcs.length}</b></div>
        <div className="aiSideActions">
          <button type="button" onClick={()=>sendMessage("Créer rapport CSV des manquants")}>CSV manquants</button>
          <button type="button" onClick={()=>sendMessage("Créer rapport PDF résumé")}>PDF résumé</button>
          <button type="button" onClick={()=>sendMessage("Détecte les doublons EPC")}>Doublons EPC</button>
        </div>
      </aside>
    </div>

    <div className="pageFooterLikeDashboard">© 2026 Smart Inventory. Tous droits réservés.</div>
  </section>
}


function Association(){
  const {associations}=useLocalStore();
  const [q,setQ]=useState("");

  const rows = associations.filter(a=>{
    const s = `${a.PID||""} ${a.Produit||""} ${a.EPC||""} ${a["Code barre 1"]||""} ${a["Code barre 2"]||""}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });

  return <section className="tableOnlyPage">
    <p className="notice">Tableau de consultation des associations Produit ↔ EPC RFID enregistrées localement.</p>

    <div className="tableToolbar">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher dans les associations..."/>
      <span>{rows.length} association(s)</span>
    </div>

    <Table rows={rows} cols={["PID","Produit","Code barre 1","Code barre 2","EPC","Date"]}/>
  </section>
}





function Inventory(){
  const {products,associations,detectedEpcs}=useLocalStore();
  const [q,setQ]=useState("");
  const [statusFilter,setStatusFilter]=useState("all");

  const associatedByPid = new Map();
  associations.forEach(a=>{
    const pid=String(a.PID||"");
    const epc=norm(a.EPC);
    if(!pid || !epc) return;
    if(!associatedByPid.has(pid)) associatedByPid.set(pid,[]);
    associatedByPid.get(pid).push(epc);
  });
  const detectedSet = new Set((detectedEpcs||[]).map(norm).filter(Boolean));

  // Statut réel = Catalogue produits + Associations Produit/EPC + CSV des EPC détectés.
  // Les associations seules ne rendent plus un produit "Présent".
  function getStatus(p){
    const epcs=associatedByPid.get(String(p.PID)) || [];
    if(epcs.length===0) return "Non associé";
    return epcs.some(epc=>detectedSet.has(epc)) ? "Présent" : "Manquant";
  }

  const rows = products.map(p=>{
    const epcs=associatedByPid.get(String(p.PID)) || [];
    const status=getStatus(p);
    return {
      PID:p.PID,
      Produit:p.Produit,
      Catégorie:p["Catégorie"] || p.Catégorie || "",
      Zone:p.Zone || "",
      Stock:p.Stock || "",
      "Code barre 1":p["Code barre 1"] || "",
      "Code barre 2":p["Code barre 2"] || "",
      "EPC associé":epcs.join(", "),
      "Statut RFID": status,
      _rowClass: status==="Présent" ? "rowPresent" : status==="Manquant" ? "rowMissing" : "rowUnassociated"
    };
  }).filter(r=>{
    const s = Object.values(r).join(" ").toLowerCase();
    const matchText = s.includes(q.toLowerCase());
    const matchStatus = statusFilter==="all" || r["Statut RFID"]===statusFilter;
    return matchText && matchStatus;
  });

  const total=products.length;
  const presentCount=products.filter(p=>getStatus(p)==="Présent").length;
  const missingCount=products.filter(p=>getStatus(p)==="Manquant").length;
  const unassociatedCount=products.filter(p=>getStatus(p)==="Non associé").length;

  return <section className="tableOnlyPage inventoryStatusPage">
    <p className="notice">Stock calculé avec le catalogue produits + les associations Produit/EPC + le dernier CSV des EPC détectés importé.</p>

    <div className="statusSummaryGrid">
      <div className="statusSummary present"><b>{presentCount}</b><span>Présents</span></div>
      <div className="statusSummary missing"><b>{missingCount}</b><span>Manquants</span></div>
      <div className="statusSummary unassociated"><b>{unassociatedCount}</b><span>Non associés</span></div>
      <div className="statusSummary total"><b>{total}</b><span>Total</span></div>
    </div>

    <div className="tableToolbar inventoryToolbar">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher dans l’inventaire..."/>
      <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
        <option value="all">Tous les statuts</option>
        <option value="Présent">Présent</option>
        <option value="Manquant">Manquant</option>
        <option value="Non associé">Non associé</option>
      </select>
      <span>{rows.length} produit(s) · {detectedSet.size} EPC détecté(s)</span>
    </div>

    <div className="smartTableWrap">
      <table className="smartTable statusTable">
        <thead>
          <tr>{["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","EPC associé","Statut RFID"].map(c=><th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r,i)=><tr key={i} className={r._rowClass}>
            <td>{r.PID}</td>
            <td>{r.Produit}</td>
            <td>{r.Catégorie}</td>
            <td>{r.Zone}</td>
            <td>{r.Stock}</td>
            <td>{r["Code barre 1"]}</td>
            <td>{r["Code barre 2"]}</td>
            <td>{r["EPC associé"]}</td>
            <td><span className={`statusBadge ${r._rowClass}`}>{r["Statut RFID"]}</span></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>
}



function LocalData(){
  const {products,setProducts,associations,setAssociations,detectedEpcs,setDetectedEpcs}=useLocalStore();
  const [msg,setMsg]=useState("");

  function saveProject(){
    const backup={
      app:"Smart Inventory",
      version:"V22",
      backup_date:new Date().toISOString(),
      products,
      associations,
      detectedEpcs,
      settings:{storage:"local-browser",cloud_business_data:false}
    };
    downloadJSON(`pharmainventory_backup_${new Date().toISOString().slice(0,10)}.json`, backup);
    setMsg("Sauvegarde projet JSON créée.");
  }

  async function restoreProject(file){
    if(!file) return;
    try{
      const data=await readJSONFile(file);
      if(!Array.isArray(data.products) || !Array.isArray(data.associations)){
        setMsg("Fichier invalide: produits/associations manquants.");
        return;
      }
      setProducts(data.products);
      setAssociations(data.associations);
      if(Array.isArray(data.detectedEpcs)) setDetectedEpcs(data.detectedEpcs);
      setMsg(`Projet restauré: ${data.products.length} produits, ${data.associations.length} associations, ${Array.isArray(data.detectedEpcs) ? data.detectedEpcs.length : 0} EPC détectés.`);
    }catch(e){
      setMsg("Erreur lecture JSON: fichier invalide.");
    }
  }

  function exportProducts(){
    exportCSV("produits_locaux.csv",products,Object.keys(products[0]||{}));
  }

  function exportAssociations(){
    exportCSV("associations_rfid.csv",associations,Object.keys(associations[0]||{}));
  }

  function exportProductsWithoutRfid(){
    const associatedPids=new Set(associations.map(a=>String(a.PID)));
    const rows=products.filter(p=>!associatedPids.has(String(p.PID))).map(p=>({...p,"Statut RFID":"Sans RFID"}));
    const cols=["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","Statut RFID"];
    exportCSV("produits_sans_rfid.csv",rows,cols);
  }

  function exportCoverageReport(){
    const associatedPids=new Set(associations.map(a=>String(a.PID)));
    const productsWithRfid=products.filter(p=>associatedPids.has(String(p.PID))).length;
    const productsWithoutRfid=Math.max(products.length-productsWithRfid,0);
    const coverage=products.length ? Math.round((productsWithRfid/products.length)*100) : 0;
    const rows=[{
      "Produits locaux":products.length,
      "Produits avec RFID":productsWithRfid,
      "Produits sans RFID":productsWithoutRfid,
      "Associations RFID":associations.length,
      "EPC détectés importés":detectedEpcCount,
      "Couverture RFID":coverage+"%",
      "Date rapport":new Date().toISOString()
    }];
    exportCSV("rapport_couverture_rfid.csv",rows,Object.keys(rows[0]));
  }

  function exportDuplicateEpcReport(){
    const counts={};
    associations.forEach(a=>{const e=norm(a.EPC); if(e) counts[e]=(counts[e]||0)+1;});
    const rows=associations.filter(a=>counts[norm(a.EPC)]>1).map(a=>({...a,"Anomalie":"Doublon EPC"}));
    const cols=["PID","Produit","Code barre 1","Code barre 2","EPC","Date","Anomalie"];
    exportCSV("rapport_doublons_epc.csv",rows,cols);
  }

  function exportFullAudit(){
    const associatedPids=new Set(associations.map(a=>String(a.PID)));
    const rows=products.map(p=>{
      const linked=associations.filter(a=>String(a.PID)===String(p.PID)).map(a=>a.EPC).join(", ");
      return {...p,"EPC associés":linked,"Statut RFID":linked?"Associé":"Sans RFID"};
    });
    const cols=["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","EPC associés","Statut RFID"];
    exportCSV("audit_complet_pharmainventory.csv",rows,cols);
  }

  return <section>
    
    <p className="notice">Exportez vos tableaux, rapports RFID et sauvegardes locales.</p>

    <div className="statsGrid">
      <div className="statCard"><span>Produits</span><b>{products.length}</b><small>catalogue local</small></div>
      <div className="statCard"><span>Associations RFID</span><b>{associations.length}</b><small>EPC liés</small></div>
      
    </div>

    <div className="reportCards exportGrid">
      <div className="reportCard"><span>📦</span><div><b>Produits locaux</b><small>Catalogue importé complet</small></div><button onClick={exportProducts}>Exporter</button></div>
      <div className="reportCard"><span>🔗</span><div><b>Associations RFID</b><small>PID, produits et EPC liés</small></div><button onClick={exportAssociations}>Exporter</button></div>
      <div className="reportCard"><span>🏷️</span><div><b>Produits sans RFID</b><small>Articles à associer</small></div><button onClick={exportProductsWithoutRfid}>Exporter</button></div>
      <div className="reportCard"><span>📊</span><div><b>Couverture RFID</b><small>KPI de couverture</small></div><button onClick={exportCoverageReport}>Exporter</button></div>
      <div className="reportCard"><span>🔁</span><div><b>Doublons EPC</b><small>Anomalies EPC répétées</small></div><button onClick={exportDuplicateEpcReport}>Exporter</button></div>
      <div className="reportCard"><span>✅</span><div><b>Audit complet</b><small>Produits + statut RFID</small></div><button onClick={exportFullAudit}>Exporter</button></div>
      <div className="reportCard"><span>💾</span><div><b>Sauvegarder projet</b><small>Backup JSON complet</small></div><button onClick={saveProject}>Backup</button></div>
      <div className="reportCard"><span>📥</span><div><b>Restaurer projet</b><small>Importer un backup JSON</small></div><input type="file" accept=".json" onChange={e=>restoreProject(e.target.files[0])}/></div>
    </div>

    <div className="card danger">
      <h3>Zone danger</h3>
      <button onClick={()=>{ if(confirm("Vider produits et associations locales ?")){setProducts([]);setAssociations([]);setMsg("Données locales vidées.");} }}>Tout vider</button>
    </div>

    <p className="success">{msg}</p>
  </section>
}


function Platform({auth}){
  const [clients,setClients]=useState([]);
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [pharmacy,setPharmacy]=useState("");
  const [days,setDays]=useState(30);
  const [aiPremium,setAiPremium]=useState(false);
  const [msg,setMsg]=useState("");

  async function load(){
    try{
      const r = await axios.get(`${API}/platform/clients`,auth);
      setClients(r.data);
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur chargement clients");
    }
  }
  useEffect(()=>{ load(); },[]);

  async function create(){
    try{
      await axios.post(`${API}/platform/create-client`,{username,password,pharmacy_name:pharmacy,days:Number(days),ai_premium:aiPremium},auth);
      setUsername(""); setPassword(""); setPharmacy(""); setDays(30); setAiPremium(false);
      setMsg("Client créé.");
      await load();
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur création client");
    }
  }

  async function setClientActive(u, active){
    try{
      await axios.post(`${API}/platform/client-set-active/${encodeURIComponent(u)}?active=${active}`,{},auth);
      setMsg(active ? "Client activé." : "Client désactivé.");
      await load();
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur changement statut");
    }
  }

  async function deleteClient(u){
    if(!confirm(`Supprimer définitivement le client ${u} ?`)) return;
    try{
      await axios.post(`${API}/platform/client-delete/${encodeURIComponent(u)}`,{},auth);
      setMsg("Client supprimé.");
      await load();
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur suppression client");
    }
  }

  async function changePassword(u){
    const p=prompt(`Nouveau mot de passe pour ${u}:`);
    if(!p) return;
    try{
      await axios.post(`${API}/platform/change-password/${encodeURIComponent(u)}`,{password:p},auth);
      setMsg(`Mot de passe changé pour ${u}.`);
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur changement mot de passe");
    }
  }

  async function changeExpiry(u, currentDate){
    const d=prompt(`Nouvelle date expiration pour ${u} (YYYY-MM-DD):`, currentDate || "");
    if(!d) return;
    try{
      await axios.post(`${API}/platform/client-update-expiry/${encodeURIComponent(u)}`,{expires_at:d},auth);
      setMsg(`Date expiration changée pour ${u}.`);
      await load();
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur changement date expiration");
    }
  }

  
  async function toggleAiPremium(u, enabled){
    try{
      await axios.post(`${API}/platform/client-ai-premium/${encodeURIComponent(u)}?enabled=${enabled}`,{},auth);
      setMsg(enabled ? "Premium AI activé." : "Premium AI désactivé.");
      load();
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur Premium AI");
    }
  }

return <section>
    

    <div className="card">
      <h3>Créer un client pharmacie</h3>
      <input placeholder="username" value={username} onChange={e=>setUsername(e.target.value)}/>
      <input placeholder="password" value={password} onChange={e=>setPassword(e.target.value)}/>
      <input placeholder="nom pharmacie" value={pharmacy} onChange={e=>setPharmacy(e.target.value)}/>
      <input placeholder="jours" value={days} onChange={e=>setDays(e.target.value)}/>
      <label className="checkLine"><input type="checkbox" checked={aiPremium} onChange={e=>setAiPremium(e.target.checked)}/> Premium AI Assistant</label>
      <button onClick={create}>Créer client</button>
    </div>

    <p className={msg.includes("Erreur") || msg.includes("not") ? "err" : "success"}>{msg}</p>

    <table>
      <thead>
        <tr>
          <th>Client</th>
          <th>Pharmacie</th>
          <th>Abonnement</th>
          <th>Compte</th>
          <th>Expire</th>
          <th>Mot de passe</th>
          <th>Premium AI</th>
          <th>Statut</th>
          <th>Delete</th>
        </tr>
      </thead>
      <tbody>
        {clients.map(c=>{
          const isAdmin=c.username==="admin" || c.role==="platform_admin";
          const expDate=c.expires_at ? c.expires_at.slice(0,10) : "";
          return <tr key={c.username}>
            <td>{c.username}</td>
            <td>{c.pharmacy_name}</td>
            <td>{c.subscription_status}</td>
            <td>{c.active ? "active" : "inactive"}</td>
            <td>
              {isAdmin ? "N/A" : expDate}
              {!isAdmin && <><br/><button onClick={()=>changeExpiry(c.username, expDate)}>Changer date</button></>}
            </td>
            <td><button onClick={()=>changePassword(c.username)}>Changer mot de passe</button></td>
            <td>{isAdmin ? "Oui" : <button onClick={()=>toggleAiPremium(c.username,!c.ai_premium)}>{c.ai_premium ? "AI activé" : "AI désactivé"}</button>}</td>
            <td>{isAdmin ? "" : <button onClick={()=>setClientActive(c.username,!c.active)}>{c.active ? "Désactiver" : "Activer"}</button>}</td>
            <td>{isAdmin ? "" : <button className="dangerBtn" onClick={()=>deleteClient(c.username)}>Delete</button>}</td>
          </tr>
        })}
      </tbody>
    </table>
  </section>
}





function Dashboard({setTab}){
  const {products,associations,detectedEpcs}=useLocalStore();
  const [dashboardAds,setDashboardAds]=useState([]);
  const [dashboardAdIndex,setDashboardAdIndex]=useState(0);
  const [defaultAdIndex,setDefaultAdIndex]=useState(0);
  const defaultAds=["/default-dashboard-ad.png","/default-ads/ad1.png","/default-ads/ad2.png","/default-ads/ad3.png","/default-ads/ad4.png"];

  useEffect(()=>{
    const token=localStorage.token||"";
    axios.get(`${API}/dashboard/content`,{headers:{Authorization:`Bearer ${token}`}})
      .then(r=>{
        const ads=(r.data||[])
          .filter(x=>["publicite","publicité","promo","annonce","ad"].includes((x.content_type||"").toLowerCase()))
          .filter(x=>x.active!==false && x.image_url);
        setDashboardAds(ads);
        setDashboardAdIndex(0);
      })
      .catch(()=>setDashboardAds([]));
  },[]);

  const activeDashboardAds = useMemo(()=>dashboardAds.filter(x=>x && x.image_url),[dashboardAds]);
  const currentDashboardAd = activeDashboardAds.length ? activeDashboardAds[dashboardAdIndex % activeDashboardAds.length] : null;

  useEffect(()=>{
    const total = activeDashboardAds.length || defaultAds.length;
    if(total <= 1) return;
    const timer=setInterval(()=>{
      if(activeDashboardAds.length){
        setDashboardAdIndex(i=>(i+1)%activeDashboardAds.length);
      }else{
        setDefaultAdIndex(i=>(i+1)%defaultAds.length);
      }
    },5000);
    return ()=>clearInterval(timer);
  },[activeDashboardAds.length]);

  const associatedPids=new Set(associations.map(a=>String(a.PID)));
  const productsWithRfid=products.filter(p=>associatedPids.has(String(p.PID))).length;
  const productsWithoutRfid=Math.max(products.length-productsWithRfid,0);
  const coverage=products.length ? Math.round((productsWithRfid/products.length)*100) : 0;
  const detectedEpcCount=(detectedEpcs||[]).length;

  const epcCounts={};
  associations.forEach(a=>{ const e=norm(a.EPC); if(e) epcCounts[e]=(epcCounts[e]||0)+1; });
  const duplicateEpcs=Object.values(epcCounts).filter(x=>x>1).length;
  const todayLabel=new Date().toLocaleDateString("fr-CA",{year:"numeric",month:"short",day:"2-digit"});
  const radius=70;
  const circumference=2*Math.PI*radius;
  const dash=(coverage/100)*circumference;

  function exportDashboardReport(){
    const rows=[{
      "Produits catalogués":products.length,
      "Produits tagués":productsWithRfid,
      "Produits sans tag":productsWithoutRfid,
      "Associations RFID":associations.length,
      "EPC détectés importés":detectedEpcCount,
      "Couverture RFID":coverage+"%",
      "Doublons EPC":duplicateEpcs,
      "Date rapport":new Date().toISOString()
    }];
    exportCSV("rapport_dashboard_rfid.csv",rows,Object.keys(rows[0]));
  }

  function exportProductsWithoutRfid(){
    const rows=products.filter(p=>!associatedPids.has(String(p.PID))).map(p=>({...p,"Statut RFID":"Sans tag"}));
    exportCSV("produits_sans_tag.csv",rows,["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","Statut RFID"]);
  }

  const alerts=[];
  if(productsWithoutRfid>0) alerts.push({type:"warning",icon:"warning",title:`${productsWithoutRfid} produits sans tag RFID`,text:"Aucun tag détecté pour ces produits."});
  if(duplicateEpcs>0) alerts.push({type:"danger",icon:"warning",title:`${duplicateEpcs} doublon(s) EPC détecté(s)`,text:"Vérifier les associations RFID en double."});
  if(detectedEpcCount===0) alerts.push({type:"info",icon:"rfid",title:"0 scan RFID détecté",text:"Importez le CSV des EPC détectés pour calculer le stock réel."});
  if(coverage<100) alerts.push({type:"warning",icon:"warning",title:"Aucun tag détecté pour ces produits.",text:"À taguer en priorité pour améliorer votre suivi."});
  if(alerts.length===0) alerts.push({type:"success",icon:"check",title:"Aucune alerte prioritaire",text:"Les données RFID sont stables."});

  const reports=[
    {label:"Couverture RFID",sub:"CSV",icon:"doc",action:exportDashboardReport,type:"blue"},
    {label:"Produits avec tag",sub:"CSV",icon:"tag",action:exportDashboardReport,type:"green"},
    {label:"Produits sans tag",sub:"CSV",icon:"warning",action:exportProductsWithoutRfid,type:"orange"},
    {label:"Historique scans",sub:"CSV",icon:"clock",action:()=>exportCSV("historique_scans.csv",associations,Object.keys(associations[0]||{})),type:"purple"},
  ];

  const kpis=[
    {label:"Produits enregistrés",value:products.length,sub:products.length ? "Catalogue importé" : "Aucun catalogue importé",icon:"box",tone:"blue",action:()=>setTab("operations")},
    {label:"Produits tagués",value:productsWithRfid,sub:productsWithRfid ? "Avec association RFID" : "Aucun tag détecté",icon:"tag",tone:"green",action:()=>setTab("association")},
    {label:"Transactions RFID",value:detectedEpcCount,sub:detectedEpcCount ? "EPC détectés importés" : "Aucune transaction",icon:"rfid",tone:"purple",action:()=>setTab("inventory")},
    {label:"Produits sans tag",value:productsWithoutRfid,sub:productsWithoutRfid ? "À taguer en priorité" : "Synchronisés",icon:"warning",tone:"orange",action:()=>setTab("operations")},
  ];

  const shownAds=currentDashboardAd ? activeDashboardAds : defaultAds;
  const activeAdIndex=(currentDashboardAd ? dashboardAdIndex : defaultAdIndex) % shownAds.length;
  const defaultAdSrc=defaultAds[defaultAdIndex % defaultAds.length];

  return <section className="figmaDashboard">
    <p className="figmaIntro">Suivi en temps réel de la couverture RFID et de l’activité de votre pharmacie.</p>

    <div className="figmaKpiGrid">
      {kpis.map(k=><button key={k.label} className="figmaKpiCard" onClick={k.action} type="button">
        <span className={`figmaKpiIcon ${k.tone}`}><DashIcon name={k.icon}/></span>
        <span className="figmaKpiBody">
          <b>{k.value}</b>
          <small>{k.label}</small>
          <em>{k.sub}</em>
        </span>
      </button>)}
    </div>

    <div className="figmaMiddleGrid">
      <div className="figmaPanel figmaCoveragePanel">
        <div className="figmaPanelTitle">
          <h2>Couverture RFID</h2>
        </div>

        <div className="figmaCoverageContent">
          <div className="figmaGauge" aria-label={`Couverture RFID ${coverage}%`}>
            <svg width="188" height="188" viewBox="0 0 188 188">
              <circle cx="94" cy="94" r={radius} fill="none" stroke="#eef2f7" strokeWidth="20"/>
              {coverage>0 && <circle cx="94" cy="94" r={radius} fill="none" stroke="var(--primary)" strokeWidth="20" strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" transform="rotate(-90 94 94)"/>}
            </svg>
            <b>{coverage}%</b>
          </div>

          <div className="figmaCoverageText">
            <h3>{coverage>=80 ? "Votre pharmacie est bien équipée." : coverage>=50 ? "Votre couverture RFID progresse." : "Votre couverture RFID doit être améliorée."}</h3>
            <p>Vous avez étiqueté {coverage}% de vos produits en pharmacie.</p>
            <p>Commencez ou continuez l’étiquetage pour améliorer votre suivi d’inventaire.</p>
            <button type="button" onClick={()=>setTab("operations")}><DashIcon name="tag"/>Accéder à l'avancement</button>
          </div>
        </div>
      </div>

      <div className="figmaPanel figmaAdCard">
        <div className="figmaAdMedia">
          <div className="figmaDots figmaDotsOverlay">
            {shownAds.map((ad,i)=><button type="button" key={currentDashboardAd ? (ad.id || i) : ad} className={i===activeAdIndex ? "active" : ""} onClick={()=> currentDashboardAd ? setDashboardAdIndex(i) : setDefaultAdIndex(i)} aria-label={`Afficher image ${i+1}`}></button>)}
          </div>
          {currentDashboardAd
            ? <img key={currentDashboardAd.id || currentDashboardAd.image_url} src={mediaUrl(currentDashboardAd.image_url)} alt="Publicité" className="cover"/>
            : <img src={defaultAdSrc} alt="Smart Inventory publicité dynamique" className="cover"/>}
        </div>
      </div>
    </div>

    <div className="figmaBottomGrid">
      <div className="figmaPanel figmaReportsPanel">
        <h2>Rapports et exports</h2>
        <div className="figmaReportGrid">
          {reports.map(r=><button type="button" key={r.label} className="figmaReportBtn" onClick={r.action}>
            <span className={`figmaReportIcon ${r.type}`}><DashIcon name={r.icon}/></span>
            <b>{r.label}</b>
            <small>{r.sub}</small>
            <em><DashIcon name="download"/></em>
          </button>)}
        </div>
      </div>

      <div className="figmaPanel figmaAlertsPanel">
        <div className="figmaAlertHeader"><h2>Alertes prioritaires</h2></div>
        <div className="figmaAlertList">
          {alerts.map((a,i)=><div className={`figmaAlert ${a.type}`} key={i}>
            <span><DashIcon name={a.icon}/></span>
            <div><b>{a.title}</b><small>{a.text}</small></div>
          </div>)}
        </div>
      </div>
    </div>

    <div className="figmaDashboardFooter">© 2026 Smart Inventory. Tous droits réservés.</div>
  </section>
}


function DashboardAdmin({auth}){
  const [items,setItems]=useState([]);
  const [message,setMessage]=useState("");
  const [imageUrl,setImageUrl]=useState("");
  const [imageFile,setImageFile]=useState(null);
  const [ctaLabel,setCtaLabel]=useState("");
  const [ctaUrl,setCtaUrl]=useState("");
  const [fitMode,setFitMode]=useState("contain");
  const [active,setActive]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [msg,setMsg]=useState("");

  function load(){
    axios.get(`${API}/platform/dashboard-content`,auth)
      .then(r=>setItems(r.data || []))
      .catch(e=>setMsg(apiErrorMessage(e, "chargement publicité")));
  }

  useEffect(()=>{load()},[]);

  const ads = items.filter(x=>["publicite","publicité","promo","annonce","ad"].includes((x.content_type||"").toLowerCase()));

  function editExisting(x){
    setMessage(x.message || "");
    setImageUrl(x.image_url || "");
    setCtaLabel(x.cta_label || "");
    setCtaUrl(x.cta_url || "");
    setFitMode(x.extra_config || "contain");
    setActive(x.active !== false);
    setMsg("Publicité chargée dans le formulaire.");
  }

  async function uploadSelectedImage(){
    if(!imageFile) return String(imageUrl || "").trim();

    const fd=new FormData();
    fd.append("file",imageFile);
    setUploading(true);
    try{
      // Ne pas forcer Content-Type ici: le navigateur ajoute le boundary multipart lui-même.
      const r=await axios.post(`${API}/platform/upload-ad-image`,fd,{
        headers:{...(auth.headers || {})}
      });
      const uploadedUrl = r.data?.image_url || "";
      if(!uploadedUrl) throw new Error("Réponse upload invalide");
      setImageUrl(uploadedUrl);
      return uploadedUrl;
    }catch(e){
      // Fallback robuste: si Render/Cloudinary refuse l'upload, on stocke l'image directement en base
      // sous forme Data URL. Cela évite le blocage “Erreur upload image”.
      try{
        const dataUrl = await fileToDataUrl(imageFile);
        if(dataUrl){
          setImageUrl(dataUrl);
          return dataUrl;
        }
      }catch(readError){
        // On affichera l'erreur originale plus bas.
      }
      throw new Error(apiErrorMessage(e, "upload image"));
    }finally{
      setUploading(false);
    }
  }

  async function publish(){
    setMsg("");
    try{
      const finalImageUrl = await uploadSelectedImage();
      if(!finalImageUrl){
        setMsg("Image publicité obligatoire.");
        return;
      }
      if(/^https?:\/\//i.test(finalImageUrl) && !/\.(png|jpe?g|webp)(\?|#|$)/i.test(finalImageUrl) && !/cloudinary\.com\/.+\/image\/upload\//i.test(finalImageUrl)){
        setMsg("URL image non directe. Utilisez Choose File ou collez un lien qui finit par .png, .jpg, .jpeg ou .webp.");
        return;
      }

      await axios.post(`${API}/platform/dashboard-content`,{
        scope:"global",
        target_username:null,
        title:"Publicité Dashboard",
        message,
        cta_label:ctaLabel,
        cta_url:ctaUrl,
        image_url:finalImageUrl,
        content_type:"publicite",
        extra_config:fitMode,
        active
      },auth);

      setMessage("");
      setImageUrl("");
      setImageFile(null);
      setCtaLabel("");
      setCtaUrl("");
      setFitMode("contain");
      setActive(true);
      setMsg("Publicité dashboard publiée et ajoutée au carousel.");
      load();
    }catch(e){
      setMsg(apiErrorMessage(e, "publication publicité"));
    }
  }

  async function toggle(id){
    try{
      await axios.post(`${API}/platform/dashboard-content-toggle/${id}`,{},auth);
      load();
    }catch(e){setMsg("Erreur changement statut");}
  }

  async function del(id){
    if(!confirm("Supprimer cette publicité ?")) return;
    try{
      await axios.post(`${API}/platform/dashboard-content-delete/${id}`,{},auth);
      load();
    }catch(e){setMsg("Erreur suppression");}
  }

  const previewSrc = imageFile ? URL.createObjectURL(imageFile) : mediaUrl(imageUrl);

  return <section className="simpleAdAdmin dynamicAdAdmin">
    <p className="notice">Gérez l’espace publicitaire du dashboard. L’image peut avoir une dimension dynamique; le bouton et son lien sont configurables.</p>
    <p className="mutedText">Pour une image externe, il faut une URL directe d'image. Une page Pixabay/Unsplash ne fonctionne pas comme image directe.</p>

    <div className="adAdminGrid">
      <div className="adEditorPanel">
        <h2>Publicité Dashboard</h2>
        <p className="mutedText">Image recommandée : 1200 × 800 px, mais les dimensions sont acceptées dynamiquement. Utilisez PNG, JPG ou WEBP.</p>

        <div className="adFormGrid simpleAdForm">
          <div className="uploadBox">
            <label>Image publicité</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{
              const f=e.target.files?.[0];
              if(f && f.size > 3 * 1024 * 1024){
                setMsg("Image trop lourde. Maximum 3 MB.");
                e.target.value="";
                setImageFile(null);
                return;
              }
              setImageFile(f || null);
              if(f) setMsg("");
            }}/>
            <small>Recommandé : 1200 × 800 px. Max 3 MB.</small>
          </div>

          <input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="Ou coller une URL image directe https://.../image.png"/>
          {imageUrl && /^https?:\/\//i.test(imageUrl) && !/\.(png|jpe?g|webp)(\?|#|$)/i.test(imageUrl) && <small className="urlHint">Note : pour une URL externe, utilisez le lien direct de l’image, pas la page web.</small>}
          <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Message interne optionnel"/>
          <input value={ctaLabel} onChange={e=>setCtaLabel(e.target.value)} placeholder="Titre du bouton, ex: Découvrir l'offre Premium"/>
          <input value={ctaUrl} onChange={e=>setCtaUrl(e.target.value)} placeholder="Lien du bouton https://..."/>

          <select value={fitMode} onChange={e=>setFitMode(e.target.value)}>
            <option value="contain">Image entière visible</option>
            <option value="cover">Remplir tout l’espace</option>
          </select>

          <label className="checkLine"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/> Publicité active</label>
        </div>

        <button className="primaryBtn" onClick={publish} disabled={uploading}>{uploading ? "Upload..." : "Publier"}</button>
        {msg && <p className={(msg.toLowerCase().includes("erreur") || msg.toLowerCase().includes("failed") || msg.includes("500")) ? "err" : "success"}>{msg}</p>}
      </div>

      <div className="adPreviewPanel">
        <h2>Aperçu</h2>
        <div className={`dynamicAdPreview ${fitMode}`}>
          {previewSrc ? <img src={previewSrc} alt="Aperçu publicité"/> : <div className="adPreviewImage">Image publicité</div>}
          {ctaLabel && <a href={ctaUrl || "#"} target="_blank" rel="noreferrer">{ctaLabel}</a>}
        </div>
      </div>
    </div>

    <div className="adListPanel">
      <h2>Publicité existante</h2>
      <div className="adCardsList">
        {ads.map(x=><div className="adRowCard" key={x.id}>
          <div>
            <b>{x.cta_label || x.message || "Publicité Dashboard"}</b>
            <small>{x.active ? "Active" : "Inactive"} · {x.image_url ? "Image configurée" : "Sans image"}</small>
          </div>
          <div>
            <button onClick={()=>editExisting(x)}>Modifier</button>
            <button onClick={()=>toggle(x.id)}>{x.active ? "Désactiver" : "Activer"}</button>
            <button className="dangerSmall" onClick={()=>del(x.id)}>Supprimer</button>
          </div>
        </div>)}
      </div>
    </div>
  </section>
}



function Table({rows,cols}){
  return <table><thead><tr>{cols.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>
    {rows.map((r,i)=><tr key={i} className={r.Statut==="Présent"?"ok":r.Statut==="Manquant"?"bad":r.Statut==="Sans association"?"neutral":""}>{cols.map(c=><td key={c}>{String(r[c]??"")}</td>)}</tr>)}
  </tbody></table>
}

createRoot(document.getElementById("root")).render(<App/>);
