
import React, {useEffect, useMemo, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import axios from "axios";
import Papa from "papaparse";
import "./style.css";
import ShuffleHomepage from "./ShuffleHomepage.jsx";

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
const LS_CASH_REGISTER="smart_inventory_cash_register_v1";
const LS_CASH_SETTINGS="smart_inventory_cash_settings_v1";
const APP_USER_PAGES = [
  {id:"dashboard", label:"Dashboard", icon:"dashboard"},
  {id:"operations", label:"Opérations", icon:"operations"},
  {id:"association", label:"Associations", icon:"association"},
  {id:"inventory", label:"Inventaire", icon:"inventory"},
  {id:"cash", label:"Caisse", icon:"cash"},
  {id:"ai", label:"Assistant IA", icon:"ai"}
];
const APP_ADMIN_PAGES = [
  {id:"cashAdmin", label:"Dashboard Caisse", icon:"cash"},
  {id:"platform", label:"Clients SaaS", icon:"platform"},
  {id:"dashboardAdmin", label:"Publicités", icon:"dashboardAdmin"}
];
function defaultUserPages(){ return APP_USER_PAGES.map(p=>p.id); }
function cleanPageList(pages, allowed=defaultUserPages()){
  const allowedSet = new Set(allowed);
  const next = [];
  (Array.isArray(pages) ? pages : []).forEach(p=>{
    if(allowedSet.has(p) && !next.includes(p)) next.push(p);
  });
  return next.length ? next : [...allowed];
}

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
  if(name==="cash"){
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="7" width="17" height="11" rx="2" {...common}/>
      <path d="M7 7V5.5h10V7" {...common}/>
      <path d="M7 12h4" {...common}/>
      <path d="M15.5 13.5h1.8" {...common}/>
      <path d="M6 18v1.5h12V18" {...common}/>
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

  if(name==="upload") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4" {...common}/><path d="m8 8 4-4 4 4" {...common}/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" {...common}/></svg>;
  if(name==="link") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2.8-2.8a3.5 3.5 0 0 0-5-5L12 7" {...common}/><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-2.8 2.8a3.5 3.5 0 0 0 5 5L12 17" {...common}/></svg>;
  if(name==="barcode") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6v12" {...common}/><path d="M7 6v12" {...common}/><path d="M11 6v12" {...common}/><path d="M14 6v12" {...common}/><path d="M18 6v12" {...common}/><path d="M21 6v12" {...common}/></svg>;
  if(name==="trash") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" {...common}/><path d="M10 11v6" {...common}/><path d="M14 11v6" {...common}/><path d="M6 7l1 13h10l1-13" {...common}/><path d="M9 7V4h6v3" {...common}/></svg>;
  if(name==="chart") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10" {...common}/><path d="M12 20V5" {...common}/><path d="M19 20v-7" {...common}/><path d="M3 20h18" {...common}/></svg>;
  if(name==="save") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5V4Z" {...common}/><path d="M8 4v6h8V4" {...common}/><path d="M8 20v-6h8v6" {...common}/></svg>;
  if(name==="restore") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7" {...common}/><path d="M4 5v5h5" {...common}/><path d="M12 8v5l3 2" {...common}/></svg>;
  if(name==="cash") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="7" width="17" height="11" rx="2" {...common}/><path d="M7 7V5.5h10V7" {...common}/><path d="M7 12h4" {...common}/><path d="M15.5 13.5h1.8" {...common}/></svg>;
  if(name==="refresh") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v5h5" {...common}/><path d="M20 20v-5h-5" {...common}/><path d="M5.2 15.2A8 8 0 0 0 18.4 18" {...common}/><path d="M18.8 8.8A8 8 0 0 0 5.6 6" {...common}/></svg>;
  if(name==="eye") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12C3.8 7.9 7.6 5 12 5s8.2 2.9 9.5 7c-1.3 4.1-5.1 7-9.5 7s-8.2-2.9-9.5-7Z" {...common}/><circle cx="12" cy="12" r="3" {...common}/></svg>;
  return null;
}

function App(){
  const [token,setToken]=useState(localStorage.token||"");
  const [me,setMe]=useState(null);
  const [tab,setTab]=useState("dashboard");
  const [sidebarCollapsed,setSidebarCollapsed]=useState(localStorage.sidebarCollapsed==="1");
  const auth={headers:{Authorization:`Bearer ${token}`}};

  useEffect(()=>{ if(token) axios.get(`${API}/me`,auth).then(r=>setMe(r.data)).catch(()=>logout()) },[token]);
  useEffect(()=>{
    if(!me) return;
    const allowed = me.role==="platform_admin" ? [...defaultUserPages(), ...APP_ADMIN_PAGES.map(p=>p.id)] : cleanPageList(me.page_permissions || defaultUserPages());
    const fullAllowed = me.can_manage_users && me.role!=="platform_admin" ? [...allowed,"users"] : allowed;
    if(fullAllowed.length && !fullAllowed.includes(tab)) setTab(fullAllowed[0]);
  },[me?.username, me?.role, me?.can_manage_users, JSON.stringify(me?.page_permissions || []), tab]);

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
    tab==="operations" ? "Opérations" :
    tab==="dashboard" ? "Dashboard" :
    tab==="association" ? "Associations" :
    tab==="inventory" ? "Inventaire réel" :
    tab==="cash" ? "Caisse" :
    tab==="cashAdmin" ? "Dashboard Caisse" :
    tab==="ai" ? "Assistant IA" :
    tab==="users" ? "Utilisateurs" :
    tab==="platform" ? "Clients SaaS" :
    tab==="dashboardAdmin" ? "Publicités" : "Smart Inventory";


  const userAllowedPages = me?.role==="platform_admin" ? defaultUserPages() : cleanPageList(me?.page_permissions || defaultUserPages());
  const menu = APP_USER_PAGES.filter(p=>userAllowedPages.includes(p.id)).map(p=>({...p}));
  if(me?.can_manage_users && me?.role!=="platform_admin"){
    menu.push({id:"users",label:"Utilisateurs",icon:"platform"});
  }
  if(me?.role==="platform_admin"){
    menu.push(...APP_ADMIN_PAGES.map(p=>({...p})));
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
        <div className="shuffleAppChromeLabel" aria-hidden="true">
          <span className="shuffleDot rose"></span><span className="shuffleDot amber"></span><span className="shuffleDot emerald"></span>
          <code>app.smartinventory.io/{tab}</code>
          <em>2026 Stable</em>
        </div>
        <div className="whiteAccount">
          <span className="whiteAvatar" aria-hidden="true">AD</span>
          <div>
            <b>{accountName}</b>
            <small>{roleName}</small>
          </div>
        </div>
      </header>

      <main className="whiteContent">
        {tab==="operations" && <Operations me={me}/>}
        {tab==="dashboard" && <Dashboard setTab={setTab}/>}
        {tab==="ai" && <AIAssistant/>}
        {tab==="association" && <Association/>}
        {tab==="inventory" && <Inventory/>}
        {tab==="cash" && <CashRegister/>}
        {tab==="users" && <MyUsers auth={auth} me={me}/>} 
        {tab==="cashAdmin" && <CashDashboardAdmin/>}
        {tab==="platform" && <Platform auth={auth}/>}
        {tab==="dashboardAdmin" && <DashboardAdmin auth={auth}/>}
      </main>
      <footer className="whiteFooter">© 2026 Smart Inventory. All rights reserved.</footer>
    </section>
  </div>
}


function Operations({me}){
  const {products,associations,detectedEpcs,setProducts,setAssociations,setDetectedEpcs}=useLocalStore();
  const [scanModal,setScanModal]=useState(null);
  const [barcode,setBarcode]=useState("");
  const [epc,setEpc]=useState("");
  const [selectedProduct,setSelectedProduct]=useState(null);
  const [msg,setMsg]=useState("");
  const [cashDate,setCashDate]=useState(()=>todayISO());
  const [cashStore,setCashStore]=useState(()=>loadLS(LS_CASH_REGISTER,{}));
  const [cashSettings,setCashSettings]=useState(()=>({ ...defaultCashSettings(), ...(loadLS(LS_CASH_SETTINGS,{}) || {}) }));
  const [cashOpModal,setCashOpModal]=useState(null);
  const [expenseModalOpen,setExpenseModalOpen]=useState(false);
  const [expenseDraft,setExpenseDraft]=useState(()=>createExpenseRow());
  const canChangeCashDate = me?.role==="platform_admin";
  const reserveCents = Number(cashSettings.reserveCents || 0);

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
        Identifiant:norm(r.EPC||r.epc||r.Tag||""),
        Date:r.Date||new Date().toISOString()
      })).filter(x=>x.EPC);
      setAssociations([...associations,...rows]);
      setMsg(`${rows.length} associations importées.`);
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
    if(!epc.trim()){ setMsg("Saisir un identifiant."); return; }
    const item={
      PID:selectedProduct.PID,
      Produit:selectedProduct.Produit,
      "Code barre 1":selectedProduct["Code barre 1"],
      "Code barre 2":selectedProduct["Code barre 2"],
      Identifiant:norm(epc),
      Date:new Date().toISOString()
    };
    setAssociations([...associations,item]);
    setMsg(`Identifiant associé à ${selectedProduct.Produit}.`);
    setEpc("");
  }

  function importDetectedEpc(file){
    if(!file) return;
    Papa.parse(file,{header:false,skipEmptyLines:true,complete:(res)=>{
      const rows=extractDetectedEpcs(res.data);
      setDetectedEpcs(rows);
      downloadJSON(`epc_detectes_${new Date().toISOString().slice(0,10)}.json`,{epcs:rows,date:new Date().toISOString()});
      setMsg(`${rows.length} Identifiants détectés importés et enregistrés pour comparer le stock.`);
    }});
  }

  function clearAssociations(){
    if(confirm("Supprimer toutes les associations locales ?")){
      setAssociations([]);
      setMsg("Toutes les associations ont été supprimées.");
    }
  }

  function exportProducts(){ exportCSV("produits_locaux.csv",products,Object.keys(products[0]||{})); }
  function exportAssociations(){ exportCSV("associations.csv",associations,Object.keys(associations[0]||{})); }
  function exportProductsWithoutRfid(){
    const associatedPids=new Set(associations.map(a=>String(a.PID)));
    const rows=products.filter(p=>!associatedPids.has(String(p.PID))).map(p=>({...p,"Statut":"Non associé"}));
    exportCSV("produits_sans_association.csv",rows,["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","Statut"]);
  }
  function exportCoverageReport(){
    const associatedPids=new Set(associations.map(a=>String(a.PID)));
    const productsWithRfid=products.filter(p=>associatedPids.has(String(p.PID))).length;
    const productsWithoutRfid=Math.max(products.length-productsWithRfid,0);
    const coverage=products.length ? Math.round((productsWithRfid/products.length)*100) : 0;
    const rows=[{"Produits locaux":products.length,"Produits associés":productsWithRfid,"Produits sans association":productsWithoutRfid,"Associations":associations.length,"Taux de couverture":coverage+"%","Date rapport":new Date().toISOString()}];
    exportCSV("rapport_couverture.csv",rows,Object.keys(rows[0]));
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

  const cashCurrent = useMemo(()=>({
    ...defaultCashDay(),
    ...(cashStore[cashDate] || {}),
    management:{...defaultCashDay().management, ...((cashStore[cashDate] || {}).management || {})},
    quantities:{...((cashStore[cashDate] || {}).quantities || {})},
    expenses:Array.isArray((cashStore[cashDate] || {}).expenses) && (cashStore[cashDate] || {}).expenses.length
      ? (cashStore[cashDate] || {}).expenses.map(normalizeExpenseRow)
      : defaultCashDay().expenses
  }),[cashStore,cashDate]);

  const cashCountedCents = CASH_DENOMINATIONS.reduce((sum,d)=>sum + (Number(cashCurrent.quantities[d.cents] || 0) * d.cents),0);
  const expensesCents = cashCurrent.expenses.reduce((sum,e)=>sum + (Number(e.amountCents) || 0),0);
  const totalDailySalesCents = Number(cashCurrent.management.totalDailySalesCents || 0);
  const creditSalesCents = Number(cashCurrent.management.creditSalesCents || 0);
  const atmSalesCents = Number(cashCurrent.management.atmSalesCents || 0);
  const salesCashCalculatedCents = totalDailySalesCents - creditSalesCents - atmSalesCents;
  const creditSettlementCents = Number(cashCurrent.management.creditSettlementCents || 0);
  const withdrawnCents = Number(cashCurrent.management.withdrawnCents || 0);
  const depositsCents = Number(cashCurrent.management.depositsCents || 0);
  const newCashBalanceCents = getClosingRealCentsForDate(cashStore, cashDate);
  const cashToWithdrawCents = Math.max(0, cashCountedCents - 300000);
  const closingTheoreticalCents = getTheoreticalClosingCentsForDate(cashStore, cashDate);
  const currentCashMetrics = useMemo(()=>buildCashDayMetrics(cashDate, cashCurrent, cashStore),[cashDate,cashCurrent,cashStore]);

  function saveCashDay(day){
    const updated={...cashStore,[cashDate]:day};
    setCashStore(updated);
    saveLS(LS_CASH_REGISTER,updated);
  }

  function updateCashOperation(key,value){
    const management={...cashCurrent.management,[key]:parseMoneyToCents(value)};
    saveCashDay({...cashCurrent, management});
    setMsg(`Opération de caisse mise à jour pour le ${cashDate}.`);
  }

  function updateCashQuantity(cents,value){
    const qty=Math.max(0, parseInt(value || 0, 10) || 0);
    const quantities={...cashCurrent.quantities,[cents]:qty};
    saveCashDay({...cashCurrent, quantities});
  }

  function updateCashSetting(key,value){
    const updated={...cashSettings,[key]:parseMoneyToCents(value)};
    setCashSettings(updated);
    saveLS(LS_CASH_SETTINGS,updated);
  }

  function openExpenseModal(){
    setExpenseDraft(createExpenseRow());
    setExpenseModalOpen(true);
  }

  function updateExpenseDraft(key,value){
    setExpenseDraft(prev=>({
      ...prev,
      [key]: key==="amountCents" ? parseMoneyToCents(value) : value
    }));
  }

  function saveExpenseFromOperations(){
    if(!(expenseDraft.label || expenseDraft.amountCents || expenseDraft.type || expenseDraft.employeeId || expenseDraft.invoiceId || expenseDraft.note)){
      alert("Veuillez saisir au moins une information pour la dépense.");
      return;
    }
    const existing=(Array.isArray(cashCurrent.expenses) ? cashCurrent.expenses : []).filter(e=>e.label || e.amountCents || e.type || e.employeeId || e.invoiceId || e.note);
    saveCashDay({...cashCurrent, expenses:[...existing, normalizeExpenseRow(expenseDraft)]});
    setExpenseModalOpen(false);
    setMsg(`Dépense ajoutée pour le ${cashDate}.`);
  }

  const cashOperationCards = [
    {key:"totalDailySalesCents", title:"Total de vente par jour", value:totalDailySalesCents, description:"Saisir le montant total des ventes du jour.", type:"=", editable:true, tone:"green", cta:"Entrer valeur", valueLabel:"Valeur entrée"},
    {key:"creditSalesCents", title:"Tot. vente type crédit", value:creditSalesCents, description:"Saisir le total des ventes crédit.", type:"-", editable:true, tone:"danger", cta:"Entrer valeur", valueLabel:"Valeur entrée"},
    {key:"atmSalesCents", title:"Tot. vente type ATM", value:atmSalesCents, description:"Saisir le total des ventes ATM.", type:"-", editable:true, tone:"blue", cta:"Entrer valeur", valueLabel:"Valeur entrée"},
    {key:"salesCashCents", title:"Tot. vente en espèce", value:salesCashCalculatedCents, description:"Calcul automatique : total vente par jour - crédit - ATM.", type:"=", editable:false, tone:"indigo", cta:"Automatique", valueLabel:"Valeur calculée"},
    {key:"depositsCents", title:"Dépôts / ajouts", value:depositsCents, description:"Saisir les dépôts ou ajouts.", type:"+", editable:true, tone:"green", cta:"Entrer valeur", valueLabel:"Valeur entrée"},
    {key:"creditSettlementCents", title:"Règlement de crédit", value:creditSettlementCents, description:"Saisir le règlement de crédit.", type:"+", editable:true, tone:"indigo", cta:"Entrer valeur", valueLabel:"Valeur entrée"},
    {key:"expenseEntry", title:"Ajouter dépense", value:expensesCents, description:"Saisir une dépense et l’ajouter à l’historique.", type:"-", editable:true, tone:"danger", cta:"Ajouter dépense", isExpense:true, valueLabel:"Total des dépenses"},
    {key:"toWithdraw", title:"À retirer", value:cashToWithdrawCents, description:"Calcul automatique : S. caisse (compté) - 3000 DH, minimum 0.", type:"=", editable:false, tone:"neutral", cta:"Automatique", valueLabel:"Valeur calculée"},
    {key:"withdrawnCents", title:"Retiré (réel)", value:withdrawnCents, description:"Saisir le montant retiré.", type:"-", editable:true, tone:"blue", cta:"Entrer valeur", valueLabel:"Valeur entrée"},
    {key:"closingRealCents", title:"Nouvelle C. fermeture", value:newCashBalanceCents, description:"Calcul Excel : C. fermeture (compté) - Retiré (réel).", type:"=", editable:false, tone:"blue", cta:"Automatique", valueLabel:"Valeur calculée"},
    {key:"counted", title:"C. fermeture (compté)", value:cashCountedCents, description:"Saisir le comptage réel de fermeture avec les mêmes données que Monnaie stock.", type:"=", editable:true, tone:"blue", cta:"Compter la caisse", valueLabel:"Valeur comptée"},
    {key:"closingCalculatedCents", title:"C. fermeture (théorique)", value:closingTheoreticalCents, description:"Calcul Excel : max(0, Nouvelle C. fermeture de hier + Dépôt/ajout + Tot. vente en espèce + Règlement crédit - Dépenses).", type:"=", editable:false, tone:"neutral", cta:"Automatique", valueLabel:"Valeur calculée"}
  ];
  return <section className="operationsPage">
    <h1>Opérations</h1>
    <p>Import, scan, associations, identifiants détectés, exports et sauvegardes locales.</p>

    <div className="operationsActionPanel">
      <h2>Actions inventaire</h2>
      <p className="notice">Lancez les opérations principales de gestion d’inventaire.</p>
      <div className="operationGrid workflowGrid">
      <label className="operationCard white fileCardOp">
        <div className="opIcon"><DashIcon name="upload"/></div><h3>Importer CSV pharmacie</h3><p>Importer le catalogue produits.</p><span>Choisir CSV</span>
        <input type="file" accept=".csv" onChange={e=>importProducts(e.target.files[0])}/>
      </label>

      <label className="operationCard white fileCardOp">
        <div className="opIcon"><DashIcon name="link"/></div><h3>Importer associations</h3><p>Importer les associations Produit ↔ identifiant.</p><span>Choisir CSV</span>
        <input type="file" accept=".csv" onChange={e=>importAssociations(e.target.files[0])}/>
      </label>

      <button className="operationCard blue" onClick={openBarcode}>
        <div className="opIcon"><DashIcon name="barcode"/></div><h3>Scanner code-barres produit</h3><p>Ouvrir une fenêtre pour saisir le code-barres.</p><span>Scanner</span>
      </button>

      <button className="operationCard green" onClick={openEpc}>
        <div className="opIcon"><DashIcon name="rfid"/></div><h3>Scanner identifiant</h3><p>Ouvrir une fenêtre pour saisir un identifiant.</p><span>Scanner</span>
      </button>

      <label className="operationCard white fileCardOp">
        <div className="opIcon"><DashIcon name="barcode"/></div><h3>Importer identifiants détectés</h3><p>Importer un CSV/TXT d’identifiants détectés.</p><span>Choisir fichier</span>
        <input type="file" accept=".csv,.txt" onChange={e=>importDetectedEpc(e.target.files[0])}/>
      </label>

      <button className="operationCard dangerOp" onClick={clearAssociations}>
        <div className="opIcon"><DashIcon name="trash"/></div><h3>Vider toutes associations</h3><p>Supprimer toutes les associations locales.</p><span>Vider</span>
      </button>
    </div>
    </div>

    <div className="exportsPanel cashOpsPanel">
      <div className="cashOpsHeader">
        <div className="cashOpsIntro">
          <h2>Opérations de caisse</h2>
          <p className="notice">Ces opérations ont été déplacées ici. Cliquez sur une carte pour saisir ou modifier la valeur.</p>
        </div>
        <div className="cashOpsIndicators">
          <div className="cashOpsIndicator cashOpsIndicatorShortage">
            <div className="cashOpsIndicatorIcon"><DashIcon name="warning"/></div>
            <div className="cashOpsIndicatorContent">
              <span>Montant manquant</span>
              <strong>{formatDH(currentCashMetrics.shortageCents)}</strong>
              <small>{currentCashMetrics.shortageCents>0 ? "À vérifier" : "Équilibré"}</small>
            </div>
          </div>
          <div className="cashOpsIndicator cashOpsIndicatorSurplus">
            <div className="cashOpsIndicatorIcon"><DashIcon name="check"/></div>
            <div className="cashOpsIndicatorContent">
              <span>Montant surplus</span>
              <strong>{formatDH(currentCashMetrics.surplusCents)}</strong>
              <small>{currentCashMetrics.surplusCents>0 ? "Excédent" : "Équilibré"}</small>
            </div>
          </div>
        </div>
        <div className="cashOpsDateBox">
          <span>Date de caisse {canChangeCashDate ? "" : "(admin seulement)"}</span>
          <input
            type="date"
            value={cashDate}
            disabled={!canChangeCashDate}
            title={canChangeCashDate ? "Changer la date de caisse" : "Seul un administrateur peut changer cette date"}
            onChange={e=>canChangeCashDate && setCashDate(e.target.value || todayISO())}
          />
        </div>
      </div>
      <div className="exportOperationGrid cashOpsGrid">
        {cashOperationCards.map(card=><button key={card.key} type="button" className={`exportOperationCard cashOperationCard ${card.tone || ""} ${card.cardClass || ""} ${card.editable ? "" : "cashOperationCardReadOnly"}`} onClick={()=>card.isExpense ? openExpenseModal() : (card.editable ? setCashOpModal(card) : null)}>
          <div className="opIcon"><DashIcon name={card.icon || "cash"}/></div>
          <h3>{card.title}</h3>
          <strong className="cashOpCardAmount">{card.type} {formatDH(card.value)}</strong>
          <span>{card.cta}</span>
        </button>)}
      </div>
    </div>

    <div className="exportsPanel">
      <h2>Exports et sauvegardes locales</h2>
      <p className="notice">Exportez vos tableaux, rapports d’inventaire et sauvegardes locales.</p>
      <div className="exportOperationGrid">
        <button className="exportOperationCard" onClick={exportProducts}><div className="opIcon"><DashIcon name="box"/></div><h3>Produits locaux</h3><p>Exporter le catalogue importé complet.</p><span>Exporter</span></button>
        <button className="exportOperationCard" onClick={exportAssociations}><div className="opIcon"><DashIcon name="link"/></div><h3>Associations</h3><p>Exporter les produits liés aux identifiants.</p><span>Exporter</span></button>
        <button className="exportOperationCard" onClick={exportProductsWithoutRfid}><div className="opIcon"><DashIcon name="tag"/></div><h3>Produits sans association</h3><p>Exporter les articles à associer.</p><span>Exporter</span></button>
        <button className="exportOperationCard blue" onClick={exportCoverageReport}><div className="opIcon"><DashIcon name="chart"/></div><h3>Taux de couverture</h3><p>Exporter les KPI de couverture.</p><span>Exporter</span></button>
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
          <h2>Scanner identifiant</h2>
          <p>Saisissez ou scannez l’identifiant à associer au produit sélectionné.</p>
          {selectedProduct ? <div className="foundProduct"><b>{selectedProduct.Produit}</b><small>PID: {selectedProduct.PID}</small></div> : <p className="err">Aucun produit sélectionné. Scannez d’abord le code-barres.</p>}
          <input autoFocus value={epc} onChange={e=>setEpc(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")associateEpc()}} placeholder="Identifiant"/>
          <button className="primaryBtn" onClick={associateEpc}>Associer identifiant</button>
        </>}
      </div>
    </div>}

    {cashOpModal && <div className="modalOverlay">
      <div className={`scanModal cashValueModal ${cashOpModal.key==="counted" ? "cashCountModal" : ""}`}>
        <button className="modalClose" onClick={()=>setCashOpModal(null)}>×</button>
        <h2>{cashOpModal.title}</h2>
        <p>{cashOpModal.description}</p>
        <div className="foundProduct"><b>Date de caisse</b><small>{cashDate}</small></div>
        {cashOpModal.key==="counted" ? <>
          <div className="cashModalTableWrap">
            <table className="cashMiniTable">
              <thead><tr><th>Quantité</th><th>Bill</th></tr></thead>
              <tbody>
                {CASH_DENOMINATIONS.map(d=>{
                  const qty=Number(cashCurrent.quantities[d.cents] || 0);
                  return <tr key={d.cents}>
                    <td><input autoFocus={d.cents===CASH_DENOMINATIONS[0].cents} className="qtyInput" type="number" min="0" step="1" value={qty} onChange={e=>updateCashQuantity(d.cents,e.target.value)} /></td>
                    <td>{d.label}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="cashModalTotalBar">
            <span>Total compté</span>
            <strong>{formatDH(cashCountedCents)}</strong>
          </div>
        </> : cashOpModal.key==="toWithdraw" ? <>
          <div className="foundProduct"><b>Montant minimum à garder en caisse</b><small>Modifiable par l’admin seulement.</small></div>
          <input autoFocus value={moneyInputValue(reserveCents)} onChange={e=>updateCashSetting("reserveCents",e.target.value)} placeholder="0"/>
          <div className="cashModalTotalBar">
            <span>À retirer calculé</span>
            <strong>{formatDH(cashToWithdrawCents)}</strong>
          </div>
        </> : <input autoFocus value={moneyInputValue(cashCurrent.management[cashOpModal.key] || 0)} onChange={e=>updateCashOperation(cashOpModal.key,e.target.value)} placeholder="0"/>}
        <button className="primaryBtn" onClick={()=>setCashOpModal(null)}>Fermer</button>
      </div>
    </div>}

    {expenseModalOpen && <div className="modalOverlay">
      <div className="scanModal cashValueModal expenseValueModal">
        <button className="modalClose" onClick={()=>setExpenseModalOpen(false)}>×</button>
        <h2>Ajouter dépense</h2>
        <p>Saisissez une dépense qui sera enregistrée pour la date sélectionnée.</p>
        <div className="foundProduct"><b>Date de caisse</b><small>{cashDate}</small></div>
        <div className="expenseModalFields">
          <input autoFocus value={expenseDraft.label} onChange={e=>updateExpenseDraft("label",e.target.value)} placeholder="Description"/>
          <input value={moneyInputValue(expenseDraft.amountCents)} onChange={e=>updateExpenseDraft("amountCents",e.target.value)} placeholder="Montant"/>
          <input value={expenseDraft.type} onChange={e=>updateExpenseDraft("type",e.target.value)} placeholder="Type"/>
          <input value={expenseDraft.employeeId} onChange={e=>updateExpenseDraft("employeeId",e.target.value)} placeholder="ID employé"/>
          <input value={expenseDraft.invoiceId} onChange={e=>updateExpenseDraft("invoiceId",e.target.value)} placeholder="ID facture"/>
        </div>
        <div className="expenseModalActions">
          <button className="primaryBtn" onClick={saveExpenseFromOperations}>Ajouter la dépense</button>
        </div>
      </div>
    </div>}

    <div className="pageFooterLikeDashboard">© 2026 Smart Inventory. Tous droits réservés.</div>
  </section>
}


const CASH_DENOMINATIONS = [
  {label:"DH 200", cents:20000},
  {label:"DH 100", cents:10000},
  {label:"DH 50", cents:5000},
  {label:"DH 20", cents:2000},
  {label:"DH 10", cents:1000},
  {label:"DH 5", cents:500},
  {label:"DH 2", cents:200},
  {label:"DH 1", cents:100},
  {label:"DH 0.5", cents:50},
  {label:"DH 0.2", cents:20},
  {label:"DH 0.1", cents:10}
];

function todayISO(){
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0,10);
}

function shiftISODate(iso, days){
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

function todayMonthISO(){
  return todayISO().slice(0,7);
}

function shiftISOMonth(isoMonth, months){
  const [year,month] = String(isoMonth || todayMonthISO()).split("-").map(Number);
  const d = new Date(year || new Date().getFullYear(), ((month || 1) - 1) + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function formatMonthLabel(isoMonth){
  const [year,month] = String(isoMonth || todayMonthISO()).split("-").map(Number);
  const d = new Date(year || new Date().getFullYear(), (month || 1) - 1, 1);
  return new Intl.DateTimeFormat("fr-FR", {year:"numeric", month:"long"}).format(d);
}

function parseMoneyToCents(value){
  const raw = String(value ?? "").replace(/[^0-9,.-]/g, "").replace(",", ".");
  if(!raw || raw==="-" || raw===".") return 0;
  const n = Number(raw);
  if(!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function moneyInputValue(cents){
  if(!cents) return "";
  const value = Number(cents) / 100;
  return Number.isInteger(value) ? String(value) : String(value.toFixed(2)).replace(/0+$/, "").replace(/\.$/, "");
}

function formatDH(cents){
  const value = (Number(cents) || 0) / 100;
  const formatted = new Intl.NumberFormat("fr-FR", {minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2}).format(value);
  return `DH ${formatted}`;
}

function createExpenseRow(){
  return {id:Date.now()+Math.random(), label:"", amountCents:0, note:"", type:"", employeeId:"", invoiceId:""};
}

function normalizeExpenseRow(expense){
  return {
    id: expense?.id ?? (Date.now()+Math.random()),
    label: expense?.label ?? expense?.description ?? "",
    amountCents: Number(expense?.amountCents || 0),
    note: expense?.note ?? "",
    type: expense?.type ?? "",
    employeeId: expense?.employeeId ?? "",
    invoiceId: expense?.invoiceId ?? ""
  };
}

function defaultCashDay(){
  return {
    quantities:{},
    management:{openingCents:0, totalDailySalesCents:0, salesCashCents:0, depositsCents:0, withdrawalsCents:0, refundsCents:0, toWithdrawCents:0, withdrawnCents:0, creditSalesCents:0, atmSalesCents:0, creditSettlementCents:0, closingRealCents:0},
    expenses:[createExpenseRow()]
  };
}

function defaultCashSettings(){
  return { reserveCents: 300000 };
}

function getCountedCentsForDate(store, date){
  const quantities = {...((store?.[date]?.quantities) || {})};
  return CASH_DENOMINATIONS.reduce((sum,d)=>sum + (Number(quantities[d.cents] || 0) * d.cents),0);
}

function getCalculatedCashBalanceCents(dayData){
  const day = { ...defaultCashDay(), ...(dayData || {}), management:{...defaultCashDay().management, ...((dayData || {}).management || {})}, quantities:{...((dayData || {}).quantities || {})}, expenses:Array.isArray((dayData || {}).expenses) ? (dayData || {}).expenses.map(normalizeExpenseRow) : [] };
  const countedCents = CASH_DENOMINATIONS.reduce((sum,d)=>sum + (Number(day.quantities[d.cents] || 0) * d.cents),0);
  return countedCents - Number(day.management.withdrawnCents || 0);
}

function getClosingRealCentsForDate(store, date){
  return getCalculatedCashBalanceCents((store || {})[date]);
}

function getCashFormulaParts(dayData){
  const day = { ...defaultCashDay(), ...(dayData || {}), management:{...defaultCashDay().management, ...((dayData || {}).management || {})}, quantities:{...((dayData || {}).quantities || {})}, expenses:Array.isArray((dayData || {}).expenses) ? (dayData || {}).expenses.map(normalizeExpenseRow) : [] };
  const expensesCents = day.expenses.reduce((sum,e)=>sum + (Number(e.amountCents) || 0),0);
  const totalSalesCents = Number(day.management.totalDailySalesCents || 0);
  const salesCashCents = totalSalesCents - Number(day.management.creditSalesCents || 0) - Number(day.management.atmSalesCents || 0);
  return {
    newCashBalanceCents:getCalculatedCashBalanceCents(dayData),
    depositsCents:Number(day.management.depositsCents || 0),
    salesCashCents,
    creditSettlementCents:Number(day.management.creditSettlementCents || 0),
    expensesCents
  };
}

function getTheoreticalClosingCentsForDate(store, date){
  const previous = getCashFormulaParts((store || {})[shiftISODate(date,-1)]);
  const current = getCashFormulaParts((store || {})[date]);
  return Math.max(0,
    previous.newCashBalanceCents
    + current.depositsCents
    + current.salesCashCents
    + current.creditSettlementCents
    - current.expensesCents
  );
}

function getNextDayCountedAsClosingRealCents(store, date){
  return getClosingRealCentsForDate(store, date);
}

function CashRegister(){
  const [active,setActive]=useState("exchange");
  const [cashDate,setCashDate]=useState(()=>todayISO());
  const [managementMonth,setManagementMonth]=useState(()=>todayMonthISO());
  const [managementPage,setManagementPage]=useState(0);
  const [expensesMonth,setExpensesMonth]=useState(()=>todayMonthISO());
  const [expensesPage,setExpensesPage]=useState(0);
  const [store,setStore]=useState(()=>loadLS(LS_CASH_REGISTER,{}));
  const [cashSettings] = useState(()=>({ ...defaultCashSettings(), ...(loadLS(LS_CASH_SETTINGS,{}) || {}) }));
  const [msg,setMsg] = useState("");
  const reserveCents = Number(cashSettings.reserveCents || 0);

  const current = useMemo(()=>({
    ...defaultCashDay(),
    ...(store[cashDate] || {}),
    management:{...defaultCashDay().management, ...((store[cashDate] || {}).management || {})},
    quantities:{...((store[cashDate] || {}).quantities || {})},
    expenses: Array.isArray((store[cashDate] || {}).expenses) && (store[cashDate] || {}).expenses.length
      ? (store[cashDate] || {}).expenses.map(normalizeExpenseRow)
      : defaultCashDay().expenses
  }),[store,cashDate]);

  function saveDay(next){
    const updated={...store,[cashDate]:next};
    setStore(updated);
    saveLS(LS_CASH_REGISTER,updated);
  }

  function updateQuantity(cents,value){
    const qty = Math.max(0, Number.parseInt(String(value || "0"),10) || 0);
    saveDay({...current, quantities:{...current.quantities,[cents]:qty}});
    setMsg("");
  }

  function updateManagement(key,value){
    saveDay({...current, management:{...current.management,[key]:parseMoneyToCents(value)}});
    setMsg("");
  }

  function updateExpense(id,key,value){
    const expenses=current.expenses.map(x=>x.id===id ? {...x,[key]: key==="amountCents" ? parseMoneyToCents(value) : value} : x);
    saveDay({...current, expenses});
    setMsg("");
  }

  function addExpense(){
    saveDay({...current, expenses:[...current.expenses,createExpenseRow()]});
  }

  function removeExpense(id){
    const expenses=current.expenses.filter(x=>x.id!==id);
    saveDay({...current, expenses: expenses.length ? expenses : defaultCashDay().expenses});
  }

  function resetDay(){
    if(!confirm(`Réinitialiser la caisse du ${cashDate} ?`)) return;
    const updated={...store};
    delete updated[cashDate];
    setStore(updated);
    saveLS(LS_CASH_REGISTER,updated);
    setMsg("La journée de caisse a été réinitialisée.");
  }

  function exportCashCSV(){
    const rows=[];
    CASH_DENOMINATIONS.forEach(d=>{
      const qty=Number(current.quantities[d.cents] || 0);
      rows.push({Date:cashDate, Onglet:"Monnaie stock", Libellé:d.label, Quantité:qty, Somme:formatDH(qty*d.cents)});
    });
    const m=current.management;
    const sCaisseCompteeCents = countedCents;
    const totalSalesCents = Number(m.totalDailySalesCents || 0);
    const salesCashCents = totalSalesCents - Number(m.creditSalesCents || 0) - Number(m.atmSalesCents || 0);
    const autoToWithdrawCents = Math.max(0, sCaisseCompteeCents - 300000);
    const closingRealCents = getClosingRealCentsForDate(store, cashDate);
    const previousClosingRealCents = getCalculatedCashBalanceCents((store || {})[shiftISODate(cashDate,-1)]);
    const sameDayClosingRealCents = sCaisseCompteeCents;
    const closingCalculatedCents = getTheoreticalClosingCentsForDate(store, cashDate);
    const shortageCents = Math.max(0, closingCalculatedCents - sameDayClosingRealCents);
    const surplusCents = Math.max(0, sameDayClosingRealCents - closingCalculatedCents);
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"C. fermeture (compté)", Quantité:"", Somme:formatDH(sCaisseCompteeCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"À retirer", Quantité:"", Somme:formatDH(autoToWithdrawCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"Retiré (réel)", Quantité:"", Somme:formatDH(m.withdrawnCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"Dépôt / ajout", Quantité:"", Somme:formatDH(m.depositsCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"TOTAL DE VENTE PAR JOUR", Quantité:"", Somme:formatDH(totalSalesCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"Tot. vente en espèce", Quantité:"", Somme:formatDH(salesCashCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"Tot. vente type crédit", Quantité:"", Somme:formatDH(m.creditSalesCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"Tot. vente type ATM", Quantité:"", Somme:formatDH(m.atmSalesCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"Réglement crédit", Quantité:"", Somme:formatDH(m.creditSettlementCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"Dépenses enregistrées", Quantité:"", Somme:formatDH(expensesCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"Nouvelle C. fermeture", Quantité:"", Somme:formatDH(closingRealCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"Nouvelle C. fermeture de hier", Quantité:"", Somme:formatDH(previousClosingRealCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"C. fermeture (théorique)", Quantité:"", Somme:formatDH(closingCalculatedCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"Montant manquant", Quantité:"", Somme:formatDH(shortageCents)});
    rows.push({Date:cashDate, Onglet:"Gestion de caisse", Libellé:"Montant surplus", Quantité:"", Somme:formatDH(surplusCents)});
    current.expenses.forEach(e=>rows.push({Date:cashDate, Onglet:"Dépenses", Libellé:e.label || "Dépense", Type:e.type || "", EmployeId:e.employeeId || "", FactureId:e.invoiceId || "", Quantité:e.note || "", Somme:formatDH(e.amountCents)}));
    exportCSV(`caisse_${cashDate}.csv`,rows,["Date","Onglet","Libellé","Type","EmployeId","FactureId","Quantité","Somme"]);
    setMsg("Export CSV de la caisse généré.");
  }

  const countedCents = CASH_DENOMINATIONS.reduce((sum,d)=>sum + (Number(current.quantities[d.cents] || 0) * d.cents),0);
  const expensesCents = current.expenses.reduce((sum,e)=>sum + (Number(e.amountCents) || 0),0);
  const sCaisseCompteeCents = countedCents;
  const totalSalesCents = Number(current.management.totalDailySalesCents || 0);
  const salesCashCents = totalSalesCents - Number(current.management.creditSalesCents || 0) - Number(current.management.atmSalesCents || 0);
  const autoToWithdrawCents = Math.max(0, sCaisseCompteeCents - 300000);
  const closingRealCents = getClosingRealCentsForDate(store, cashDate);
  const sameDayClosingRealCents = sCaisseCompteeCents;
  const closingCalculatedCents = getTheoreticalClosingCentsForDate(store, cashDate);
  const shortageCents = Math.max(0, closingCalculatedCents - sameDayClosingRealCents);
  const surplusCents = Math.max(0, sameDayClosingRealCents - closingCalculatedCents);
  const expectedCents = closingCalculatedCents;
  const gapCents = sameDayClosingRealCents - expectedCents;
  const billDenominations = CASH_DENOMINATIONS.filter(d=>d.cents >= 2000);
  const coinDenominations = CASH_DENOMINATIONS.filter(d=>d.cents < 2000);

  const managementHistory = useMemo(()=>Object.entries(store)
    .filter(([date])=>date.startsWith(managementMonth))
    .map(([date,day])=>{
      const management = {...defaultCashDay().management, ...(day?.management || {})};
      const quantities = {...((day?.quantities) || {})};
      const daySCaisseCompteeCents = CASH_DENOMINATIONS.reduce((sum,d)=>sum + (Number(quantities[d.cents] || 0) * d.cents),0);
      const dayExpenses = (Array.isArray(day?.expenses) ? day.expenses : []).map(normalizeExpenseRow).reduce((sum,e)=>sum + (Number(e.amountCents) || 0),0);
      const dayTotalSales = Number(management.totalDailySalesCents || 0);
      const daySalesCash = dayTotalSales - Number(management.creditSalesCents || 0) - Number(management.atmSalesCents || 0);
      const dayToWithdrawCents = Math.max(0, daySCaisseCompteeCents - 300000);
      const dayClosingReal = getClosingRealCentsForDate(store, date);
      const dayPreviousClosingRealCents = getCalculatedCashBalanceCents((store || {})[shiftISODate(date,-1)]);
      const daySameClosingRealCents = daySCaisseCompteeCents;
      const dayClosingCalculated = getTheoreticalClosingCentsForDate(store, date);
      return {
        date,
        openingCents:daySCaisseCompteeCents,
        toWithdrawCents:dayToWithdrawCents,
        withdrawnCents:Number(management.withdrawnCents || 0),
        depositsCents:Number(management.depositsCents || 0),
        expensesCents:dayExpenses,
        closingRealCents:dayClosingReal,
        previousClosingRealCents:dayPreviousClosingRealCents,
        sameDayClosingRealCents:daySameClosingRealCents,
        totalSalesCents:dayTotalSales,
        salesCashCents:daySalesCash,
        creditSalesCents:Number(management.creditSalesCents || 0),
        atmSalesCents:Number(management.atmSalesCents || 0),
        creditSettlementCents:Number(management.creditSettlementCents || 0),
        closingCalculatedCents:dayClosingCalculated,
        shortageCents:Math.max(0, dayClosingCalculated - daySameClosingRealCents),
        surplusCents:Math.max(0, daySameClosingRealCents - dayClosingCalculated)
      };
    })
    .filter(item=>[
      item.openingCents,
      item.toWithdrawCents,
      item.withdrawnCents,
      item.depositsCents,
      item.closingRealCents,
      item.totalSalesCents,
      item.salesCashCents,
      item.creditSalesCents,
      item.atmSalesCents,
      item.creditSettlementCents,
      item.expensesCents,
      item.closingCalculatedCents,
      item.shortageCents,
      item.surplusCents
    ].some(value=>Math.abs(Number(value) || 0) > 0))
    .sort((a,b)=>b.date.localeCompare(a.date)), [store,managementMonth]);

  const managementRowsPerPage = 5;
  const managementPageCount = Math.max(1, Math.ceil(managementHistory.length / managementRowsPerPage));
  const currentManagementPage = Math.min(managementPage, managementPageCount - 1);
  const pagedManagementHistory = managementHistory.slice(currentManagementPage * managementRowsPerPage, (currentManagementPage + 1) * managementRowsPerPage);

  const expenseHistory = useMemo(()=>Object.entries(store)
    .filter(([date])=>date.startsWith(expensesMonth))
    .flatMap(([date,day])=>((Array.isArray(day?.expenses) ? day.expenses : [])
      .map(normalizeExpenseRow)
      .filter(e=>e.label || e.amountCents || e.type || e.employeeId || e.invoiceId || e.note)
      .map(e=>({date,...e}))))
    .sort((a,b)=>b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))), [store,expensesMonth]);

  const expenseRowsPerPage = 5;
  const expensePageCount = Math.max(1, Math.ceil(expenseHistory.length / expenseRowsPerPage));
  const currentExpensePage = Math.min(expensesPage, expensePageCount - 1);
  const pagedExpenseHistory = expenseHistory.slice(currentExpensePage * expenseRowsPerPage, (currentExpensePage + 1) * expenseRowsPerPage);

  const managementMonthDays = new Date(Number((managementMonth || todayMonthISO()).slice(0,4)), Number((managementMonth || todayMonthISO()).slice(5,7)), 0).getDate();
  const managementCurrentBalanceCents = managementHistory[0]?.closingRealCents || 0;
  const managementTotalWithdrawnCents = managementHistory.reduce((sum,item)=>sum + (Number(item.withdrawnCents) || 0),0);
  const managementActiveDays = managementHistory.length;
  const expenseMonthTotalCents = expenseHistory.reduce((sum,item)=>sum + (Number(item.amountCents) || 0),0);
  const expenseValidatedCount = expenseHistory.length;
  const expenseLastEntry = expenseHistory[0] || null;

  useEffect(()=>{
    setManagementPage(0);
  },[managementMonth]);

  useEffect(()=>{
    setExpensesPage(0);
  },[expensesMonth]);

  return <section className="cashRegisterPage">
    <div className="cashRegisterHeader">
      <div>
        <h1>Tables de caisse</h1>
        <p>Calculez la cash dans la caisse par billets/pièces, date, dépenses et écart de caisse.</p>
      </div>
      <div className="cashHeaderActions">
        <button type="button" onClick={exportCashCSV}><DashIcon name="download"/> Export CSV</button>
        <button type="button" className="cashResetBtn" onClick={resetDay}><DashIcon name="trash"/> Reset</button>
      </div>
    </div>

    <div className="cashRegisterPanel">
      <div className="cashTabs">
        <button type="button" className={active==="exchange" ? "active" : ""} onClick={()=>setActive("exchange")}>Monnaie d’échange</button>
        <button type="button" className={active==="management" ? "active" : ""} onClick={()=>setActive("management")}>Gestion de caisse</button>
        <button type="button" className={active==="expenses" ? "active" : ""} onClick={()=>setActive("expenses")}>Dépenses</button>
      </div>

      {active==="exchange" && <div className="cashDateBar">
        <div className="cashDateBarGroup">
          <span>Date de caisse</span>
          <button type="button" onClick={()=>setCashDate(shiftISODate(cashDate,-1))}>‹</button>
          <input type="date" value={cashDate} onChange={e=>setCashDate(e.target.value || todayISO())}/>
          <button type="button" onClick={()=>setCashDate(shiftISODate(cashDate,1))}>›</button>
          <button type="button" className="cashDateTodayBtn" onClick={()=>setCashDate(todayISO())}>Aujourd’hui</button>
        </div>
      </div>}

      <div className={active==="exchange" ? "cashMainGrid" : "cashMainGrid cashMainGridSingle"}>
        <div className="cashTableWrap">
          {active==="exchange" && <div className="cashExchangeSections">
            <section className="cashExchangeSection">
              <div className="cashSectionTitleRow">
                <div className="cashSectionTitleIcon"><DashIcon name="cash"/></div>
                <div>
                  <h2>Billets</h2>
                  <p>Comptage des billets enregistrés dans la caisse.</p>
                </div>
              </div>
              <table className="cashTable cashCountTable">
                <thead><tr><th>Dénomination</th><th>Quantité</th><th>Sous-total</th></tr></thead>
                <tbody>
                  {billDenominations.map(d=>{
                    const qty=Number(current.quantities[d.cents] || 0);
                    return <tr key={d.cents}>
                      <td>{d.label}</td>
                      <td><input className="qtyInput" type="number" min="0" step="1" value={qty} onChange={e=>updateQuantity(d.cents,e.target.value)}/></td>
                      <td>{formatDH(qty * d.cents)}</td>
                    </tr>
                  })}
                </tbody>
              </table>
            </section>

            <section className="cashExchangeSection">
              <div className="cashSectionTitleRow">
                <div className="cashSectionTitleIcon"><DashIcon name="clock"/></div>
                <div>
                  <h2>Pièces</h2>
                  <p>Comptage des pièces disponibles dans la caisse.</p>
                </div>
              </div>
              <table className="cashTable cashCountTable">
                <thead><tr><th>Dénomination</th><th>Quantité</th><th>Sous-total</th></tr></thead>
                <tbody>
                  {coinDenominations.map(d=>{
                    const qty=Number(current.quantities[d.cents] || 0);
                    return <tr key={d.cents}>
                      <td>{d.label}</td>
                      <td><input className="qtyInput" type="number" min="0" step="1" value={qty} onChange={e=>updateQuantity(d.cents,e.target.value)}/></td>
                      <td>{formatDH(qty * d.cents)}</td>
                    </tr>
                  })}
                </tbody>
              </table>
            </section>
          </div>}

                    {active==="management" && <>
            <section className="cashManagementSection cashManagementHistorySection">
              <div className="cashSectionHeading cashSectionHeadingHistory">
                <div>
                  <h2>Historique de caisse</h2>
                  <p>Consultez l’historique quotidien de votre caisse. Les montants sont calculés automatiquement à partir des opérations enregistrées.</p>
                </div>
              </div>
              <div className="cashInfoBanner"><DashIcon name="doc"/><span>Affichage mensuel de la gestion de caisse avec calcul automatique des indicateurs.</span></div>
              <div className="expenseHistoryTopbar">
                <div className="cashHistoryToolbarTitle">Période</div>
                <div className="expenseMonthBar">
                  <button type="button" onClick={()=>setManagementMonth(shiftISOMonth(managementMonth,-1))}>‹</button>
                  <div className="expenseMonthValue">{formatMonthLabel(managementMonth)}</div>
                  <button type="button" onClick={()=>setManagementMonth(shiftISOMonth(managementMonth,1))}>›</button>
                  <input type="month" value={managementMonth} onChange={e=>setManagementMonth(e.target.value || todayMonthISO())}/>
                </div>
              </div>

              <div className="cashWideTableWrap">
                <table className="cashTable managementHistoryTable">
                  <thead><tr><th>Date</th><th>Dépôt / ajout</th><th>Dépenses</th><th>Total de Vente par jour</th><th>Tot. vente en espèce</th><th>Tot. vente type crédit</th><th>Tot. vente type ATM</th><th>Réglement crédit</th><th>À retirer (théorique)</th><th>Retiré (réel)</th><th>Nouvelle C. fermeture</th><th>Montant manquant</th><th>Montant surplus</th><th>C. fermeture (compté)</th><th>C. fermeture (théorique)</th></tr></thead>
                  <tbody>
                    {pagedManagementHistory.length ? pagedManagementHistory.map(item=><tr key={item.date}>
                      <td>{item.date}</td>
                      <td>{formatDH(item.depositsCents)}</td>
                      <td>{formatDH(item.expensesCents)}</td>
                      <td>{formatDH(item.totalSalesCents)}</td>
                      <td>{formatDH(item.salesCashCents)}</td>
                      <td>{formatDH(item.creditSalesCents)}</td>
                      <td>{formatDH(item.atmSalesCents)}</td>
                      <td>{formatDH(item.creditSettlementCents)}</td>
                      <td>{formatDH(item.toWithdrawCents)}</td>
                      <td>{formatDH(item.withdrawnCents)}</td>
                      <td>{formatDH(item.closingRealCents)}</td>
                      <td>{formatDH(item.shortageCents)}</td>
                      <td>{formatDH(item.surplusCents)}</td>
                      <td>{formatDH(item.openingCents)}</td>
                      <td>{formatDH(item.closingCalculatedCents)}</td>
                    </tr>) : <tr><td colSpan="15" className="expenseHistoryEmpty">Aucune valeur différente de 0 dans l’historique de gestion de caisse pour ce mois.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="expenseHistoryFooter">
                <span>Lignes par page :</span>
                <strong>{managementRowsPerPage}</strong>
                <span>{managementHistory.length ? `${currentManagementPage * managementRowsPerPage + 1}-${Math.min((currentManagementPage + 1) * managementRowsPerPage, managementHistory.length)} sur ${managementHistory.length}` : "0-0 sur 0"}</span>
                <div className="expensePagerButtons">
                  <button type="button" disabled={currentManagementPage===0} onClick={()=>setManagementPage(0)}>«</button>
                  <button type="button" disabled={currentManagementPage===0} onClick={()=>setManagementPage(p=>Math.max(0,p-1))}>‹</button>
                  <button type="button" disabled={currentManagementPage>=managementPageCount-1 || managementHistory.length===0} onClick={()=>setManagementPage(p=>Math.min(managementPageCount-1,p+1))}>›</button>
                  <button type="button" disabled={currentManagementPage>=managementPageCount-1 || managementHistory.length===0} onClick={()=>setManagementPage(managementPageCount-1)}>»</button>
                </div>
              </div>
            </section>
          </>}
          {active==="expenses" && <>
            <section className="cashExpensesSection cashExpenseHistorySection">
              <div className="expenseHistoryTopbar cashExpensesTopbar">
                <div>
                  <h2>Historique des dépenses</h2>
                  <p>Suivi des dépenses enregistrées par mois.</p>
                </div>
                <div className="expenseMonthBar">
                  <button type="button" onClick={()=>setExpensesMonth(shiftISOMonth(expensesMonth,-1))}>‹</button>
                  <div className="expenseMonthValue">{formatMonthLabel(expensesMonth)}</div>
                  <button type="button" onClick={()=>setExpensesMonth(shiftISOMonth(expensesMonth,1))}>›</button>
                  <input type="month" value={expensesMonth} onChange={e=>setExpensesMonth(e.target.value || todayMonthISO())}/>
                </div>
              </div>

              <div className="cashExpensesLayout">
                <div>
                  <table className="cashTable expenseHistoryTable">
                <thead><tr><th>Date</th><th>Description</th><th>Montant</th><th>Type</th><th>Employé</th><th>Facture</th></tr></thead>
                <tbody>
                  {pagedExpenseHistory.length ? pagedExpenseHistory.map(item=><tr key={`${item.date}-${item.id}`}>
                    <td>{item.date}</td>
                    <td>{item.label || "-"}</td>
                    <td>{formatDH(item.amountCents)}</td>
                    <td>{item.type || "-"}</td>
                    <td>{item.employeeId || "nan"}</td>
                    <td>{item.invoiceId || "nan"}</td>
                  </tr>) : <tr><td colSpan="6" className="expenseHistoryEmpty">Aucune dépense enregistrée pour ce mois.</td></tr>}
                </tbody>
                  </table>
                </div>
                <aside className="cashExpensesAside">
                  <div className="cashExpenseAsideCard">
                    <span>Total du mois</span>
                    <strong>{formatDH(expenseMonthTotalCents)}</strong>
                    <small>Toutes dépenses confondues</small>
                  </div>
                  <div className="cashExpenseAsideCard">
                    <span>Nombre de dépenses</span>
                    <strong>{expenseValidatedCount}</strong>
                    <small>Dépenses enregistrées</small>
                  </div>
                  <div className="cashExpenseAsideCard">
                    <span>Dernière mise à jour</span>
                    <strong>{expenseLastEntry ? expenseLastEntry.date : "-"}</strong>
                    <small>{expenseLastEntry?.label || "Aucune dépense"}</small>
                  </div>
                </aside>
              </div>

              <div className="expenseHistoryFooter">
                <span>Lignes par page :</span>
                <strong>{expenseRowsPerPage}</strong>
                <span>{expenseHistory.length ? `${currentExpensePage * expenseRowsPerPage + 1}-${Math.min((currentExpensePage + 1) * expenseRowsPerPage, expenseHistory.length)} sur ${expenseHistory.length}` : "0-0 sur 0"}</span>
                <div className="expensePagerButtons">
                  <button type="button" disabled={currentExpensePage===0} onClick={()=>setExpensesPage(0)}>«</button>
                  <button type="button" disabled={currentExpensePage===0} onClick={()=>setExpensesPage(p=>Math.max(0,p-1))}>‹</button>
                  <button type="button" disabled={currentExpensePage>=expensePageCount-1 || expenseHistory.length===0} onClick={()=>setExpensesPage(p=>Math.min(expensePageCount-1,p+1))}>›</button>
                  <button type="button" disabled={currentExpensePage>=expensePageCount-1 || expenseHistory.length===0} onClick={()=>setExpensesPage(expensePageCount-1)}>»</button>
                </div>
              </div>
            </section>
          </>}
        </div>

        {active==="exchange" && <aside className="cashTotalCard cashRecapCard">
          <div className="cashRecapHeader">
            <span>Récapitulatif</span>
            <div className="cashRecapIcon"><DashIcon name="cash"/></div>
          </div>
          <div className="cashRecapBody">
            <div className="cashRecapRow">
              <div>
                <em>Total caisse</em>
                <small>Somme des billets et pièces</small>
              </div>
              <strong>{formatDH(countedCents)}</strong>
            </div>
            <div className="cashRecapRow">
              <div>
                <em>Total attendu</em>
                <small>Montant de référence</small>
              </div>
              <strong>{formatDH(expectedCents)}</strong>
            </div>
            <div className="cashRecapRow">
              <div>
                <em>Dépenses</em>
                <small>Total des dépenses enregistrées</small>
              </div>
              <strong>{formatDH(expensesCents)}</strong>
            </div>
            <div className={`cashRecapGapCard ${gapCents>=0 ? "ok" : "warn"}`}>
              <div>
                <em>Écart</em>
                <small>{gapCents>=0 ? "Excédent de caisse" : "Montant à vérifier"}</small>
              </div>
              <strong>{formatDH(gapCents)}</strong>
            </div>
          </div>
        </aside>}
      </div>
    </div>
    {msg && <p className="success cashMsg">{msg}</p>}
    <div className="pageFooterLikeDashboard">© 2026 Smart Inventory. Tous droits réservés.</div>
  </section>
}



function hasCashDayActivity(dayData){
  const day = { ...defaultCashDay(), ...(dayData || {}), management:{...defaultCashDay().management, ...((dayData || {}).management || {})}, quantities:{...((dayData || {}).quantities || {})}, expenses:Array.isArray((dayData || {}).expenses) ? (dayData || {}).expenses.map(normalizeExpenseRow) : [] };
  const quantityActivity = CASH_DENOMINATIONS.some(d => Math.abs(Number(day.quantities[d.cents] || 0)) > 0);
  const managementKeys = [
    "openingCents",
    "totalDailySalesCents",
    "salesCashCents",
    "depositsCents",
    "withdrawalsCents",
    "refundsCents",
    "toWithdrawCents",
    "withdrawnCents",
    "creditSalesCents",
    "atmSalesCents",
    "creditSettlementCents",
    "closingRealCents"
  ];
  const managementActivity = managementKeys.some(key => Math.abs(Number(day.management[key] || 0)) > 0);
  const expenseActivity = day.expenses.some(e =>
    Math.abs(Number(e.amountCents || 0)) > 0 ||
    Boolean(String(e.label || e.note || e.type || e.employeeId || e.invoiceId || "").trim())
  );
  return quantityActivity || managementActivity || expenseActivity;
}

function buildCashDayMetrics(date, dayData, store={}){
  const day = { ...defaultCashDay(), ...(dayData || {}), management:{...defaultCashDay().management, ...((dayData || {}).management || {})}, quantities:{...((dayData || {}).quantities || {})}, expenses:Array.isArray((dayData || {}).expenses) ? (dayData || {}).expenses.map(normalizeExpenseRow) : [] };
  const countedCents = CASH_DENOMINATIONS.reduce((sum,d)=>sum + (Number(day.quantities[d.cents] || 0) * d.cents),0);
  const expensesCents = day.expenses.reduce((sum,e)=>sum + (Number(e.amountCents) || 0),0);
  const totalSalesCents = Number(day.management.totalDailySalesCents || 0);
  const salesCashCents = totalSalesCents - Number(day.management.creditSalesCents || 0) - Number(day.management.atmSalesCents || 0);
  const autoToWithdrawCents = Math.max(0, countedCents - 300000);
  const closingRealCents = getClosingRealCentsForDate(store, date);
  const previousClosingRealCents = getCalculatedCashBalanceCents((store || {})[shiftISODate(date,-1)]);
  const sameDayClosingRealCents = countedCents;
  const closingCalculatedCents = getTheoreticalClosingCentsForDate(store, date);
  const shortageCents = Math.max(0, closingCalculatedCents - sameDayClosingRealCents);
  const surplusCents = Math.max(0, sameDayClosingRealCents - closingCalculatedCents);
  const gapCents = sameDayClosingRealCents - closingCalculatedCents;
  const dueBalanceCents = Math.max(0, autoToWithdrawCents - Number(day.management.withdrawnCents || 0));
  const isBalanced = shortageCents===0 && surplusCents===0;
  return {
    date,
    countedCents,
    expensesCents,
    previousClosingRealCents,
    sameDayClosingRealCents,
    autoToWithdrawCents,
    totalSalesCents,
    closingCalculatedCents,
    closingRealCents,
    shortageCents,
    surplusCents,
    gapCents,
    dueBalanceCents,
    withdrawnCents:Number(day.management.withdrawnCents || 0),
    depositsCents:Number(day.management.depositsCents || 0),
    creditSalesCents:Number(day.management.creditSalesCents || 0),
    atmSalesCents:Number(day.management.atmSalesCents || 0),
    salesCashCents,
    isBalanced
  };
}

function CashProgressRing({value,label,subLabel}){
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference - (safe / 100) * circumference;
  return <div className="cashAdminRingWrap">
    <div className="cashAdminRing">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={radius}></circle>
        <circle cx="60" cy="60" r={radius} style={{strokeDasharray:`${circumference} ${circumference}`, strokeDashoffset:dash}}></circle>
      </svg>
      <div>
        <b>{safe.toFixed(1)}</b>
        <small>%</small>
      </div>
    </div>
    {label && <strong>{label}</strong>}
    {subLabel && <span>{subLabel}</span>}
  </div>;
}

function CashAdminCard({title, children, meta, right}){
  return <article className="cashAdminCard">
    <div className="cashAdminCardHeader">
      <h3>{title}</h3>
      <div className="cashAdminCardMeta">{meta}{right ? <span className="cashAdminCardRight">{right}</span> : null}</div>
    </div>
    <div className="cashAdminCardBody">{children}</div>
  </article>;
}

function CashDashboardAdmin(){
  const [store] = useState(()=>loadLS(LS_CASH_REGISTER,{}));
  const [cashSettings] = useState(()=>({ ...defaultCashSettings(), ...(loadLS(LS_CASH_SETTINGS,{}) || {}) }));
  const reserveCents = Number(cashSettings.reserveCents || 0);
  const dashboardToday = todayISO();
  const allDates = useMemo(()=>Object.keys(store).sort(),[store]);
  const dashboardDates = useMemo(()=>allDates.filter(date=>hasCashDayActivity(store[date])),[allDates,store]);
  const dashboardMonths = useMemo(()=>Array.from(new Set(dashboardDates.map(date=>date.slice(0,7)))).sort(),[dashboardDates]);
  const latestDate = dashboardDates.length ? dashboardDates[dashboardDates.length-1] : dashboardToday;
  const earliestDate = dashboardDates.length ? dashboardDates[0] : dashboardToday;
  const [selectedDate,setSelectedDate] = useState(latestDate);
  const selectedMonth = selectedDate.slice(0,7);
  const [resultsDates,setResultsDates] = useState(()=>({
    totalSales: latestDate,
    closingCalculated: latestDate,
    closingReal: latestDate,
    gap: latestDate
  }));

  function syncAllResultDates(date){
    setResultsDates({
      totalSales: date,
      closingCalculated: date,
      closingReal: date,
      gap: date
    });
  }

  useEffect(()=>{
    if(!selectedDate){
      setSelectedDate(latestDate);
      syncAllResultDates(latestDate);
    }
  },[selectedDate, latestDate]);

  useEffect(()=>{
    if(!selectedDate) return;
    syncAllResultDates(selectedDate);
  },[selectedDate]);

  useEffect(()=>{
    setResultsDates(prev=>({
      totalSales: prev.totalSales && dashboardDates.includes(prev.totalSales) ? prev.totalSales : latestDate,
      closingCalculated: prev.closingCalculated && dashboardDates.includes(prev.closingCalculated) ? prev.closingCalculated : latestDate,
      closingReal: prev.closingReal && dashboardDates.includes(prev.closingReal) ? prev.closingReal : latestDate,
      gap: prev.gap && dashboardDates.includes(prev.gap) ? prev.gap : latestDate
    }));
  },[latestDate, store, dashboardDates]);

  const selectedMetrics = useMemo(()=>buildCashDayMetrics(selectedDate, store[selectedDate], store),[selectedDate,store]);
  const resultMetrics = useMemo(()=>({
    totalSales: buildCashDayMetrics(resultsDates.totalSales, store[resultsDates.totalSales], store),
    closingCalculated: buildCashDayMetrics(resultsDates.closingCalculated, store[resultsDates.closingCalculated], store),
    closingReal: buildCashDayMetrics(resultsDates.closingReal, store[resultsDates.closingReal], store),
    gap: buildCashDayMetrics(resultsDates.gap, store[resultsDates.gap], store)
  }),[resultsDates, store]);
  const monthMetrics = useMemo(()=>Object.entries(store)
    .filter(([date,day])=>date.startsWith(selectedMonth) && hasCashDayActivity(day))
    .map(([date,day])=>buildCashDayMetrics(date, day, store))
    .sort((a,b)=>b.date.localeCompare(a.date)), [store,selectedMonth]);

  const monthlyShortageCents = monthMetrics.reduce((sum,x)=>sum + x.shortageCents,0);
  const monthlySurplusCents = monthMetrics.reduce((sum,x)=>sum + x.surplusCents,0);
  const monthlyExpensesCents = monthMetrics.reduce((sum,x)=>sum + x.expensesCents,0);
  const monthlyWithdrawnCents = monthMetrics.reduce((sum,x)=>sum + x.withdrawnCents,0);
  const monthlyDueBalanceCents = monthMetrics.reduce((sum,x)=>sum + x.dueBalanceCents,0);
  const monthBalancedDays = monthMetrics.filter(x=>x.isBalanced).length;
  const progressValue = monthMetrics.length ? (monthBalancedDays / monthMetrics.length) * 100 : 0;
  const monthSalesCents = monthMetrics.reduce((sum,x)=>sum + x.totalSalesCents,0);
  const expensesProgress = monthSalesCents>0 ? Math.min(100, (monthlyExpensesCents / monthSalesCents) * 100) : 0;

  function closestRegisteredDate(date){
    if(!dashboardDates.length) return date || dashboardToday;
    if(dashboardDates.includes(date)) return date;
    if(!date) return latestDate;
    const target = new Date(`${date}T00:00:00`).getTime();
    if(Number.isNaN(target)) return latestDate;
    return dashboardDates.reduce((best,current)=>{
      const bestDiff = Math.abs(new Date(`${best}T00:00:00`).getTime() - target);
      const currentDiff = Math.abs(new Date(`${current}T00:00:00`).getTime() - target);
      return currentDiff < bestDiff ? current : best;
    }, dashboardDates[0]);
  }

  function shiftDateValue(date, delta){
    if(!dashboardDates.length) return date || dashboardToday;
    const current = date || latestDate;
    const exactIndex = dashboardDates.indexOf(current);
    let nextIndex = exactIndex;
    if(exactIndex >= 0){
      nextIndex = exactIndex + delta;
    }else if(delta > 0){
      const afterIndex = dashboardDates.findIndex(d=>d > current);
      nextIndex = afterIndex >= 0 ? afterIndex : dashboardDates.length - 1;
    }else{
      nextIndex = dashboardDates.map((d,i)=>d < current ? i : -1).filter(i=>i>=0).pop();
      if(nextIndex === undefined) nextIndex = 0;
    }
    nextIndex = Math.max(0, Math.min(dashboardDates.length - 1, nextIndex));
    return dashboardDates[nextIndex];
  }

  function selectMainDate(date){
    const nextDate = closestRegisteredDate(date);
    setSelectedDate(nextDate);
    syncAllResultDates(nextDate);
  }

  function shiftSelectedDate(delta){
    const nextDate = shiftDateValue(selectedDate, delta);
    setSelectedDate(nextDate);
    syncAllResultDates(nextDate);
  }

  function updateResultDate(key,value){
    const nextDate = closestRegisteredDate(value || latestDate);
    setResultsDates(prev=>({...prev,[key]: nextDate}));
  }

  function shiftResultDate(key,delta){
    const nextDate = shiftDateValue(resultsDates[key] || latestDate, delta);
    setResultsDates(prev=>({...prev,[key]: nextDate}));
  }

  function DateOperationPicker({value,onChange,onShift,compact=false,ariaLabel="Date enregistrée"}){
    const activeDate = closestRegisteredDate(value || latestDate);
    const prevDisabled = !dashboardDates.length || activeDate <= earliestDate;
    const nextDisabled = !dashboardDates.length || activeDate >= latestDate;
    const [isOpen,setIsOpen] = useState(false);
    const [viewMonth,setViewMonth] = useState(()=>activeDate.slice(0,7));
    const pickerRef = useRef(null);
    const monthChoices = dashboardMonths.length ? dashboardMonths : [activeDate.slice(0,7)];
    const viewMonthIndex = Math.max(0, monthChoices.indexOf(viewMonth));
    const canPrevMonth = viewMonthIndex > 0;
    const canNextMonth = viewMonthIndex < monthChoices.length - 1;
    const activeMonth = activeDate.slice(0,7);
    const availableDatesInView = dashboardDates.filter(date=>date.startsWith(viewMonth));
    const availableDatesSet = new Set(availableDatesInView);

    useEffect(()=>{
      setViewMonth(activeMonth);
    },[activeMonth]);

    useEffect(()=>{
      function handleOutsideClick(event){
        if(pickerRef.current && !pickerRef.current.contains(event.target)) setIsOpen(false);
      }
      function handleEscape(event){
        if(event.key === "Escape") setIsOpen(false);
      }
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleEscape);
      return ()=>{
        document.removeEventListener("mousedown", handleOutsideClick);
        document.removeEventListener("keydown", handleEscape);
      };
    },[]);

    function openPicker(){
      setViewMonth(activeMonth);
      setIsOpen(true);
    }

    function changeMonth(delta){
      const nextIndex = Math.max(0, Math.min(monthChoices.length - 1, viewMonthIndex + delta));
      setViewMonth(monthChoices[nextIndex]);
    }

    function buildCalendarCells(){
      const [year, month] = viewMonth.split("-").map(Number);
      const firstDay = new Date(year, month - 1, 1).getDay();
      const daysInMonth = new Date(year, month, 0).getDate();
      const cells = [];
      for(let i=0;i<firstDay;i++) cells.push({type:"blank", key:`blank-${i}`});
      for(let day=1; day<=daysInMonth; day++){
        const isoDate = `${viewMonth}-${String(day).padStart(2,"0")}`;
        cells.push({
          type: availableDatesSet.has(isoDate) ? "date" : "empty",
          key: isoDate,
          day,
          isoDate,
          active: isoDate === activeDate
        });
      }
      while(cells.length % 7 !== 0) cells.push({type:"blank", key:`tail-${cells.length}`});
      return cells;
    }

    const calendarCells = buildCalendarCells();

    return <div className={compact ? "cashAdminDatePicker cashAdminDatePickerCompact" : "cashAdminDatePicker"} ref={pickerRef}>
      <button type="button" onClick={()=>onShift ? onShift(-1) : onChange(shiftDateValue(activeDate,-1))} disabled={prevDisabled} aria-label="Date enregistrée précédente">‹</button>
      <button
        type="button"
        className="cashAdminDatePickerDisplay"
        onClick={()=>isOpen ? setIsOpen(false) : openPicker()}
        disabled={!dashboardDates.length}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Cliquer pour ouvrir le calendrier des dates enregistrées."
      >
        <span>{activeDate}</span>
        <span className="cashAdminDatePickerIcon">📅</span>
      </button>
      <button type="button" onClick={()=>onShift ? onShift(1) : onChange(shiftDateValue(activeDate,1))} disabled={nextDisabled} aria-label="Date enregistrée suivante">›</button>
      {isOpen && <div className="cashAdminCalendarPopover" role="dialog" aria-label="Calendrier des dates enregistrées">
        <div className="cashAdminCalendarHeader">
          <button type="button" onClick={()=>changeMonth(-1)} disabled={!canPrevMonth} aria-label="Mois précédent">‹</button>
          <strong>{formatMonthLabel(viewMonth)}</strong>
          <button type="button" onClick={()=>changeMonth(1)} disabled={!canNextMonth} aria-label="Mois suivant">›</button>
        </div>
        <div className="cashAdminCalendarWeekdays">
          {["Su","Mo","Tu","We","Th","Fr","Sa"].map(day=><span key={day}>{day}</span>)}
        </div>
        <div className="cashAdminCalendarGrid">
          {calendarCells.map(cell=>{
            if(cell.type === "blank") return <span key={cell.key} className="cashAdminCalendarBlank" />;
            if(cell.type === "empty") return <span key={cell.key} className="cashAdminCalendarEmpty" aria-hidden="true" />;
            return <button
              type="button"
              key={cell.key}
              className={cell.active ? "cashAdminCalendarDay isActive" : "cashAdminCalendarDay"}
              onClick={()=>{
                onChange(cell.isoDate);
                setIsOpen(false);
              }}
            >
              {cell.day}
            </button>;
          })}
        </div>
        <div className="cashAdminCalendarHint">Seules les dates avec opérations enregistrées sont affichées.</div>
      </div>}
    </div>;
  }

  function resultDateMeta(key){
    return <div className="cashAdminInlineDate">
      <DateOperationPicker compact value={resultsDates[key]} onChange={date=>updateResultDate(key,date)} onShift={delta=>shiftResultDate(key,delta)} ariaLabel={`Date enregistrée pour ${key}`} />
    </div>;
  }

  function selectedDateMeta(label){
    return <div className="cashAdminInlineDate">
      <DateOperationPicker compact value={selectedDate} onChange={selectMainDate} onShift={shiftSelectedDate} ariaLabel={label} />
    </div>;
  }

  return <section className="cashAdminDashboardPage">
    <div className="cashAdminDashboardHeader">
      <div>
        <h1>Cash register dashboard</h1>
        <p>Vue admin pour consulter les dates enregistrées où des opérations de caisse existent, avec calendrier et flèches de navigation.</p>
      </div>
      <div className="cashAdminToolbar cashAdminToolbarSingle">
        <label className="cashAdminPrimaryDateControl">
          <span>Date temps réel</span>
          <DateOperationPicker value={selectedDate} onChange={selectMainDate} onShift={shiftSelectedDate} ariaLabel="Date temps réel enregistrée" />
        </label>
      </div>
    </div>

    <div className="cashAdminGrid cashAdminGridTop">
      <CashAdminCard title="Balance due progress" meta={<span>{monthMetrics.length} date(s) enregistrée(s)</span>}>
        <CashProgressRing value={progressValue} label="Jours équilibrés" subLabel={`${monthBalancedDays}/${monthMetrics.length || 0}`} />
      </CashAdminCard>

      <CashAdminCard title="Real time CR balance" meta={selectedDateMeta("Date temps réel enregistrée pour Real time CR balance")} right="SD">
        <div className="cashAdminBigMetric">
          <small>DH</small>
          <b>{((selectedMetrics.countedCents || 0) / 100).toFixed(1)}</b>
        </div>
      </CashAdminCard>

      <CashAdminCard title="Tot. montant manquant" meta={<span>dates enregistrées · {formatMonthLabel(selectedMonth)}</span>} right="📅">
        <div className="cashAdminMainValue"><small>DH</small><b>{(monthlyShortageCents/100).toFixed(1)}</b></div>
      </CashAdminCard>

      <CashAdminCard title="Tot. montant surplus" meta={<span>dates enregistrées · {formatMonthLabel(selectedMonth)}</span>} right="📅">
        <div className="cashAdminMainValue"><small>DH</small><b>{(monthlySurplusCents/100).toFixed(1)}</b></div>
      </CashAdminCard>

      <CashAdminCard title="Tot. dépenses" meta={<span>{formatMonthLabel(selectedMonth)}</span>}>
        <CashProgressRing value={expensesProgress} label={formatDH(monthlyExpensesCents)} subLabel={monthSalesCents ? `${Math.round(expensesProgress)}% des ventes` : "Aucune vente"} />
      </CashAdminCard>
    </div>

    <div className="cashAdminGrid cashAdminGridBottom">
      <CashAdminCard title="Balance due" meta={selectedDateMeta("Date enregistrée pour Balance due")} right="SD">
        <div className="cashAdminMainValue"><small>DH</small><b>{(selectedMetrics.dueBalanceCents/100).toFixed(1)}</b></div>
      </CashAdminCard>

      <CashAdminCard title="Montant manquant" meta={selectedDateMeta("Date enregistrée pour Montant manquant")} right="SD">
        <div className="cashAdminMainValue"><small>DH</small><b>{(selectedMetrics.shortageCents/100).toFixed(1)}</b></div>
      </CashAdminCard>

      <CashAdminCard title="Montant surplus" meta={selectedDateMeta("Date enregistrée pour Montant surplus")} right="SD">
        <div className="cashAdminMainValue"><small>DH</small><b>{(selectedMetrics.surplusCents/100).toFixed(1)}</b></div>
      </CashAdminCard>

      <CashAdminCard title="Retiré" meta={selectedDateMeta("Date enregistrée pour Retiré")}>
        <div className="cashAdminMainValue"><small>DH</small><b>{(selectedMetrics.withdrawnCents/100).toFixed(1)}</b></div>
      </CashAdminCard>

      <CashAdminCard title="Dépenses" meta={<span>{formatMonthLabel(selectedMonth)}</span>}>
        <div className="cashAdminMainValue"><small>DH</small><b>{Math.round(monthlyExpensesCents/100)}</b></div>
      </CashAdminCard>
    </div>

    <div className="cashAdminGrid cashAdminGridResults">
      <CashAdminCard title="Tot. vente" meta={resultDateMeta("totalSales")} right="=">
        <div className="cashAdminMainValue"><small>DH</small><b>{(resultMetrics.totalSales.totalSalesCents/100).toFixed(1)}</b></div>
      </CashAdminCard>

      <CashAdminCard title="C. fermeture (théorique)" meta={resultDateMeta("closingCalculated")} right="=">
        <div className="cashAdminMainValue"><small>DH</small><b>{(resultMetrics.closingCalculated.closingCalculatedCents/100).toFixed(1)}</b></div>
      </CashAdminCard>

      <CashAdminCard title="Nouvelle C. fermeture" meta={resultDateMeta("closingReal")} right="=">
        <div className="cashAdminMainValue"><small>DH</small><b>{(resultMetrics.closingReal.closingRealCents/100).toFixed(1)}</b></div>
      </CashAdminCard>

      <CashAdminCard title="Écart cash comptée vs calculée" meta={resultDateMeta("gap")} right="Δ">
        <div className="cashAdminMainValue"><small>DH</small><b>{(resultMetrics.gap.gapCents/100).toFixed(1)}</b></div>
      </CashAdminCard>
    </div>

    <div className="cashAdminBottomNote">© 2026 Smart Inventory. Tous droits réservés.</div>
  </section>;
}



const SHUFFLE_HOME_CSS = "@import url(\"https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap\");\n/*! tailwindcss v4.1.8 | MIT License | https://tailwindcss.com */\n@layer properties;\n@layer theme, base, components, utilities;\n@layer theme {\n  :root, :host {\n    --font-sans: ui-sans-serif, system-ui, sans-serif, \"Apple Color Emoji\",\n      \"Segoe UI Emoji\", \"Segoe UI Symbol\", \"Noto Color Emoji\";\n    --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\",\n      \"Courier New\", monospace;\n    --color-amber-50: oklch(98.7% 0.022 95.277);\n    --color-amber-400: oklch(82.8% 0.189 84.429);\n    --color-amber-600: oklch(66.6% 0.179 58.318);\n    --color-emerald-50: oklch(97.9% 0.021 166.113);\n    --color-emerald-100: oklch(95% 0.052 163.051);\n    --color-emerald-400: oklch(76.5% 0.177 163.223);\n    --color-emerald-600: oklch(59.6% 0.145 163.225);\n    --color-emerald-800: oklch(43.2% 0.095 166.913);\n    --color-indigo-50: oklch(96.2% 0.018 272.314);\n    --color-indigo-100: oklch(93% 0.034 272.788);\n    --color-indigo-300: oklch(78.5% 0.115 274.713);\n    --color-indigo-500: oklch(58.5% 0.233 277.117);\n    --color-indigo-600: oklch(51.1% 0.262 276.966);\n    --color-indigo-700: oklch(45.7% 0.24 277.023);\n    --color-indigo-800: oklch(39.8% 0.195 277.366);\n    --color-rose-50: oklch(96.9% 0.015 12.422);\n    --color-rose-100: oklch(94.1% 0.03 12.58);\n    --color-rose-400: oklch(71.2% 0.194 13.428);\n    --color-rose-600: oklch(58.6% 0.253 17.585);\n    --color-rose-800: oklch(45.5% 0.188 13.697);\n    --color-slate-50: oklch(98.4% 0.003 247.858);\n    --color-slate-100: oklch(96.8% 0.007 247.896);\n    --color-slate-200: oklch(92.9% 0.013 255.508);\n    --color-slate-300: oklch(86.9% 0.022 252.894);\n    --color-slate-400: oklch(70.4% 0.04 256.788);\n    --color-slate-500: oklch(55.4% 0.046 257.417);\n    --color-slate-600: oklch(44.6% 0.043 257.281);\n    --color-slate-700: oklch(37.2% 0.044 257.287);\n    --color-slate-800: oklch(27.9% 0.041 260.031);\n    --color-slate-900: oklch(20.8% 0.042 265.755);\n    --color-white: #fff;\n    --spacing: 0.25rem;\n    --container-2xl: 42rem;\n    --container-4xl: 56rem;\n    --container-5xl: 64rem;\n    --container-7xl: 80rem;\n    --text-xs: 0.75rem;\n    --text-xs--line-height: calc(1 / 0.75);\n    --text-sm: 0.875rem;\n    --text-sm--line-height: calc(1.25 / 0.875);\n    --text-base: 1rem;\n    --text-base--line-height: calc(1.5 / 1);\n    --text-lg: 1.125rem;\n    --text-lg--line-height: calc(1.75 / 1.125);\n    --text-xl: 1.25rem;\n    --text-xl--line-height: calc(1.75 / 1.25);\n    --text-3xl: 1.875rem;\n    --text-3xl--line-height: calc(2.25 / 1.875);\n    --text-4xl: 2.25rem;\n    --text-4xl--line-height: calc(2.5 / 2.25);\n    --text-5xl: 3rem;\n    --text-5xl--line-height: 1;\n    --text-6xl: 3.75rem;\n    --text-6xl--line-height: 1;\n    --font-weight-medium: 500;\n    --font-weight-semibold: 600;\n    --font-weight-bold: 700;\n    --font-weight-extrabold: 800;\n    --tracking-tight: -0.025em;\n    --tracking-wider: 0.05em;\n    --tracking-widest: 0.1em;\n    --leading-tight: 1.25;\n    --leading-relaxed: 1.625;\n    --radius-lg: 0.5rem;\n    --radius-xl: 0.75rem;\n    --radius-2xl: 1rem;\n    --animate-pulse: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;\n    --blur-md: 12px;\n    --blur-3xl: 64px;\n    --default-transition-duration: 150ms;\n    --default-transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);\n    --default-font-family: var(--font-sans);\n    --default-mono-font-family: var(--font-mono);\n    --font-body: \"Plus Jakarta Sans\";\n    --font-heading: Outfit;\n  }\n}\n@layer base {\n  *, ::after, ::before, ::backdrop, ::file-selector-button {\n    box-sizing: border-box;\n    margin: 0;\n    padding: 0;\n    border: 0 solid;\n  }\n  html, :host {\n    line-height: 1.5;\n    -webkit-text-size-adjust: 100%;\n    tab-size: 4;\n    font-family: var(--default-font-family, ui-sans-serif, system-ui, sans-serif, \"Apple Color Emoji\", \"Segoe UI Emoji\", \"Segoe UI Symbol\", \"Noto Color Emoji\");\n    font-feature-settings: var(--default-font-feature-settings, normal);\n    font-variation-settings: var(--default-font-variation-settings, normal);\n    -webkit-tap-highlight-color: transparent;\n  }\n  hr {\n    height: 0;\n    color: inherit;\n    border-top-width: 1px;\n  }\n  abbr:where([title]) {\n    -webkit-text-decoration: underline dotted;\n    text-decoration: underline dotted;\n  }\n  h1, h2, h3, h4, h5, h6 {\n    font-size: inherit;\n    font-weight: inherit;\n  }\n  a {\n    color: inherit;\n    -webkit-text-decoration: inherit;\n    text-decoration: inherit;\n  }\n  b, strong {\n    font-weight: bolder;\n  }\n  code, kbd, samp, pre {\n    font-family: var(--default-mono-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace);\n    font-feature-settings: var(--default-mono-font-feature-settings, normal);\n    font-variation-settings: var(--default-mono-font-variation-settings, normal);\n    font-size: 1em;\n  }\n  small {\n    font-size: 80%;\n  }\n  sub, sup {\n    font-size: 75%;\n    line-height: 0;\n    position: relative;\n    vertical-align: baseline;\n  }\n  sub {\n    bottom: -0.25em;\n  }\n  sup {\n    top: -0.5em;\n  }\n  table {\n    text-indent: 0;\n    border-color: inherit;\n    border-collapse: collapse;\n  }\n  :-moz-focusring {\n    outline: auto;\n  }\n  progress {\n    vertical-align: baseline;\n  }\n  summary {\n    display: list-item;\n  }\n  ol, ul, menu {\n    list-style: none;\n  }\n  img, svg, video, canvas, audio, iframe, embed, object {\n    display: block;\n    vertical-align: middle;\n  }\n  img, video {\n    max-width: 100%;\n    height: auto;\n  }\n  button, input, select, optgroup, textarea, ::file-selector-button {\n    font: inherit;\n    font-feature-settings: inherit;\n    font-variation-settings: inherit;\n    letter-spacing: inherit;\n    color: inherit;\n    border-radius: 0;\n    background-color: transparent;\n    opacity: 1;\n  }\n  :where(select:is([multiple], [size])) optgroup {\n    font-weight: bolder;\n  }\n  :where(select:is([multiple], [size])) optgroup option {\n    padding-inline-start: 20px;\n  }\n  ::file-selector-button {\n    margin-inline-end: 4px;\n  }\n  ::placeholder {\n    opacity: 1;\n  }\n  @supports (not (-webkit-appearance: -apple-pay-button))  or (contain-intrinsic-size: 1px) {\n    ::placeholder {\n      color: currentcolor;\n      @supports (color: color-mix(in lab, red, red)) {\n        color: color-mix(in oklab, currentcolor 50%, transparent);\n      }\n    }\n  }\n  textarea {\n    resize: vertical;\n  }\n  ::-webkit-search-decoration {\n    -webkit-appearance: none;\n  }\n  ::-webkit-date-and-time-value {\n    min-height: 1lh;\n    text-align: inherit;\n  }\n  ::-webkit-datetime-edit {\n    display: inline-flex;\n  }\n  ::-webkit-datetime-edit-fields-wrapper {\n    padding: 0;\n  }\n  ::-webkit-datetime-edit, ::-webkit-datetime-edit-year-field, ::-webkit-datetime-edit-month-field, ::-webkit-datetime-edit-day-field, ::-webkit-datetime-edit-hour-field, ::-webkit-datetime-edit-minute-field, ::-webkit-datetime-edit-second-field, ::-webkit-datetime-edit-millisecond-field, ::-webkit-datetime-edit-meridiem-field {\n    padding-block: 0;\n  }\n  :-moz-ui-invalid {\n    box-shadow: none;\n  }\n  button, input:where([type=\"button\"], [type=\"reset\"], [type=\"submit\"]), ::file-selector-button {\n    appearance: button;\n  }\n  ::-webkit-inner-spin-button, ::-webkit-outer-spin-button {\n    height: auto;\n  }\n  [hidden]:where(:not([hidden=\"until-found\"])) {\n    display: none !important;\n  }\n}\n@layer utilities {\n  .absolute {\n    position: absolute;\n  }\n  .relative {\n    position: relative;\n  }\n  .sticky {\n    position: sticky;\n  }\n  .top-0 {\n    top: calc(var(--spacing) * 0);\n  }\n  .right-0 {\n    right: calc(var(--spacing) * 0);\n  }\n  .z-50 {\n    z-index: 50;\n  }\n  .mx-auto {\n    margin-inline: auto;\n  }\n  .mt-0\\.5 {\n    margin-top: calc(var(--spacing) * 0.5);\n  }\n  .mt-1 {\n    margin-top: calc(var(--spacing) * 1);\n  }\n  .mt-4 {\n    margin-top: calc(var(--spacing) * 4);\n  }\n  .mt-6 {\n    margin-top: calc(var(--spacing) * 6);\n  }\n  .mt-10 {\n    margin-top: calc(var(--spacing) * 10);\n  }\n  .mb-1 {\n    margin-bottom: calc(var(--spacing) * 1);\n  }\n  .mb-2 {\n    margin-bottom: calc(var(--spacing) * 2);\n  }\n  .mb-3 {\n    margin-bottom: calc(var(--spacing) * 3);\n  }\n  .mb-6 {\n    margin-bottom: calc(var(--spacing) * 6);\n  }\n  .ml-4 {\n    margin-left: calc(var(--spacing) * 4);\n  }\n  .block {\n    display: block;\n  }\n  .flex {\n    display: flex;\n  }\n  .grid {\n    display: grid;\n  }\n  .hidden {\n    display: none;\n  }\n  .inline-block {\n    display: inline-block;\n  }\n  .inline-flex {\n    display: inline-flex;\n  }\n  .h-1\\.5 {\n    height: calc(var(--spacing) * 1.5);\n  }\n  .h-2 {\n    height: calc(var(--spacing) * 2);\n  }\n  .h-3 {\n    height: calc(var(--spacing) * 3);\n  }\n  .h-3\\.5 {\n    height: calc(var(--spacing) * 3.5);\n  }\n  .h-4 {\n    height: calc(var(--spacing) * 4);\n  }\n  .h-5 {\n    height: calc(var(--spacing) * 5);\n  }\n  .h-8 {\n    height: calc(var(--spacing) * 8);\n  }\n  .h-10 {\n    height: calc(var(--spacing) * 10);\n  }\n  .h-64 {\n    height: calc(var(--spacing) * 64);\n  }\n  .w-1\\.5 {\n    width: calc(var(--spacing) * 1.5);\n  }\n  .w-2 {\n    width: calc(var(--spacing) * 2);\n  }\n  .w-3 {\n    width: calc(var(--spacing) * 3);\n  }\n  .w-3\\.5 {\n    width: calc(var(--spacing) * 3.5);\n  }\n  .w-4 {\n    width: calc(var(--spacing) * 4);\n  }\n  .w-5 {\n    width: calc(var(--spacing) * 5);\n  }\n  .w-8 {\n    width: calc(var(--spacing) * 8);\n  }\n  .w-10 {\n    width: calc(var(--spacing) * 10);\n  }\n  .w-64 {\n    width: calc(var(--spacing) * 64);\n  }\n  .w-full {\n    width: 100%;\n  }\n  .max-w-2xl {\n    max-width: var(--container-2xl);\n  }\n  .max-w-4xl {\n    max-width: var(--container-4xl);\n  }\n  .max-w-5xl {\n    max-width: var(--container-5xl);\n  }\n  .max-w-7xl {\n    max-width: var(--container-7xl);\n  }\n  .shrink-0 {\n    flex-shrink: 0;\n  }\n  .animate-pulse {\n    animation: var(--animate-pulse);\n  }\n  .grid-cols-1 {\n    grid-template-columns: repeat(1, minmax(0, 1fr));\n  }\n  .grid-cols-2 {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n  .flex-col {\n    flex-direction: column;\n  }\n  .flex-wrap {\n    flex-wrap: wrap;\n  }\n  .items-center {\n    align-items: center;\n  }\n  .items-start {\n    align-items: flex-start;\n  }\n  .justify-between {\n    justify-content: space-between;\n  }\n  .justify-center {\n    justify-content: center;\n  }\n  .gap-1\\.5 {\n    gap: calc(var(--spacing) * 1.5);\n  }\n  .gap-2 {\n    gap: calc(var(--spacing) * 2);\n  }\n  .gap-3 {\n    gap: calc(var(--spacing) * 3);\n  }\n  .gap-3\\.5 {\n    gap: calc(var(--spacing) * 3.5);\n  }\n  .gap-4 {\n    gap: calc(var(--spacing) * 4);\n  }\n  .gap-6 {\n    gap: calc(var(--spacing) * 6);\n  }\n  .gap-8 {\n    gap: calc(var(--spacing) * 8);\n  }\n  .gap-12 {\n    gap: calc(var(--spacing) * 12);\n  }\n  .space-y-2 {\n    :where(& > :not(:last-child)) {\n      --tw-space-y-reverse: 0;\n      margin-block-start: calc(calc(var(--spacing) * 2) * var(--tw-space-y-reverse));\n      margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - var(--tw-space-y-reverse)));\n    }\n  }\n  .space-y-4 {\n    :where(& > :not(:last-child)) {\n      --tw-space-y-reverse: 0;\n      margin-block-start: calc(calc(var(--spacing) * 4) * var(--tw-space-y-reverse));\n      margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - var(--tw-space-y-reverse)));\n    }\n  }\n  .space-y-6 {\n    :where(& > :not(:last-child)) {\n      --tw-space-y-reverse: 0;\n      margin-block-start: calc(calc(var(--spacing) * 6) * var(--tw-space-y-reverse));\n      margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - var(--tw-space-y-reverse)));\n    }\n  }\n  .space-y-8 {\n    :where(& > :not(:last-child)) {\n      --tw-space-y-reverse: 0;\n      margin-block-start: calc(calc(var(--spacing) * 8) * var(--tw-space-y-reverse));\n      margin-block-end: calc(calc(var(--spacing) * 8) * calc(1 - var(--tw-space-y-reverse)));\n    }\n  }\n  .space-y-12 {\n    :where(& > :not(:last-child)) {\n      --tw-space-y-reverse: 0;\n      margin-block-start: calc(calc(var(--spacing) * 12) * var(--tw-space-y-reverse));\n      margin-block-end: calc(calc(var(--spacing) * 12) * calc(1 - var(--tw-space-y-reverse)));\n    }\n  }\n  .overflow-hidden {\n    overflow: hidden;\n  }\n  .rounded {\n    border-radius: 0.25rem;\n  }\n  .rounded-2xl {\n    border-radius: var(--radius-2xl);\n  }\n  .rounded-full {\n    border-radius: calc(infinity * 1px);\n  }\n  .rounded-lg {\n    border-radius: var(--radius-lg);\n  }\n  .rounded-xl {\n    border-radius: var(--radius-xl);\n  }\n  .border {\n    border-style: var(--tw-border-style);\n    border-width: 1px;\n  }\n  .border-t {\n    border-top-style: var(--tw-border-style);\n    border-top-width: 1px;\n  }\n  .border-b {\n    border-bottom-style: var(--tw-border-style);\n    border-bottom-width: 1px;\n  }\n  .border-b-2 {\n    border-bottom-style: var(--tw-border-style);\n    border-bottom-width: 2px;\n  }\n  .border-emerald-100 {\n    border-color: var(--color-emerald-100);\n  }\n  .border-indigo-100 {\n    border-color: var(--color-indigo-100);\n  }\n  .border-indigo-600 {\n    border-color: var(--color-indigo-600);\n  }\n  .border-rose-100 {\n    border-color: var(--color-rose-100);\n  }\n  .border-slate-100 {\n    border-color: var(--color-slate-100);\n  }\n  .border-slate-200 {\n    border-color: var(--color-slate-200);\n  }\n  .border-slate-200\\/80 {\n    border-color: color-mix(in srgb, oklch(92.9% 0.013 255.508) 80%, transparent);\n    @supports (color: color-mix(in lab, red, red)) {\n      border-color: color-mix(in oklab, var(--color-slate-200) 80%, transparent);\n    }\n  }\n  .border-slate-600 {\n    border-color: var(--color-slate-600);\n  }\n  .border-slate-700\\/50 {\n    border-color: color-mix(in srgb, oklch(37.2% 0.044 257.287) 50%, transparent);\n    @supports (color: color-mix(in lab, red, red)) {\n      border-color: color-mix(in oklab, var(--color-slate-700) 50%, transparent);\n    }\n  }\n  .border-slate-800 {\n    border-color: var(--color-slate-800);\n  }\n  .bg-\\[\\#fafbfe\\] {\n    background-color: #fafbfe;\n  }\n  .bg-amber-50 {\n    background-color: var(--color-amber-50);\n  }\n  .bg-amber-400 {\n    background-color: var(--color-amber-400);\n  }\n  .bg-emerald-50 {\n    background-color: var(--color-emerald-50);\n  }\n  .bg-emerald-50\\/50 {\n    background-color: color-mix(in srgb, oklch(97.9% 0.021 166.113) 50%, transparent);\n    @supports (color: color-mix(in lab, red, red)) {\n      background-color: color-mix(in oklab, var(--color-emerald-50) 50%, transparent);\n    }\n  }\n  .bg-emerald-100 {\n    background-color: var(--color-emerald-100);\n  }\n  .bg-emerald-400 {\n    background-color: var(--color-emerald-400);\n  }\n  .bg-emerald-600 {\n    background-color: var(--color-emerald-600);\n  }\n  .bg-indigo-50 {\n    background-color: var(--color-indigo-50);\n  }\n  .bg-indigo-100 {\n    background-color: var(--color-indigo-100);\n  }\n  .bg-indigo-500 {\n    background-color: var(--color-indigo-500);\n  }\n  .bg-indigo-500\\/10 {\n    background-color: color-mix(in srgb, oklch(58.5% 0.233 277.117) 10%, transparent);\n    @supports (color: color-mix(in lab, red, red)) {\n      background-color: color-mix(in oklab, var(--color-indigo-500) 10%, transparent);\n    }\n  }\n  .bg-indigo-600 {\n    background-color: var(--color-indigo-600);\n  }\n  .bg-rose-50 {\n    background-color: var(--color-rose-50);\n  }\n  .bg-rose-50\\/50 {\n    background-color: color-mix(in srgb, oklch(96.9% 0.015 12.422) 50%, transparent);\n    @supports (color: color-mix(in lab, red, red)) {\n      background-color: color-mix(in oklab, var(--color-rose-50) 50%, transparent);\n    }\n  }\n  .bg-rose-400 {\n    background-color: var(--color-rose-400);\n  }\n  .bg-rose-600 {\n    background-color: var(--color-rose-600);\n  }\n  .bg-slate-50 {\n    background-color: var(--color-slate-50);\n  }\n  .bg-slate-50\\/20 {\n    background-color: color-mix(in srgb, oklch(98.4% 0.003 247.858) 20%, transparent);\n    @supports (color: color-mix(in lab, red, red)) {\n      background-color: color-mix(in oklab, var(--color-slate-50) 20%, transparent);\n    }\n  }\n  .bg-slate-50\\/40 {\n    background-color: color-mix(in srgb, oklch(98.4% 0.003 247.858) 40%, transparent);\n    @supports (color: color-mix(in lab, red, red)) {\n      background-color: color-mix(in oklab, var(--color-slate-50) 40%, transparent);\n    }\n  }\n  .bg-slate-50\\/50 {\n    background-color: color-mix(in srgb, oklch(98.4% 0.003 247.858) 50%, transparent);\n    @supports (color: color-mix(in lab, red, red)) {\n      background-color: color-mix(in oklab, var(--color-slate-50) 50%, transparent);\n    }\n  }\n  .bg-slate-100 {\n    background-color: var(--color-slate-100);\n  }\n  .bg-slate-200\\/50 {\n    background-color: color-mix(in srgb, oklch(92.9% 0.013 255.508) 50%, transparent);\n    @supports (color: color-mix(in lab, red, red)) {\n      background-color: color-mix(in oklab, var(--color-slate-200) 50%, transparent);\n    }\n  }\n  .bg-slate-800 {\n    background-color: var(--color-slate-800);\n  }\n  .bg-slate-800\\/80 {\n    background-color: color-mix(in srgb, oklch(27.9% 0.041 260.031) 80%, transparent);\n    @supports (color: color-mix(in lab, red, red)) {\n      background-color: color-mix(in oklab, var(--color-slate-800) 80%, transparent);\n    }\n  }\n  .bg-slate-900 {\n    background-color: var(--color-slate-900);\n  }\n  .bg-transparent {\n    background-color: transparent;\n  }\n  .bg-white {\n    background-color: var(--color-white);\n  }\n  .bg-white\\/80 {\n    background-color: color-mix(in srgb, #fff 80%, transparent);\n    @supports (color: color-mix(in lab, red, red)) {\n      background-color: color-mix(in oklab, var(--color-white) 80%, transparent);\n    }\n  }\n  .bg-gradient-to-b {\n    --tw-gradient-position: to bottom in oklab;\n    background-image: linear-gradient(var(--tw-gradient-stops));\n  }\n  .bg-gradient-to-r {\n    --tw-gradient-position: to right in oklab;\n    background-image: linear-gradient(var(--tw-gradient-stops));\n  }\n  .from-indigo-600 {\n    --tw-gradient-from: var(--color-indigo-600);\n    --tw-gradient-stops: var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position));\n  }\n  .from-white {\n    --tw-gradient-from: var(--color-white);\n    --tw-gradient-stops: var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position));\n  }\n  .via-\\[\\#fafbfe\\] {\n    --tw-gradient-via: #fafbfe;\n    --tw-gradient-via-stops: var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-via) var(--tw-gradient-via-position), var(--tw-gradient-to) var(--tw-gradient-to-position);\n    --tw-gradient-stops: var(--tw-gradient-via-stops);\n  }\n  .to-indigo-800 {\n    --tw-gradient-to: var(--color-indigo-800);\n    --tw-gradient-stops: var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position));\n  }\n  .to-slate-50 {\n    --tw-gradient-to: var(--color-slate-50);\n    --tw-gradient-stops: var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position));\n  }\n  .bg-clip-text {\n    background-clip: text;\n  }\n  .p-2\\.5 {\n    padding: calc(var(--spacing) * 2.5);\n  }\n  .p-4 {\n    padding: calc(var(--spacing) * 4);\n  }\n  .p-5 {\n    padding: calc(var(--spacing) * 5);\n  }\n  .p-6 {\n    padding: calc(var(--spacing) * 6);\n  }\n  .px-1\\.5 {\n    padding-inline: calc(var(--spacing) * 1.5);\n  }\n  .px-2 {\n    padding-inline: calc(var(--spacing) * 2);\n  }\n  .px-2\\.5 {\n    padding-inline: calc(var(--spacing) * 2.5);\n  }\n  .px-3 {\n    padding-inline: calc(var(--spacing) * 3);\n  }\n  .px-4 {\n    padding-inline: calc(var(--spacing) * 4);\n  }\n  .px-6 {\n    padding-inline: calc(var(--spacing) * 6);\n  }\n  .px-8 {\n    padding-inline: calc(var(--spacing) * 8);\n  }\n  .py-0\\.5 {\n    padding-block: calc(var(--spacing) * 0.5);\n  }\n  .py-1 {\n    padding-block: calc(var(--spacing) * 1);\n  }\n  .py-1\\.5 {\n    padding-block: calc(var(--spacing) * 1.5);\n  }\n  .py-2 {\n    padding-block: calc(var(--spacing) * 2);\n  }\n  .py-2\\.5 {\n    padding-block: calc(var(--spacing) * 2.5);\n  }\n  .py-3\\.5 {\n    padding-block: calc(var(--spacing) * 3.5);\n  }\n  .py-4 {\n    padding-block: calc(var(--spacing) * 4);\n  }\n  .py-12 {\n    padding-block: calc(var(--spacing) * 12);\n  }\n  .py-16 {\n    padding-block: calc(var(--spacing) * 16);\n  }\n  .py-20 {\n    padding-block: calc(var(--spacing) * 20);\n  }\n  .pt-2 {\n    padding-top: calc(var(--spacing) * 2);\n  }\n  .pt-4 {\n    padding-top: calc(var(--spacing) * 4);\n  }\n  .pt-8 {\n    padding-top: calc(var(--spacing) * 8);\n  }\n  .pb-1 {\n    padding-bottom: calc(var(--spacing) * 1);\n  }\n  .pb-4 {\n    padding-bottom: calc(var(--spacing) * 4);\n  }\n  .pb-24 {\n    padding-bottom: calc(var(--spacing) * 24);\n  }\n  .text-center {\n    text-align: center;\n  }\n  .font-body {\n    font-family: var(--font-body);\n  }\n  .font-heading {\n    font-family: var(--font-heading);\n  }\n  .font-mono {\n    font-family: var(--font-mono);\n  }\n  .font-sans {\n    font-family: var(--font-sans);\n  }\n  .text-3xl {\n    font-size: var(--text-3xl);\n    line-height: var(--tw-leading, var(--text-3xl--line-height));\n  }\n  .text-4xl {\n    font-size: var(--text-4xl);\n    line-height: var(--tw-leading, var(--text-4xl--line-height));\n  }\n  .text-base {\n    font-size: var(--text-base);\n    line-height: var(--tw-leading, var(--text-base--line-height));\n  }\n  .text-lg {\n    font-size: var(--text-lg);\n    line-height: var(--tw-leading, var(--text-lg--line-height));\n  }\n  .text-sm {\n    font-size: var(--text-sm);\n    line-height: var(--tw-leading, var(--text-sm--line-height));\n  }\n  .text-xl {\n    font-size: var(--text-xl);\n    line-height: var(--tw-leading, var(--text-xl--line-height));\n  }\n  .text-xs {\n    font-size: var(--text-xs);\n    line-height: var(--tw-leading, var(--text-xs--line-height));\n  }\n  .text-\\[10px\\] {\n    font-size: 10px;\n  }\n  .leading-relaxed {\n    --tw-leading: var(--leading-relaxed);\n    line-height: var(--leading-relaxed);\n  }\n  .leading-tight {\n    --tw-leading: var(--leading-tight);\n    line-height: var(--leading-tight);\n  }\n  .font-bold {\n    --tw-font-weight: var(--font-weight-bold);\n    font-weight: var(--font-weight-bold);\n  }\n  .font-extrabold {\n    --tw-font-weight: var(--font-weight-extrabold);\n    font-weight: var(--font-weight-extrabold);\n  }\n  .font-medium {\n    --tw-font-weight: var(--font-weight-medium);\n    font-weight: var(--font-weight-medium);\n  }\n  .font-semibold {\n    --tw-font-weight: var(--font-weight-semibold);\n    font-weight: var(--font-weight-semibold);\n  }\n  .tracking-tight {\n    --tw-tracking: var(--tracking-tight);\n    letter-spacing: var(--tracking-tight);\n  }\n  .tracking-wider {\n    --tw-tracking: var(--tracking-wider);\n    letter-spacing: var(--tracking-wider);\n  }\n  .tracking-widest {\n    --tw-tracking: var(--tracking-widest);\n    letter-spacing: var(--tracking-widest);\n  }\n  .text-amber-600 {\n    color: var(--color-amber-600);\n  }\n  .text-emerald-600 {\n    color: var(--color-emerald-600);\n  }\n  .text-emerald-800 {\n    color: var(--color-emerald-800);\n  }\n  .text-indigo-300 {\n    color: var(--color-indigo-300);\n  }\n  .text-indigo-600 {\n    color: var(--color-indigo-600);\n  }\n  .text-indigo-700 {\n    color: var(--color-indigo-700);\n  }\n  .text-rose-600 {\n    color: var(--color-rose-600);\n  }\n  .text-rose-800 {\n    color: var(--color-rose-800);\n  }\n  .text-slate-200 {\n    color: var(--color-slate-200);\n  }\n  .text-slate-300 {\n    color: var(--color-slate-300);\n  }\n  .text-slate-400 {\n    color: var(--color-slate-400);\n  }\n  .text-slate-500 {\n    color: var(--color-slate-500);\n  }\n  .text-slate-600 {\n    color: var(--color-slate-600);\n  }\n  .text-slate-700 {\n    color: var(--color-slate-700);\n  }\n  .text-slate-800 {\n    color: var(--color-slate-800);\n  }\n  .text-slate-900 {\n    color: var(--color-slate-900);\n  }\n  .text-transparent {\n    color: transparent;\n  }\n  .text-white {\n    color: var(--color-white);\n  }\n  .uppercase {\n    text-transform: uppercase;\n  }\n  .antialiased {\n    -webkit-font-smoothing: antialiased;\n    -moz-osx-font-smoothing: grayscale;\n  }\n  .shadow-2xl {\n    --tw-shadow: 0 25px 50px -12px var(--tw-shadow-color, rgb(0 0 0 / 0.25));\n    box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);\n  }\n  .shadow-lg {\n    --tw-shadow: 0 10px 15px -3px var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 4px 6px -4px var(--tw-shadow-color, rgb(0 0 0 / 0.1));\n    box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);\n  }\n  .shadow-md {\n    --tw-shadow: 0 4px 6px -1px var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 2px 4px -2px var(--tw-shadow-color, rgb(0 0 0 / 0.1));\n    box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);\n  }\n  .shadow-sm {\n    --tw-shadow: 0 1px 3px 0 var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--tw-shadow-color, rgb(0 0 0 / 0.1));\n    box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);\n  }\n  .shadow-xl {\n    --tw-shadow: 0 20px 25px -5px var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 8px 10px -6px var(--tw-shadow-color, rgb(0 0 0 / 0.1));\n    box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);\n  }\n  .shadow-indigo-100 {\n    --tw-shadow-color: oklch(93% 0.034 272.788);\n    @supports (color: color-mix(in lab, red, red)) {\n      --tw-shadow-color: color-mix(in oklab, var(--color-indigo-100) var(--tw-shadow-alpha), transparent);\n    }\n  }\n  .shadow-indigo-500\\/20 {\n    --tw-shadow-color: color-mix(in srgb, oklch(58.5% 0.233 277.117) 20%, transparent);\n    @supports (color: color-mix(in lab, red, red)) {\n      --tw-shadow-color: color-mix(in oklab, color-mix(in oklab, var(--color-indigo-500) 20%, transparent) var(--tw-shadow-alpha), transparent);\n    }\n  }\n  .blur-3xl {\n    --tw-blur: blur(var(--blur-3xl));\n    filter: var(--tw-blur,) var(--tw-brightness,) var(--tw-contrast,) var(--tw-grayscale,) var(--tw-hue-rotate,) var(--tw-invert,) var(--tw-saturate,) var(--tw-sepia,) var(--tw-drop-shadow,);\n  }\n  .backdrop-blur-md {\n    --tw-backdrop-blur: blur(var(--blur-md));\n    -webkit-backdrop-filter: var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,);\n    backdrop-filter: var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,);\n  }\n  .transition-all {\n    transition-property: all;\n    transition-timing-function: var(--tw-ease, var(--default-transition-timing-function));\n    transition-duration: var(--tw-duration, var(--default-transition-duration));\n  }\n  .transition-colors {\n    transition-property: color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to;\n    transition-timing-function: var(--tw-ease, var(--default-transition-timing-function));\n    transition-duration: var(--tw-duration, var(--default-transition-duration));\n  }\n  .hover\\:border-indigo-100 {\n    &:hover {\n      @media (hover: hover) {\n        border-color: var(--color-indigo-100);\n      }\n    }\n  }\n  .hover\\:border-indigo-600 {\n    &:hover {\n      @media (hover: hover) {\n        border-color: var(--color-indigo-600);\n      }\n    }\n  }\n  .hover\\:bg-indigo-100 {\n    &:hover {\n      @media (hover: hover) {\n        background-color: var(--color-indigo-100);\n      }\n    }\n  }\n  .hover\\:bg-indigo-700 {\n    &:hover {\n      @media (hover: hover) {\n        background-color: var(--color-indigo-700);\n      }\n    }\n  }\n  .hover\\:bg-rose-100 {\n    &:hover {\n      @media (hover: hover) {\n        background-color: var(--color-rose-100);\n      }\n    }\n  }\n  .hover\\:bg-slate-50 {\n    &:hover {\n      @media (hover: hover) {\n        background-color: var(--color-slate-50);\n      }\n    }\n  }\n  .hover\\:bg-slate-200 {\n    &:hover {\n      @media (hover: hover) {\n        background-color: var(--color-slate-200);\n      }\n    }\n  }\n  .hover\\:bg-slate-700 {\n    &:hover {\n      @media (hover: hover) {\n        background-color: var(--color-slate-700);\n      }\n    }\n  }\n  .hover\\:bg-slate-800 {\n    &:hover {\n      @media (hover: hover) {\n        background-color: var(--color-slate-800);\n      }\n    }\n  }\n  .hover\\:bg-white {\n    &:hover {\n      @media (hover: hover) {\n        background-color: var(--color-white);\n      }\n    }\n  }\n  .hover\\:text-indigo-600 {\n    &:hover {\n      @media (hover: hover) {\n        color: var(--color-indigo-600);\n      }\n    }\n  }\n  .hover\\:text-slate-900 {\n    &:hover {\n      @media (hover: hover) {\n        color: var(--color-slate-900);\n      }\n    }\n  }\n  .hover\\:shadow-lg {\n    &:hover {\n      @media (hover: hover) {\n        --tw-shadow: 0 10px 15px -3px var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 4px 6px -4px var(--tw-shadow-color, rgb(0 0 0 / 0.1));\n        box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);\n      }\n    }\n  }\n  .hover\\:shadow-md {\n    &:hover {\n      @media (hover: hover) {\n        --tw-shadow: 0 4px 6px -1px var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 2px 4px -2px var(--tw-shadow-color, rgb(0 0 0 / 0.1));\n        box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);\n      }\n    }\n  }\n  .hover\\:shadow-sm {\n    &:hover {\n      @media (hover: hover) {\n        --tw-shadow: 0 1px 3px 0 var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--tw-shadow-color, rgb(0 0 0 / 0.1));\n        box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);\n      }\n    }\n  }\n  .hover\\:shadow-indigo-100 {\n    &:hover {\n      @media (hover: hover) {\n        --tw-shadow-color: oklch(93% 0.034 272.788);\n        @supports (color: color-mix(in lab, red, red)) {\n          --tw-shadow-color: color-mix(in oklab, var(--color-indigo-100) var(--tw-shadow-alpha), transparent);\n        }\n      }\n    }\n  }\n  .sm\\:inline-flex {\n    @media (width >= 40rem) {\n      display: inline-flex;\n    }\n  }\n  .sm\\:flex-row {\n    @media (width >= 40rem) {\n      flex-direction: row;\n    }\n  }\n  .sm\\:items-center {\n    @media (width >= 40rem) {\n      align-items: center;\n    }\n  }\n  .md\\:grid-cols-2 {\n    @media (width >= 48rem) {\n      grid-template-columns: repeat(2, minmax(0, 1fr));\n    }\n  }\n  .md\\:grid-cols-3 {\n    @media (width >= 48rem) {\n      grid-template-columns: repeat(3, minmax(0, 1fr));\n    }\n  }\n  .md\\:flex-row {\n    @media (width >= 48rem) {\n      flex-direction: row;\n    }\n  }\n  .md\\:p-8 {\n    @media (width >= 48rem) {\n      padding: calc(var(--spacing) * 8);\n    }\n  }\n  .md\\:px-8 {\n    @media (width >= 48rem) {\n      padding-inline: calc(var(--spacing) * 8);\n    }\n  }\n  .md\\:px-12 {\n    @media (width >= 48rem) {\n      padding-inline: calc(var(--spacing) * 12);\n    }\n  }\n  .md\\:py-24 {\n    @media (width >= 48rem) {\n      padding-block: calc(var(--spacing) * 24);\n    }\n  }\n  .md\\:text-4xl {\n    @media (width >= 48rem) {\n      font-size: var(--text-4xl);\n      line-height: var(--tw-leading, var(--text-4xl--line-height));\n    }\n  }\n  .md\\:text-5xl {\n    @media (width >= 48rem) {\n      font-size: var(--text-5xl);\n      line-height: var(--tw-leading, var(--text-5xl--line-height));\n    }\n  }\n  .md\\:text-6xl {\n    @media (width >= 48rem) {\n      font-size: var(--text-6xl);\n      line-height: var(--tw-leading, var(--text-6xl--line-height));\n    }\n  }\n  .md\\:text-lg {\n    @media (width >= 48rem) {\n      font-size: var(--text-lg);\n      line-height: var(--tw-leading, var(--text-lg--line-height));\n    }\n  }\n  .lg\\:col-span-5 {\n    @media (width >= 64rem) {\n      grid-column: span 5 / span 5;\n    }\n  }\n  .lg\\:col-span-7 {\n    @media (width >= 64rem) {\n      grid-column: span 7 / span 7;\n    }\n  }\n  .lg\\:flex {\n    @media (width >= 64rem) {\n      display: flex;\n    }\n  }\n  .lg\\:grid-cols-4 {\n    @media (width >= 64rem) {\n      grid-template-columns: repeat(4, minmax(0, 1fr));\n    }\n  }\n  .lg\\:grid-cols-6 {\n    @media (width >= 64rem) {\n      grid-template-columns: repeat(6, minmax(0, 1fr));\n    }\n  }\n  .lg\\:grid-cols-12 {\n    @media (width >= 64rem) {\n      grid-template-columns: repeat(12, minmax(0, 1fr));\n    }\n  }\n}\n@property --tw-space-y-reverse {\n  syntax: \"*\";\n  inherits: false;\n  initial-value: 0;\n}\n@property --tw-border-style {\n  syntax: \"*\";\n  inherits: false;\n  initial-value: solid;\n}\n@property --tw-gradient-position {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-gradient-from {\n  syntax: \"<color>\";\n  inherits: false;\n  initial-value: #0000;\n}\n@property --tw-gradient-via {\n  syntax: \"<color>\";\n  inherits: false;\n  initial-value: #0000;\n}\n@property --tw-gradient-to {\n  syntax: \"<color>\";\n  inherits: false;\n  initial-value: #0000;\n}\n@property --tw-gradient-stops {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-gradient-via-stops {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-gradient-from-position {\n  syntax: \"<length-percentage>\";\n  inherits: false;\n  initial-value: 0%;\n}\n@property --tw-gradient-via-position {\n  syntax: \"<length-percentage>\";\n  inherits: false;\n  initial-value: 50%;\n}\n@property --tw-gradient-to-position {\n  syntax: \"<length-percentage>\";\n  inherits: false;\n  initial-value: 100%;\n}\n@property --tw-leading {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-font-weight {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-tracking {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-shadow {\n  syntax: \"*\";\n  inherits: false;\n  initial-value: 0 0 #0000;\n}\n@property --tw-shadow-color {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-shadow-alpha {\n  syntax: \"<percentage>\";\n  inherits: false;\n  initial-value: 100%;\n}\n@property --tw-inset-shadow {\n  syntax: \"*\";\n  inherits: false;\n  initial-value: 0 0 #0000;\n}\n@property --tw-inset-shadow-color {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-inset-shadow-alpha {\n  syntax: \"<percentage>\";\n  inherits: false;\n  initial-value: 100%;\n}\n@property --tw-ring-color {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-ring-shadow {\n  syntax: \"*\";\n  inherits: false;\n  initial-value: 0 0 #0000;\n}\n@property --tw-inset-ring-color {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-inset-ring-shadow {\n  syntax: \"*\";\n  inherits: false;\n  initial-value: 0 0 #0000;\n}\n@property --tw-ring-inset {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-ring-offset-width {\n  syntax: \"<length>\";\n  inherits: false;\n  initial-value: 0px;\n}\n@property --tw-ring-offset-color {\n  syntax: \"*\";\n  inherits: false;\n  initial-value: #fff;\n}\n@property --tw-ring-offset-shadow {\n  syntax: \"*\";\n  inherits: false;\n  initial-value: 0 0 #0000;\n}\n@property --tw-blur {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-brightness {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-contrast {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-grayscale {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-hue-rotate {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-invert {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-opacity {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-saturate {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-sepia {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-drop-shadow {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-drop-shadow-color {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-drop-shadow-alpha {\n  syntax: \"<percentage>\";\n  inherits: false;\n  initial-value: 100%;\n}\n@property --tw-drop-shadow-size {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-backdrop-blur {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-backdrop-brightness {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-backdrop-contrast {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-backdrop-grayscale {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-backdrop-hue-rotate {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-backdrop-invert {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-backdrop-opacity {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-backdrop-saturate {\n  syntax: \"*\";\n  inherits: false;\n}\n@property --tw-backdrop-sepia {\n  syntax: \"*\";\n  inherits: false;\n}\n@keyframes pulse {\n  50% {\n    opacity: 0.5;\n  }\n}\n@layer properties {\n  @supports ((-webkit-hyphens: none) and (not (margin-trim: inline))) or ((-moz-orient: inline) and (not (color:rgb(from red r g b)))) {\n    *, ::before, ::after, ::backdrop {\n      --tw-space-y-reverse: 0;\n      --tw-border-style: solid;\n      --tw-gradient-position: initial;\n      --tw-gradient-from: #0000;\n      --tw-gradient-via: #0000;\n      --tw-gradient-to: #0000;\n      --tw-gradient-stops: initial;\n      --tw-gradient-via-stops: initial;\n      --tw-gradient-from-position: 0%;\n      --tw-gradient-via-position: 50%;\n      --tw-gradient-to-position: 100%;\n      --tw-leading: initial;\n      --tw-font-weight: initial;\n      --tw-tracking: initial;\n      --tw-shadow: 0 0 #0000;\n      --tw-shadow-color: initial;\n      --tw-shadow-alpha: 100%;\n      --tw-inset-shadow: 0 0 #0000;\n      --tw-inset-shadow-color: initial;\n      --tw-inset-shadow-alpha: 100%;\n      --tw-ring-color: initial;\n      --tw-ring-shadow: 0 0 #0000;\n      --tw-inset-ring-color: initial;\n      --tw-inset-ring-shadow: 0 0 #0000;\n      --tw-ring-inset: initial;\n      --tw-ring-offset-width: 0px;\n      --tw-ring-offset-color: #fff;\n      --tw-ring-offset-shadow: 0 0 #0000;\n      --tw-blur: initial;\n      --tw-brightness: initial;\n      --tw-contrast: initial;\n      --tw-grayscale: initial;\n      --tw-hue-rotate: initial;\n      --tw-invert: initial;\n      --tw-opacity: initial;\n      --tw-saturate: initial;\n      --tw-sepia: initial;\n      --tw-drop-shadow: initial;\n      --tw-drop-shadow-color: initial;\n      --tw-drop-shadow-alpha: 100%;\n      --tw-drop-shadow-size: initial;\n      --tw-backdrop-blur: initial;\n      --tw-backdrop-brightness: initial;\n      --tw-backdrop-contrast: initial;\n      --tw-backdrop-grayscale: initial;\n      --tw-backdrop-hue-rotate: initial;\n      --tw-backdrop-invert: initial;\n      --tw-backdrop-opacity: initial;\n      --tw-backdrop-saturate: initial;\n      --tw-backdrop-sepia: initial;\n    }\n  }\n}\n";
const SHUFFLE_HOME_HTML = "\n<nav class=\"border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50 py-4 px-6 md:px-12\">\n<div class=\"max-w-7xl mx-auto flex items-center justify-between\">\n<div class=\"flex items-center gap-3\">\n<div class=\"w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100\">\n<svg class=\"w-5 h-5\" fill=\"none\" stroke=\"currentColor\" viewbox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\">\n<path d=\"M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"></path>\n</svg>\n</div>\n<span class=\"font-heading font-bold text-xl tracking-tight text-slate-900\">Smart Inventory</span>\n</div>\n<div class=\"hidden lg:flex items-center gap-8\">\n<a class=\"text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors\" href=\"#dashboard\">Dashboard</a>\n<a class=\"text-sm font-medium text-indigo-600 border-b-2 border-indigo-600 pb-1\" href=\"#operations\">Op\u00e9rations</a>\n<a class=\"text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors\" href=\"#associations\">Associations</a>\n<a class=\"text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors\" href=\"#inventaire\">Inventaire</a>\n<a class=\"text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1.5\" href=\"#assistant-ai\">\n<span>Assistant AI</span>\n<span class=\"px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 font-bold rounded-full uppercase tracking-wider\">New</span>\n</a>\n</div>\n<div class=\"flex items-center gap-4\">\n<a class=\"hidden sm:inline-flex text-sm font-medium text-slate-600 hover:text-slate-900\" data-auth-link=\"true\" href=\"#login\">Connexion</a>\n<a class=\"px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-indigo-100 hover:shadow-lg\" data-auth-link=\"true\" href=\"#login\">Essai gratuit</a>\n</div>\n</div>\n</nav>\n<section class=\"py-16 md:py-24 px-6 md:px-12 bg-gradient-to-b from-white via-[#fafbfe] to-slate-50\">\n<div class=\"max-w-7xl mx-auto text-center\">\n<span class=\"inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-semibold text-indigo-700 mb-6\">\n<span class=\"w-2 h-2 rounded-full bg-indigo-600 animate-pulse\"></span>\n            Red\u00e9finir la gestion d'inventaire SaaS\n          </span>\n<h1 class=\"font-heading text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 max-w-4xl mx-auto leading-tight\">\n            Pilotez vos <span class=\"text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-indigo-800\">Op\u00e9rations de Stock</span> et de Caisse en un seul \u00e9cran\n          </h1>\n<p class=\"mt-6 text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed\">\n            Importez vos catalogues de pharmacies, automatisez les rapprochements de caisse et synchronisez votre comptabilit\u00e9 avec un tableau de bord ultra-fluide.\n          </p>\n<div class=\"mt-10 flex flex-wrap justify-center gap-4\">\n<a class=\"px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl transition-all shadow-md\" data-auth-link=\"true\" href=\"#login\">Acc\u00e9der \u00e0 l'application</a>\n<a class=\"px-6 py-3.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2\" href=\"#demo\">\n<svg class=\"w-5 h-5 text-slate-400\" fill=\"none\" stroke=\"currentColor\" viewbox=\"0 0 24 24\"><path d=\"M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"></path><path d=\"M21 12a9 9 0 11-18 0 9 9 0 0118 0z\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"></path></svg>\n              Voir la d\u00e9mo interactive\n            </a>\n</div>\n</div>\n</section>\n<section class=\"py-12 pb-24 px-4 md:px-8 bg-slate-50\" id=\"operations-panel\">\n<div class=\"max-w-7xl mx-auto\">\n<div class=\"bg-white rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden\">\n<div class=\"border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between\">\n<div class=\"flex items-center gap-2\">\n<div class=\"flex gap-1.5\">\n<span class=\"w-3 h-3 rounded-full bg-rose-400\"></span>\n<span class=\"w-3 h-3 rounded-full bg-amber-400\"></span>\n<span class=\"w-3 h-3 rounded-full bg-emerald-400\"></span>\n</div>\n<span class=\"text-xs font-semibold text-slate-500 ml-4 font-mono\">app.smartinventory.io/operations</span>\n</div>\n<div class=\"flex items-center gap-2\">\n<span class=\"text-xs text-slate-400 bg-slate-200/50 px-2 py-1 rounded\">2026 Stable</span>\n</div>\n</div>\n<div class=\"p-6 md:p-8 space-y-12\">\n<div>\n<div class=\"flex items-center gap-3 mb-6\">\n<div class=\"w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600\">\n<svg class=\"w-4 h-4\" fill=\"none\" stroke=\"currentColor\" viewbox=\"0 0 24 24\"><path d=\"M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"></path></svg>\n</div>\n<div>\n<h3 class=\"font-heading text-lg font-bold text-slate-900\">Actions Inventaire</h3>\n<p class=\"text-xs text-slate-500\">G\u00e9rez vos importations de stocks et synchronisez vos fichiers en un clic.</p>\n</div>\n</div>\n<div class=\"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4\">\n<div class=\"p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all flex flex-col justify-between\">\n<div>\n<span class=\"p-2.5 rounded-lg bg-indigo-50 text-indigo-600 inline-block mb-3\">\n<svg class=\"w-5 h-5\" fill=\"none\" stroke=\"currentColor\" viewbox=\"0 0 24 24\"><path d=\"M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"></path></svg>\n</span>\n<h4 class=\"font-semibold text-sm text-slate-900\">Importer CSV pharmacie</h4>\n<p class=\"text-xs text-slate-500 mt-1\">Mettez \u00e0 jour le catalogue complet de votre officine.</p>\n</div>\n<button class=\"mt-4 w-full py-2 bg-white border border-slate-200 hover:border-indigo-600 hover:text-indigo-600 text-xs font-semibold text-slate-700 rounded-lg transition-colors\">Choisir CSV</button>\n</div>\n<div class=\"p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all flex flex-col justify-between\">\n<div>\n<span class=\"p-2.5 rounded-lg bg-emerald-50 text-emerald-600 inline-block mb-3\">\n<svg class=\"w-5 h-5\" fill=\"none\" stroke=\"currentColor\" viewbox=\"0 0 24 24\"><path d=\"M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"></path></svg>\n</span>\n<h4 class=\"font-semibold text-sm text-slate-900\">Importer associations</h4>\n<p class=\"text-xs text-slate-500 mt-1\">Associez automatiquement vos codes barres et r\u00e9f\u00e9rences.</p>\n</div>\n<button class=\"mt-4 w-full py-2 bg-white border border-slate-200 hover:border-indigo-600 hover:text-indigo-600 text-xs font-semibold text-slate-700 rounded-lg transition-colors\">Choisir CSV</button>\n</div>\n<div class=\"p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all flex flex-col justify-between\">\n<div>\n<span class=\"p-2.5 rounded-lg bg-rose-50 text-rose-600 inline-block mb-3\">\n<svg class=\"w-5 h-5\" fill=\"none\" stroke=\"currentColor\" viewbox=\"0 0 24 24\"><path d=\"M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-16v1a3 3 0 003 3h10M9 3h6m2 5V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"></path></svg>\n</span>\n<h4 class=\"font-semibold text-sm text-slate-900\">Supprimer stock manquant</h4>\n<p class=\"text-xs text-slate-500 mt-1\">Nettoyez votre base de donn\u00e9es des entr\u00e9es obsol\u00e8tes.</p>\n</div>\n<button class=\"mt-4 w-full py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-semibold rounded-lg transition-colors\">Ex\u00e9cuter</button>\n</div>\n<div class=\"p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all flex flex-col justify-between\">\n<div>\n<span class=\"p-2.5 rounded-lg bg-amber-50 text-amber-600 inline-block mb-3\">\n<svg class=\"w-5 h-5\" fill=\"none\" stroke=\"currentColor\" viewbox=\"0 0 24 24\"><path d=\"M15 12a3 3 0 11-6 0 3 3 0 016 0z\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"></path><path d=\"M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"></path></svg>\n</span>\n<h4 class=\"font-semibold text-sm text-slate-900\">Scanner &amp; V\u00e9rifier</h4>\n<p class=\"text-xs text-slate-500 mt-1\">Contr\u00f4le rapide des \u00e9carts d'inventaire physiques.</p>\n</div>\n<button class=\"mt-4 w-full py-2 bg-white border border-slate-200 hover:border-indigo-600 hover:text-indigo-600 text-xs font-semibold text-slate-700 rounded-lg transition-colors\">Scanner</button>\n</div>\n</div>\n</div>\n<div>\n<div class=\"flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-t border-slate-100 pt-8\">\n<div class=\"flex items-center gap-3\">\n<div class=\"w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600\">\n<svg class=\"w-4 h-4\" fill=\"none\" stroke=\"currentColor\" viewbox=\"0 0 24 24\"><path d=\"M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 00-2 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"></path></svg>\n</div>\n<div>\n<h3 class=\"font-heading text-lg font-bold text-slate-900\">Op\u00e9rations de caisse</h3>\n<p class=\"text-xs text-slate-500\">Suivi des flux financiers entrants et sortants.</p>\n</div>\n</div>\n<div class=\"flex gap-3\">\n<div class=\"flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-100 bg-rose-50/50\">\n<span class=\"w-1.5 h-1.5 rounded-full bg-rose-600\"></span>\n<span class=\"text-xs text-rose-800 font-semibold\">Montant manquant: 0 DH</span>\n</div>\n<div class=\"flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-100 bg-emerald-50/50\">\n<span class=\"w-1.5 h-1.5 rounded-full bg-emerald-600\"></span>\n<span class=\"text-xs text-emerald-800 font-semibold\">Montant surplus: 0 DH</span>\n</div>\n</div>\n</div>\n<div class=\"grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3\">\n<div class=\"p-4 rounded-xl border border-slate-100 bg-slate-50/20 hover:bg-white hover:shadow-sm transition-all text-center\">\n<span class=\"text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1\">Retrait par jour</span>\n<span class=\"text-base font-bold text-slate-800 block mb-2\">- DH 0</span>\n<button class=\"px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 rounded\">D\u00e9tails</button>\n</div>\n<div class=\"p-4 rounded-xl border border-slate-100 bg-slate-50/20 hover:bg-white hover:shadow-sm transition-all text-center\">\n<span class=\"text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1\">Versement global</span>\n<span class=\"text-base font-bold text-slate-800 block mb-2\">- DH 0</span>\n<button class=\"px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 rounded\">D\u00e9tails</button>\n</div>\n<div class=\"p-4 rounded-xl border border-slate-100 bg-slate-50/20 hover:bg-white hover:shadow-sm transition-all text-center\">\n<span class=\"text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1\">Retraits Global</span>\n<span class=\"text-base font-bold text-slate-800 block mb-2\">- DH 0</span>\n<button class=\"px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 rounded\">D\u00e9tails</button>\n</div>\n<div class=\"p-4 rounded-xl border border-slate-100 bg-slate-50/20 hover:bg-white hover:shadow-sm transition-all text-center\">\n<span class=\"text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1\">B\u00e9n\u00e9fice Net</span>\n<span class=\"text-base font-bold text-slate-800 block mb-2\">+ DH 0</span>\n<button class=\"px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 rounded\">D\u00e9tails</button>\n</div>\n<div class=\"p-4 rounded-xl border border-slate-100 bg-slate-50/20 hover:bg-white hover:shadow-sm transition-all text-center\">\n<span class=\"text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1\">R\u00e8glements re\u00e7us</span>\n<span class=\"text-base font-bold text-slate-800 block mb-2\">+ DH 0</span>\n<button class=\"px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 rounded\">D\u00e9tails</button>\n</div>\n<div class=\"p-4 rounded-xl border border-slate-100 bg-slate-50/20 hover:bg-white hover:shadow-sm transition-all text-center\">\n<span class=\"text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1\">R\u00e8glements \u00e0 payer</span>\n<span class=\"text-base font-bold text-slate-800 block mb-2\">- DH 0</span>\n<button class=\"px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 rounded\">D\u00e9tails</button>\n</div>\n</div>\n</div>\n<div>\n<div class=\"flex items-center gap-3 mb-6 border-t border-slate-100 pt-8\">\n<div class=\"w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600\">\n<svg class=\"w-4 h-4\" fill=\"none\" stroke=\"currentColor\" viewbox=\"0 0 24 24\"><path d=\"M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"></path></svg>\n</div>\n<div>\n<h3 class=\"font-heading text-lg font-bold text-slate-900\">Exports et Sauvegardes locales</h3>\n<p class=\"text-xs text-slate-500\">S\u00e9curisez vos donn\u00e9es critiques et exportez vos tables au format standard.</p>\n</div>\n</div>\n<div class=\"grid grid-cols-1 md:grid-cols-3 gap-4\">\n<div class=\"p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md transition-all flex justify-between items-center\">\n<div>\n<h4 class=\"font-semibold text-sm text-slate-900\">Catalogue de produits</h4>\n<p class=\"text-xs text-slate-500 mt-0.5\">Export complet de la base articles.</p>\n</div>\n<button class=\"px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors\">Exporter</button>\n</div>\n<div class=\"p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md transition-all flex justify-between items-center\">\n<div>\n<h4 class=\"font-semibold text-sm text-slate-900\">Historique des ventes</h4>\n<p class=\"text-xs text-slate-500 mt-0.5\">Exportez toutes les sessions actives.</p>\n</div>\n<button class=\"px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors\">Exporter</button>\n</div>\n<div class=\"p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md transition-all flex justify-between items-center\">\n<div>\n<h4 class=\"font-semibold text-sm text-slate-900\">Sauvegarde Compl\u00e8te (JSON)</h4>\n<p class=\"text-xs text-slate-500 mt-0.5\">Fichier de restauration complet.</p>\n</div>\n<button class=\"px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors\">Cr\u00e9er backup</button>\n</div>\n</div>\n</div>\n</div>\n</div>\n</div>\n</section>\n<section class=\"py-20 px-6 md:px-12 bg-white\">\n<div class=\"max-w-7xl mx-auto\">\n<div class=\"grid lg:grid-cols-12 gap-12 items-center\">\n<div class=\"lg:col-span-5 space-y-6\">\n<span class=\"text-sm font-bold tracking-widest text-indigo-600 uppercase\">Algorithmes intelligents</span>\n<h2 class=\"font-heading text-3xl md:text-4xl font-extrabold text-slate-900 leading-tight\">\n                L'Assistant AI au service de votre rentabilit\u00e9\n              </h2>\n<p class=\"text-slate-600 leading-relaxed\">\n                Notre assistant intelligent analyse en continu vos historiques de vente pour anticiper les ruptures de stock, sugg\u00e9rer des ajustements de prix automatiques et optimiser vos commandes fournisseurs.\n              </p>\n<div class=\"space-y-4 pt-4\">\n<div class=\"flex items-start gap-3.5\">\n<div class=\"mt-1 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0\">\n<svg class=\"w-3.5 h-3.5\" fill=\"none\" stroke=\"currentColor\" viewbox=\"0 0 24 24\"><path d=\"M5 13l4 4L19 7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.5\"></path></svg>\n</div>\n<div>\n<h4 class=\"font-bold text-slate-900 text-sm\">D\u00e9tection intelligente d'anomalies de caisse</h4>\n<p class=\"text-xs text-slate-500 mt-0.5\">Rep\u00e9rez instantan\u00e9ment les \u00e9carts injustifi\u00e9s entre stock r\u00e9el et virtuel.</p>\n</div>\n</div>\n<div class=\"flex items-start gap-3.5\">\n<div class=\"mt-1 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0\">\n<svg class=\"w-3.5 h-3.5\" fill=\"none\" stroke=\"currentColor\" viewbox=\"0 0 24 24\"><path d=\"M5 13l4 4L19 7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.5\"></path></svg>\n</div>\n<div>\n<h4 class=\"font-bold text-slate-900 text-sm\">Recommandations pr\u00e9dictives</h4>\n<p class=\"text-xs text-slate-500 mt-0.5\">Sachez exactement quels produits commander avant la haute saison.</p>\n</div>\n</div>\n</div>\n</div>\n<div class=\"lg:col-span-7\">\n<div class=\"p-6 md:p-8 rounded-2xl bg-slate-900 text-white relative overflow-hidden shadow-2xl\">\n<div class=\"absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl\"></div>\n<div class=\"flex items-center justify-between border-b border-slate-800 pb-4 mb-6\">\n<div class=\"flex items-center gap-2\">\n<div class=\"w-3 h-3 rounded-full bg-indigo-500 animate-pulse\"></div>\n<span class=\"font-mono text-xs text-slate-400\">Assistant AI connect\u00e9</span>\n</div>\n<span class=\"text-xs px-2 py-1 bg-slate-800 rounded text-indigo-300 font-mono\">v2.4-stable</span>\n</div>\n<div class=\"space-y-4 font-mono text-sm\">\n<div class=\"text-slate-400\">&gt; Analyse des ventes de la semaine...</div>\n<div class=\"text-indigo-300\">&gt; [ALERTE] \u00c9cart de -12 unit\u00e9s d\u00e9tect\u00e9 sur la r\u00e9f\u00e9rence 'Parac\u00e9tamol 500mg'.</div>\n<div class=\"p-4 rounded-xl bg-slate-800/80 border border-slate-700/50 space-y-2\">\n<p class=\"text-xs text-slate-300 font-sans\">\"Il semblerait qu'un lot re\u00e7u le 12/03 n'ait pas \u00e9t\u00e9 scann\u00e9 \u00e0 l'entr\u00e9e. Voulez-vous que je r\u00e9gularise l'association de stock ?\"</p>\n<div class=\"flex gap-2 pt-2\">\n<button class=\"px-3 py-1.5 bg-indigo-600 text-white font-sans text-xs font-semibold rounded hover:bg-indigo-700 transition-colors\">Oui, r\u00e9gulariser</button>\n<button class=\"px-3 py-1.5 bg-transparent border border-slate-600 text-slate-300 font-sans text-xs font-semibold rounded hover:bg-slate-700 transition-colors\">Ignorer</button>\n</div>\n</div>\n</div>\n</div>\n</div>\n</div>\n</div>\n</section>\n<section class=\"py-20 px-6 md:px-12 bg-slate-900 text-white\">\n<div class=\"max-w-5xl mx-auto text-center space-y-8\">\n<h2 class=\"font-heading text-3xl md:text-5xl font-extrabold tracking-tight\">\n            Pr\u00eat \u00e0 passer \u00e0 la vitesse sup\u00e9rieure ?\n          </h2>\n<p class=\"text-slate-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed\">\n            Rejoignez les dizaines de pharmacies et commerces qui font confiance \u00e0 Smart Inventory pour s\u00e9curiser, optimiser et automatiser leur gestion quotidienne.\n          </p>\n<div class=\"pt-4 flex flex-wrap justify-center gap-4\">\n<a class=\"px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20\" data-auth-link=\"true\" href=\"#login\">Commencer l'essai gratuit de 14 jours</a>\n<a class=\"px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition-all\" href=\"#contact\">Parler \u00e0 un expert</a>\n</div>\n<p class=\"text-xs text-slate-500\">Aucune carte de cr\u00e9dit requise. Installation et synchronisation en moins de 10 minutes.</p>\n</div>\n</section>\n<footer class=\"border-t border-slate-100 bg-white py-12 px-6 md:px-12\">\n<div class=\"max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6\">\n<div class=\"flex items-center gap-3\">\n<div class=\"w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white\">\n<svg class=\"w-4 h-4\" fill=\"none\" stroke=\"currentColor\" viewbox=\"0 0 24 24\"><path d=\"M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\"></path></svg>\n</div>\n<span class=\"font-heading font-bold text-base text-slate-900\">Smart Inventory</span>\n</div>\n<div class=\"flex flex-wrap justify-center gap-8 text-sm text-slate-500\">\n<a class=\"hover:text-indigo-600 transition-colors\" href=\"#politique\">Politique de confidentialit\u00e9</a>\n<a class=\"hover:text-indigo-600 transition-colors\" href=\"#cgu\">Conditions d'utilisation</a>\n<a class=\"hover:text-indigo-600 transition-colors\" href=\"#contact\">Contact &amp; Support</a>\n</div>\n<p class=\"text-xs text-slate-400\">\u00a9 2026 Smart Inventory. Tous droits r\u00e9serv\u00e9s.</p>\n</div>\n</footer>\n";

function ShuffleExactHomepage({goLogin}){
  return <ShuffleHomepage goLogin={goLogin}/>;
}

function Login({setToken}){
  const [u,setU]=useState("demo");
  const [p,setP]=useState("demo123");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const [screen,setScreen]=useState(()=>{
    if(typeof window === "undefined") return "landing";
    return ["#login","#connexion"].includes(window.location.hash) ? "auth" : "landing";
  });

  useEffect(()=>{
    const sync=()=>setScreen(["#login","#connexion"].includes(window.location.hash) ? "auth" : "landing");
    window.addEventListener("hashchange",sync);
    sync();
    return ()=>window.removeEventListener("hashchange",sync);
  },[]);

  function goLogin(e){
    if(e) e.preventDefault();
    if(window.location.hash!=="#login") window.location.hash="login";
    setScreen("auth");
    requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"smooth"}));
  }
  function goLanding(e){
    if(e) e.preventDefault();
    history.replaceState(null,"",window.location.pathname + window.location.search);
    setScreen("landing");
    requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"smooth"}));
  }

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

  const LandingNav=()=> <nav className="shuffleLandingNav shuffleSourceNav">
    <div className="shuffleSourceNavInner">
      <a className="shuffleLandingBrand" href="#home" onClick={goLanding} aria-label="Smart Inventory accueil">
        <span className="shuffleBrandMark"><SidebarBrandIcon/></span>
        <b>Smart Inventory</b>
      </a>
      <div className="shuffleLandingLinks" aria-label="Navigation page accueil">
        <a href="#dashboard">Dashboard</a>
        <a href="#operations-panel" className="active">Opérations</a>
        <a href="#associations">Associations</a>
        <a href="#inventaire">Inventaire</a>
        <a href="#assistant-ai">Assistant AI <em>New</em></a>
      </div>
      <div className="shuffleLandingActions">
        <a className="shuffleNavGhost" href="#connexion" onClick={goLogin}>Connexion</a>
        <a className="shuffleNavCta" href="#essayer" onClick={goLogin}>Essai gratuit</a>
      </div>
    </div>
  </nav>;

  const AuthForm=()=> <form onSubmit={login} className="loginCard shuffleAuthCard">
    <SmartInventoryLogo className="loginCodeLogo"/>
    <h2>Connexion</h2>
    <p>Accédez à votre espace inventaire et caisse.</p>

    <label>Utilisateur</label>
    <input value={u} onChange={e=>setU(e.target.value)} placeholder="Utilisateur" autoComplete="username"/>

    <label>Mot de passe</label>
    <input value={p} onChange={e=>setP(e.target.value)} placeholder="Mot de passe" type="password" autoComplete="current-password"/>

    <button type="submit" className="primaryLoginBtn" disabled={loading}>{loading ? "Connexion..." : "Connexion"}</button>

    {err && <p className="err">{err}</p>}

    <div className="loginHelp">
      <small>Compte démo : demo / demo123</small><br/>
      <small>Compte admin : admin / admin123</small>
    </div>
  </form>;

  if(screen==="auth"){
    return <div className="login shufflePreviewLogin shuffleAuthOnlyPage">
      <LandingNav/>
      <main className="shuffleAuthRoute">
        <section className="shuffleAuthRouteCopy">
          <span className="shuffleHeroBadge"><i></i> Connexion sécurisée</span>
          <h1>Accédez à votre espace <strong>Smart Inventory</strong></h1>
          <p>Connectez-vous avec votre nom d'utilisateur et votre mot de passe pour gérer vos opérations de stock, caisse et inventaire.</p>
          <button type="button" className="shuffleBackHome" onClick={goLanding}>← Retour à l'accueil</button>
        </section>
        <section className="shuffleAuthPanel shuffleAuthPanelCentered" aria-label="Connexion Smart Inventory">
          <AuthForm/>
        </section>
      </main>
    </div>;
  }

  return <ShuffleExactHomepage goLogin={goLogin}/>;



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
    {role:"assistant",content:"Bonjour, je suis votre agent inventaire. Je peux lister les produits manquants, filtrer par zone/catégorie/nom, générer un plan d’action, créer un rapport CSV/PDF, détecter les doublons d’identifiants et expliquer pourquoi un produit est Présent, Manquant ou Non associé."}
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
        "Identifiant associé":epcs.join(", "),
        "Identifiant détecté":detectedForProduct.join(", "),
        "Statut":status,
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
  const presentRows=rows.filter(r=>r["Statut"]==="Présent");
  const missingRows=rows.filter(r=>r["Statut"]==="Manquant");
  const noAssociationRows=rows.filter(r=>r["Statut"]==="Non associé");
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
    return `${i+1}. PID ${r.PID || "-"} — ${r.Produit || "Sans nom"} | Zone: ${r.Zone || "-"} | Catégorie: ${r.Catégorie || "-"} | Statut: ${r["Statut"]} | Identifiant: ${r["Identifiant associé"] || "-"}`;
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
    if(r["Statut"]==="Présent"){
      return `Produit trouvé : ${r.Produit || "Sans nom"} (PID ${r.PID || "-"}).\nStatut : Présent.\nRaison : ce produit possède au moins un identifiant associé (${r["Identifiant associé"]}) et au moins un de ces identifiants est présent dans le CSV des identifiants détectés (${r["Identifiant détecté"]}).`;
    }
    if(r["Statut"]==="Manquant"){
      return `Produit trouvé : ${r.Produit || "Sans nom"} (PID ${r.PID || "-"}).\nStatut : Manquant.\nRaison : ce produit possède un identifiant associé (${r["Identifiant associé"]}), mais aucun de ses identifiants n’existe dans le dernier CSV des identifiants détectés. Il est donc attendu dans le stock, mais non détecté lors du scan.`;
    }
    return `Produit trouvé : ${r.Produit || "Sans nom"} (PID ${r.PID || "-"}).\nStatut : Non associé.\nRaison : aucun Identifiant n’est lié à ce produit dans le tableau des associations. Il faut d’abord associer un tag Identifiant au produit avant de pouvoir savoir s’il est présent ou manquant.`;
  }

  function buildActionPlan(){
    const steps=[];
    if((detectedEpcs||[]).length===0) steps.push("1. Importer le dernier CSV des identifiants détectés pour calculer le stock réel.");
    if(missingCount>0) steps.push(`${steps.length+1}. Traiter les produits manquants : vérifier physiquement les rayons et refaire un scan ciblé.`);
    if(noAssociationCount>0) steps.push(`${steps.length+1}. Associer les produits non associés à un Identifiant avant le prochain inventaire.`);
    if(agentData.duplicateEpcs.length>0) steps.push(`${steps.length+1}. Corriger les doublons d’identifiants : un même Identifiant ne doit pas être lié à plusieurs produits.`);
    steps.push(`${steps.length+1}. Exporter un rapport CSV/PDF après correction pour garder une preuve d’inventaire.`);
    return `Plan d’action recommandé :\n${steps.join("\n")}\n\nRésumé actuel : ${products.length} produits, ${presentCount} présents, ${missingCount} manquants, ${noAssociationCount} non associés, ${agentData.duplicateEpcs.length} doublon(s) identifiant.`;
  }

  function duplicateReport(){
    if(agentData.duplicateEpcs.length===0) return "Aucun doublon Identifiant détecté dans le tableau des associations.";
    const lines=agentData.duplicateEpcs.slice(0,30).map((d,i)=>{
      const linked=d.items.map(a=>`PID ${a.PID || "-"} ${a.Produit || ""}`.trim()).join(" | ");
      return `${i+1}. Identifiant ${d.epc} utilisé ${d.items.length} fois : ${linked}`;
    });
    return `Doublons d’identifiants détectés : ${agentData.duplicateEpcs.length}\n${lines.join("\n")}${agentData.duplicateEpcs.length>30 ? "\n... liste limitée aux 30 premiers doublons." : ""}`;
  }

  function exportRowsToCSV(q){
    const intent=chooseRowsByIntent(q);
    const {filtered,applied}=filterRows(intent.base,q);
    const cols=["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","Identifiant associé","Identifiant détecté","Statut"];
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
      `Identifiant detectes importes: ${(detectedEpcs||[]).length}`,
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

    return `Résumé actuel de l’inventaire :\n• Produits : ${products.length}\n• Présents : ${presentCount}\n• Manquants : ${missingCount}\n• Non associés : ${noAssociationCount}\n• Taux de couverture : ${coverage}%\n• Présence réelle selon identifiants détectés : ${stockAccuracy}%\n• Doublons d’identifiants : ${agentData.duplicateEpcs.length}\n\nJe peux aussi répondre à : “montre-moi les 20 produits absents”, “filtre les manquants par zone”, “crée un rapport CSV”, “crée un rapport PDF”, “détecte les doublons d’identifiants”, ou “explique pourquoi PID X est manquant”.`;
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
        setMessages(prev=>[...prev,{role:"assistant",content:"Erreur pendant l’analyse locale. Vérifiez que les fichiers produits, associations et identifiants détectés sont bien importés."}]);
      }
      setLoading(false);
    },180);
  }

  const quickQuestions=[
    "Montre-moi les 20 produits absents",
    "Filtrer les manquants par zone",
    "Génère un plan d’action",
    "Détecte les doublons d’identifiants",
    "Créer rapport CSV des manquants",
    "Créer rapport PDF résumé"
  ];

  return <section className="aiChatPage">
    <div className="aiChatTop">
      <div>
        <span className="aiChatBadge">Agent local gratuit</span>
        <h2>Chat inventaire</h2>
        <p>L’agent analyse le catalogue, les associations et le CSV des identifiants détectés. Il peut lister, filtrer, expliquer et exporter les données.</p>
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
            <span>{m.role==="user" ? "Vous" : "Agent inventaire"}</span>
            <p>{m.content}</p>
          </div>)}
          {loading && <div className="aiBubble assistant typing"><span>Agent inventaire</span><p>Analyse en cours...</p></div>}
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
        <div className="aiContextStat"><span>Associations identifiant</span><b>{associations.length}</b></div>
        <div className="aiContextStat"><span>Identifiants détectés importés</span><b>{(detectedEpcs||[]).length}</b></div>
        <div className="aiContextStat"><span>Présents</span><b>{presentCount}</b></div>
        <div className="aiContextStat"><span>Manquants</span><b>{missingCount}</b></div>
        <div className="aiContextStat"><span>Non associés</span><b>{noAssociationCount}</b></div>
        <div className="aiContextStat"><span>Doublons identifiant</span><b>{agentData.duplicateEpcs.length}</b></div>
        <div className="aiSideActions">
          <button type="button" onClick={()=>sendMessage("Créer rapport CSV des manquants")}>CSV manquants</button>
          <button type="button" onClick={()=>sendMessage("Créer rapport PDF résumé")}>PDF résumé</button>
          <button type="button" onClick={()=>sendMessage("Détecte les doublons d’identifiants")}>Doublons identifiant</button>
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
    <p className="notice">Tableau de consultation des associations Produit ↔ identifiant enregistrées localement.</p>

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

  // Statut réel = Catalogue produits + Associations Produit/Identifiant + CSV des identifiants détectés.
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
      "Identifiant associé":epcs.join(", "),
      "Statut": status,
      _rowClass: status==="Présent" ? "rowPresent" : status==="Manquant" ? "rowMissing" : "rowUnassociated"
    };
  }).filter(r=>{
    const s = Object.values(r).join(" ").toLowerCase();
    const matchText = s.includes(q.toLowerCase());
    const matchStatus = statusFilter==="all" || r["Statut"]===statusFilter;
    return matchText && matchStatus;
  });

  const total=products.length;
  const presentCount=products.filter(p=>getStatus(p)==="Présent").length;
  const missingCount=products.filter(p=>getStatus(p)==="Manquant").length;
  const unassociatedCount=products.filter(p=>getStatus(p)==="Non associé").length;

  return <section className="tableOnlyPage inventoryStatusPage">
    <p className="notice">Stock calculé avec le catalogue produits + les associations Produit/Identifiant + le dernier CSV des identifiants détectés importé.</p>

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
      <span>{rows.length} produit(s) · {detectedSet.size} Identifiant détecté(s)</span>
    </div>

    <div className="smartTableWrap">
      <table className="smartTable statusTable">
        <thead>
          <tr>{["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","Identifiant associé","Statut"].map(c=><th key={c}>{c}</th>)}</tr>
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
            <td>{r["Identifiant associé"]}</td>
            <td><span className={`statusBadge ${r._rowClass}`}>{r["Statut"]}</span></td>
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
      setMsg(`Projet restauré: ${data.products.length} produits, ${data.associations.length} associations, ${Array.isArray(data.detectedEpcs) ? data.detectedEpcs.length : 0} identifiants détectés.`);
    }catch(e){
      setMsg("Erreur lecture JSON: fichier invalide.");
    }
  }

  function exportProducts(){
    exportCSV("produits_locaux.csv",products,Object.keys(products[0]||{}));
  }

  function exportAssociations(){
    exportCSV("associations.csv",associations,Object.keys(associations[0]||{}));
  }

  function exportProductsWithoutRfid(){
    const associatedPids=new Set(associations.map(a=>String(a.PID)));
    const rows=products.filter(p=>!associatedPids.has(String(p.PID))).map(p=>({...p,"Statut":"Sans association"}));
    const cols=["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","Statut"];
    exportCSV("produits_sans_association.csv",rows,cols);
  }

  function exportCoverageReport(){
    const associatedPids=new Set(associations.map(a=>String(a.PID)));
    const productsWithRfid=products.filter(p=>associatedPids.has(String(p.PID))).length;
    const productsWithoutRfid=Math.max(products.length-productsWithRfid,0);
    const coverage=products.length ? Math.round((productsWithRfid/products.length)*100) : 0;
    const rows=[{
      "Produits locaux":products.length,
      "Produits associés":productsWithRfid,
      "Produits sans association":productsWithoutRfid,
      "Associations":associations.length,
      "Identifiants détectés importés":detectedEpcCount,
      "Taux de couverture":coverage+"%",
      "Date rapport":new Date().toISOString()
    }];
    exportCSV("rapport_couverture.csv",rows,Object.keys(rows[0]));
  }

  function exportDuplicateEpcReport(){
    const counts={};
    associations.forEach(a=>{const e=norm(a.EPC); if(e) counts[e]=(counts[e]||0)+1;});
    const rows=associations.filter(a=>counts[norm(a.EPC)]>1).map(a=>({...a,"Anomalie":"Doublon identifiant"}));
    const cols=["PID","Produit","Code barre 1","Code barre 2","EPC","Date","Anomalie"];
    exportCSV("rapport_doublons_epc.csv",rows,cols);
  }

  function exportFullAudit(){
    const associatedPids=new Set(associations.map(a=>String(a.PID)));
    const rows=products.map(p=>{
      const linked=associations.filter(a=>String(a.PID)===String(p.PID)).map(a=>a.EPC).join(", ");
      return {...p,"Identifiants associés":linked,"Statut":linked?"Associé":"Sans association"};
    });
    const cols=["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","Identifiants associés","Statut"];
    exportCSV("audit_complet_pharmainventory.csv",rows,cols);
  }

  return <section>
    
    <p className="notice">Exportez vos tableaux, rapports d’inventaire et sauvegardes locales.</p>

    <div className="statsGrid">
      <div className="statCard"><span>Produits</span><b>{products.length}</b><small>catalogue local</small></div>
      <div className="statCard"><span>Associations</span><b>{associations.length}</b><small>Liens enregistrés</small></div>
      
    </div>

    <div className="reportCards exportGrid">
      <div className="reportCard"><span>📦</span><div><b>Produits locaux</b><small>Catalogue importé complet</small></div><button onClick={exportProducts}>Exporter</button></div>
      <div className="reportCard"><span>🔗</span><div><b>Associations</b><small>PID, produits et Liens enregistrés</small></div><button onClick={exportAssociations}>Exporter</button></div>
      <div className="reportCard"><span>🏷️</span><div><b>Produits sans association</b><small>Articles à lier</small></div><button onClick={exportProductsWithoutRfid}>Exporter</button></div>
      <div className="reportCard"><span>📊</span><div><b>Taux de couverture</b><small>KPI de couverture</small></div><button onClick={exportCoverageReport}>Exporter</button></div>
      <div className="reportCard"><span>🔁</span><div><b>Doublons identifiant</b><small>Anomalies Identifiant répétées</small></div><button onClick={exportDuplicateEpcReport}>Exporter</button></div>
      <div className="reportCard"><span>✅</span><div><b>Audit complet</b><small>Produits + statut</small></div><button onClick={exportFullAudit}>Exporter</button></div>
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


function MyUsers({auth,me}){
  const allowedPages = cleanPageList(me?.page_permissions || defaultUserPages());
  const visiblePageOptions = APP_USER_PAGES.filter(p=>allowedPages.includes(p.id));
  const [users,setUsers]=useState([]);
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [fullName,setFullName]=useState("");
  const [pages,setPages]=useState(()=>visiblePageOptions.map(p=>p.id));
  const [msg,setMsg]=useState("");

  async function load(){
    try{
      const r=await axios.get(`${API}/users/my-users`,auth);
      setUsers(r.data);
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur chargement utilisateurs");
    }
  }
  useEffect(()=>{ load(); },[]);
  useEffect(()=>{
    setPages(prev=>cleanPageList(prev, visiblePageOptions.map(p=>p.id)));
  },[me?.username]);

  function togglePage(pageId){
    setPages(prev=>prev.includes(pageId) ? prev.filter(x=>x!==pageId) : [...prev,pageId]);
  }

  async function createUser(){
    try{
      await axios.post(`${API}/users/create`,{username,password,full_name:fullName,page_permissions:pages},auth);
      setUsername(""); setPassword(""); setFullName(""); setPages(visiblePageOptions.map(p=>p.id));
      setMsg("Utilisateur créé.");
      await load();
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur création utilisateur");
    }
  }

  async function updatePages(user,nextPages){
    try{
      await axios.post(`${API}/users/page-permissions/${encodeURIComponent(user.username)}`,{page_permissions:nextPages,can_manage_users:false},auth);
      setMsg(`Pages mises à jour pour ${user.username}.`);
      await load();
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur mise à jour pages");
    }
  }

  async function setActive(user,active){
    try{
      await axios.post(`${API}/users/set-active/${encodeURIComponent(user.username)}?active=${active}`,{},auth);
      setMsg(active ? "Utilisateur activé." : "Utilisateur désactivé.");
      await load();
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur changement statut");
    }
  }

  async function changePassword(user){
    const p=prompt(`Nouveau mot de passe pour ${user.username}:`);
    if(!p) return;
    try{
      await axios.post(`${API}/users/change-password/${encodeURIComponent(user.username)}`,{password:p},auth);
      setMsg("Mot de passe modifié.");
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur mot de passe");
    }
  }

  async function deleteUser(user){
    if(!confirm(`Supprimer l’utilisateur ${user.username} ?`)) return;
    try{
      await axios.delete(`${API}/users/delete/${encodeURIComponent(user.username)}`,auth);
      setMsg("Utilisateur supprimé.");
      await load();
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur suppression utilisateur");
    }
  }

  return <section className="platformPage myUsersPage">
    <div className="card userAccessCard">
      <h3>Créer un utilisateur pour ce compte</h3>
      <input placeholder="username" value={username} onChange={e=>setUsername(e.target.value)}/>
      <input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)}/>
      <input placeholder="nom utilisateur" value={fullName} onChange={e=>setFullName(e.target.value)}/>
      <div className="pagePermissionBox">
        <strong>Pages visibles</strong>
        <div className="pagePermissionGrid">
          {visiblePageOptions.map(page=><label key={page.id}>
            <input type="checkbox" checked={pages.includes(page.id)} onChange={()=>togglePage(page.id)}/>
            <span>{page.label}</span>
          </label>)}
        </div>
      </div>
      <button onClick={createUser}>Créer utilisateur</button>
    </div>

    <p className={msg.includes("Erreur") || msg.includes("not") ? "err" : "success"}>{msg}</p>

    <table>
      <thead><tr><th>Utilisateur</th><th>Nom</th><th>Pages visibles</th><th>Mot de passe</th><th>Statut</th><th>Delete</th></tr></thead>
      <tbody>
        {users.length ? users.map(u=>{
          const currentPages=cleanPageList(u.page_permissions || [], allowedPages);
          return <tr key={u.username}>
            <td>{u.username}</td>
            <td>{u.full_name}</td>
            <td><div className="pagePermissionMiniGrid">{visiblePageOptions.map(page=>{
              const checked=currentPages.includes(page.id);
              return <label key={page.id}><input type="checkbox" checked={checked} onChange={e=>{
                const next=e.target.checked ? [...currentPages,page.id] : currentPages.filter(x=>x!==page.id);
                updatePages(u,next);
              }}/><span>{page.label}</span></label>
            })}</div></td>
            <td><button onClick={()=>changePassword(u)}>Changer mot de passe</button></td>
            <td><button onClick={()=>setActive(u,!u.active)}>{u.active ? "Désactiver" : "Activer"}</button></td>
            <td><button className="dangerBtn" onClick={()=>deleteUser(u)}>Delete</button></td>
          </tr>
        }) : <tr><td colSpan="6" className="expenseHistoryEmpty">Aucun utilisateur créé pour ce compte.</td></tr>}
      </tbody>
    </table>
  </section>;
}


function Platform({auth}){
  const [clients,setClients]=useState([]);
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [pharmacy,setPharmacy]=useState("");
  const [days,setDays]=useState(30);
  const [aiPremium,setAiPremium]=useState(false);
  const [pagePermissions,setPagePermissions]=useState(()=>defaultUserPages());
  const [canManageUsers,setCanManageUsers]=useState(true);
  const [msg,setMsg]=useState("");
  const [showCreateModal,setShowCreateModal]=useState(false);

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
      await axios.post(`${API}/platform/create-client`,{username,password,pharmacy_name:pharmacy,days:Number(days),ai_premium:aiPremium,page_permissions:pagePermissions,can_manage_users:canManageUsers},auth);
      setUsername(""); setPassword(""); setPharmacy(""); setDays(30); setAiPremium(false); setPagePermissions(defaultUserPages()); setCanManageUsers(true);
      setShowCreateModal(false);
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

  function toggleCreatePage(pageId){
    setPagePermissions(prev=>prev.includes(pageId) ? prev.filter(x=>x!==pageId) : [...prev,pageId]);
  }

  async function updateClientAccess(client,nextPages,nextCanManage){
    try{
      await axios.post(`${API}/platform/client-page-permissions/${encodeURIComponent(client.username)}`,{
        page_permissions: nextPages,
        can_manage_users: nextCanManage
      },auth);
      setMsg(`Accès mis à jour pour ${client.username}.`);
      await load();
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur mise à jour accès pages");
    }
  }

return <section className="platformPage">
    <div className="platformHeaderBar">
      <div>
        <h2>Stores / clients pharmacie</h2>
        <p>Gérez les comptes clients, leurs accès et leurs permissions.</p>
      </div>
      <button type="button" className="platformAddStoreBtn" onClick={()=>setShowCreateModal(true)}>Ajouter Store</button>
    </div>

    {showCreateModal && <div className="modalOverlay" onClick={()=>setShowCreateModal(false)}>
      <div className="scanModal platformStoreModal" onClick={e=>e.stopPropagation()}>
        <button type="button" className="modalClose" onClick={()=>setShowCreateModal(false)}>×</button>
        <h2>Ajouter Store</h2>
        <p>Créer un client pharmacie avec ses accès et permissions.</p>
        <div className="platformCreateGrid">
          <input placeholder="username" value={username} onChange={e=>setUsername(e.target.value)}/>
          <input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)}/>
          <input placeholder="nom pharmacie" value={pharmacy} onChange={e=>setPharmacy(e.target.value)}/>
          <input placeholder="jours" value={days} onChange={e=>setDays(e.target.value)}/>
        </div>
        <div className="platformCreateChecks">
          <label className="checkLine"><input type="checkbox" checked={aiPremium} onChange={e=>setAiPremium(e.target.checked)}/> Premium AI Assistant</label>
          <label className="checkLine"><input type="checkbox" checked={canManageUsers} onChange={e=>setCanManageUsers(e.target.checked)}/> Peut créer ses propres utilisateurs</label>
        </div>
        <div className="pagePermissionBox">
          <strong>Pages visibles pour ce client</strong>
          <div className="pagePermissionGrid">
            {APP_USER_PAGES.map(page=><label key={page.id}>
              <input type="checkbox" checked={pagePermissions.includes(page.id)} onChange={()=>toggleCreatePage(page.id)}/>
              <span>{page.label}</span>
            </label>)}
          </div>
        </div>
        <div className="platformModalActions">
          <button type="button" className="platformModalCancel" onClick={()=>setShowCreateModal(false)}>Annuler</button>
          <button type="button" className="platformModalCreate" onClick={create}>Créer client</button>
        </div>
      </div>
    </div>}

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
          <th>Pages visibles</th>
          <th>Gestion users</th>
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
            <td>{isAdmin
              ? <label className="checkLine compact"><input type="checkbox" checked disabled/> Activé</label>
              : <label className="checkLine compact"><input type="checkbox" checked={!!c.ai_premium} onChange={e=>toggleAiPremium(c.username,e.target.checked)}/> Activé</label>
            }</td>
            <td>{isAdmin ? "Toutes" : <div className="pagePermissionMiniGrid">{APP_USER_PAGES.map(page=>{
              const currentPages=cleanPageList(c.page_permissions || []);
              const checked=currentPages.includes(page.id);
              return <label key={page.id}><input type="checkbox" checked={checked} onChange={e=>{
                const next=e.target.checked ? [...currentPages,page.id] : currentPages.filter(x=>x!==page.id);
                updateClientAccess(c,next,c.can_manage_users);
              }}/><span>{page.label}</span></label>
            })}</div>}</td>
            <td>{isAdmin ? "Oui" : <label className="checkLine compact"><input type="checkbox" checked={!!c.can_manage_users} onChange={e=>updateClientAccess(c,cleanPageList(c.page_permissions || []),e.target.checked)}/> Autorisé</label>}</td>
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
      "Associations":associations.length,
      "Identifiants détectés importés":detectedEpcCount,
      "Taux de couverture":coverage+"%",
      "Doublons identifiant":duplicateEpcs,
      "Date rapport":new Date().toISOString()
    }];
    exportCSV("rapport_dashboard.csv",rows,Object.keys(rows[0]));
  }

  function exportProductsWithoutRfid(){
    const rows=products.filter(p=>!associatedPids.has(String(p.PID))).map(p=>({...p,"Statut":"Sans association"}));
    exportCSV("produits_sans_tag.csv",rows,["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","Statut"]);
  }

  const alerts=[];
  if(productsWithoutRfid>0) alerts.push({type:"warning",icon:"warning",title:`${productsWithoutRfid} produits sans association`,text:"Aucune association détectée pour ces produits."});
  if(duplicateEpcs>0) alerts.push({type:"danger",icon:"warning",title:`${duplicateEpcs} doublon(s) Identifiant détecté(s)`,text:"Vérifier les associations en double."});
  if(detectedEpcCount===0) alerts.push({type:"info",icon:"rfid",title:"0 scan détecté",text:"Importez le CSV des identifiants détectés pour calculer le stock réel."});
  if(coverage<100) alerts.push({type:"warning",icon:"warning",title:"Aucune association détectée pour ces produits.",text:"À taguer en priorité pour améliorer votre suivi."});
  if(alerts.length===0) alerts.push({type:"success",icon:"check",title:"Aucune alerte prioritaire",text:"Les données sont stables."});

  const reports=[
    {label:"Taux de couverture",sub:"CSV",icon:"doc",action:exportDashboardReport,type:"blue"},
    {label:"Produits avec tag",sub:"CSV",icon:"tag",action:exportDashboardReport,type:"green"},
    {label:"Produits sans tag",sub:"CSV",icon:"warning",action:exportProductsWithoutRfid,type:"orange"},
    {label:"Historique scans",sub:"CSV",icon:"clock",action:()=>exportCSV("historique_scans.csv",associations,Object.keys(associations[0]||{})),type:"purple"},
  ];

  const kpis=[
    {label:"Produits enregistrés",value:products.length,sub:products.length ? "Catalogue importé" : "Aucun catalogue importé",icon:"box",tone:"blue",action:()=>setTab("operations")},
    {label:"Produits tagués",value:productsWithRfid,sub:productsWithRfid ? "Avec association" : "Aucun tag détecté",icon:"tag",tone:"green",action:()=>setTab("association")},
    {label:"Transactions",value:detectedEpcCount,sub:detectedEpcCount ? "Identifiants détectés importés" : "Aucune transaction",icon:"rfid",tone:"purple",action:()=>setTab("inventory")},
    {label:"Produits sans tag",value:productsWithoutRfid,sub:productsWithoutRfid ? "À taguer en priorité" : "Synchronisés",icon:"warning",tone:"orange",action:()=>setTab("operations")},
  ];

  const shownAds=currentDashboardAd ? activeDashboardAds : defaultAds;
  const activeAdIndex=(currentDashboardAd ? dashboardAdIndex : defaultAdIndex) % shownAds.length;
  const defaultAdSrc=defaultAds[defaultAdIndex % defaultAds.length];

  return <section className="figmaDashboard">
    <p className="figmaIntro">Suivi en temps réel de la couverture et de l’activité de votre pharmacie.</p>

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
          <h2>Taux de couverture</h2>
        </div>

        <div className="figmaCoverageContent">
          <div className="figmaGauge" aria-label={`Taux de couverture ${coverage}%`}>
            <svg width="188" height="188" viewBox="0 0 188 188">
              <circle cx="94" cy="94" r={radius} fill="none" stroke="#eef2f7" strokeWidth="20"/>
              {coverage>0 && <circle cx="94" cy="94" r={radius} fill="none" stroke="var(--primary)" strokeWidth="20" strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" transform="rotate(-90 94 94)"/>}
            </svg>
            <b>{coverage}%</b>
          </div>

          <div className="figmaCoverageText">
            <h3>{coverage>=80 ? "Votre pharmacie est bien équipée." : coverage>=50 ? "Votre couverture progresse." : "Votre couverture doit être améliorée."}</h3>
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
