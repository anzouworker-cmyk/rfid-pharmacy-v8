
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

function saveLS(k,v){ localStorage.setItem(k,JSON.stringify(v)); }
function loadLS(k,def){ try{return JSON.parse(localStorage.getItem(k)||"")}catch{return def} }
function norm(v){ return String(v ?? "").trim().replaceAll(" ","").replaceAll("-","").toUpperCase(); }

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

function useLocalStore(){
  const [productsState,setProductsState]=useState(()=>loadLS(LS_PRODUCTS,[]));
  const [associationsState,setAssociationsState]=useState(()=>loadLS(LS_ASSOC,[]));
  function setProducts(rows){ setProductsState(rows); saveLS(LS_PRODUCTS,rows); }
  function setAssociations(rows){ setAssociationsState(rows); saveLS(LS_ASSOC,rows); }
  return {products:productsState,setProducts,associations:associationsState,setAssociations};
}







function BrandIcon({className=""}){
  return <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="siBrandStroke" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
        <stop stopColor="#0b3ea9"/>
        <stop offset="1" stopColor="#16c2cf"/>
      </linearGradient>
      <linearGradient id="siBrandBars" x1="20" y1="14" x2="44" y2="50" gradientUnits="userSpaceOnUse">
        <stop stopColor="#0b3ea9"/>
        <stop offset="1" stopColor="#16c2cf"/>
      </linearGradient>
    </defs>
    <path d="M32 6 49 16v32L32 58 15 48V16L32 6Z" stroke="url(#siBrandStroke)" strokeWidth="4.5" strokeLinejoin="round"/>
    <path d="M21 43V31" stroke="url(#siBrandBars)" strokeWidth="5" strokeLinecap="round"/>
    <path d="M31 43V22" stroke="url(#siBrandBars)" strokeWidth="5" strokeLinecap="round"/>
    <path d="M41 43V17" stroke="url(#siBrandBars)" strokeWidth="5" strokeLinecap="round"/>
    <path d="M15 16 26 9" stroke="#0b3ea9" strokeWidth="4.5" strokeLinecap="round"/>
    <path d="M38 54 49 47" stroke="#16c2cf" strokeWidth="4.5" strokeLinecap="round"/>
  </svg>
}

function SmartInventoryLogo({className=""}){
  return <div className={`smartSidebarLogo ${className}`.trim()} aria-label="Smart Inventory">
    <BrandIcon className="smartSidebarLogoIcon"/>
    <div className="smartSidebarLogoText">
      <span className="smartSidebarLogoSmart">Smart</span>
      <span className="smartSidebarLogoInventory">Inventory</span>
    </div>
  </div>
}

function SidebarGlyph({name, active=false}){
  const stroke = active ? "#2563eb" : "#384a64";
  const common = {stroke, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none"};
  if(name==="dashboard"){
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="2.1" fill="#2f7bff"/>
      <rect x="14" y="3" width="7" height="7" rx="2.1" fill="#2f7bff"/>
      <rect x="3" y="14" width="7" height="7" rx="2.1" fill="#2f7bff"/>
      <rect x="14" y="14" width="7" height="7" rx="2.1" fill="#2f7bff"/>
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

  const displayName = me?.username || "Admin User";
  const accountName = me?.pharmacy_name || displayName;
  const roleName = me?.role==="platform_admin" ? "Super Admin" : "Utilisateur";
  const userInitials = String(displayName).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join("") || "AU";

  const pageTitles={
    operations:"RFID Scan",
    dashboard:"Dashboard",
    association:"Associations RFID",
    inventory:"Inventory",
    ai:"Reports & AI",
    platform:"Clients SaaS",
    dashboardAdmin:"Publicités"
  };
  const pageTitle=pageTitles[tab]||"Smart Inventory";

  const menu=[
    {id:"dashboard",label:"Dashboard",icon:"dashboard"},
    {id:"inventory",label:"Inventory",icon:"inventory"},
    {id:"operations",label:"RFID Scan",icon:"operations"},
    {id:"association",label:"Associations",icon:"association"},
    {id:"ai",label:"Reports & AI",icon:"ai"},
  ];
  if(me?.role==="platform_admin"){
    menu.push({id:"platform",label:"Clients SaaS",icon:"platform"});
    menu.push({id:"dashboardAdmin",label:"Ads",icon:"dashboardAdmin"});
  }

  return <div className={sidebarCollapsed ? "appShell whiteShell sidebarIsCollapsed" : "appShell whiteShell"}>
    <aside className="sidebar whiteSidebar">
      <div className="whiteBrand">
        <SmartInventoryLogo className="sidebarCodeLogo"/>
      </div>

      <nav className="whiteNav">
        {menu.map(m=>{ const active = tab===m.id; return <button key={m.id} title={m.label} className={active ? "whiteNavItem active" : "whiteNavItem"} onClick={()=>setTab(m.id)}>
          <span className="navIconTile"><SidebarGlyph name={m.icon} active={active}/></span>
          <b>{m.label}</b>
        </button>})}
      </nav>

      <div className="whiteSideBottom">
        {!sidebarCollapsed && <div className="sidebarOrgCard">
          <span className="sidebarSectionLabel">Organization</span>
          <div className="sidebarOrgRow">
            <span className="sidebarOrgIcon">🏥</span>
            <div>
              <b>{accountName}</b>
              <small>Smart Inventory Workspace</small>
            </div>
          </div>
        </div>}
        <button className="whiteLogout" onClick={logout}><span className="navIconTile"><SidebarGlyph name="logout"/></span><b>Log out</b></button>
        <button className="sidebarCollapseBtn" onClick={toggleSidebar}>{sidebarCollapsed ? "Expand" : "Collapse"}</button>
      </div>
    </aside>

    <section className="whiteMain">
      <header className="whiteTopbar">
        <div className="topbarLeft">
          <button className="hamburger" onClick={toggleSidebar} aria-label="Toggle sidebar">☰</button>
          <div className="dashboardSearch" role="search">
            <span className="searchIcon">⌕</span>
            <input type="text" placeholder="Search products, tags, locations..." aria-label="Search"/>
            <kbd>⌘ K</kbd>
          </div>
        </div>

        <div className="whiteTopbarRight">
          <button className="topIconBtn" aria-label="Notifications"><span>🔔</span><sup>3</sup></button>
          <button className="topIconBtn" aria-label="Help">?</button>
          <button className="topIconBtn" aria-label="Menu">⋮</button>
          <div className="whiteAccount">
            <div className="accountAvatar">{userInitials}</div>
            <div>
              <b>{displayName}</b>
              <small>{roleName}</small>
            </div>
          </div>
        </div>
      </header>

      {tab!=="dashboard" && <div className="contentPageHeader">
        <div>
          <h1>{pageTitle}</h1>
          <p>Manage your RFID workflows, data and exports from Smart Inventory.</p>
        </div>
      </div>}

      <main className="whiteContent">
        {tab==="operations" && <Operations/>}
        {tab==="dashboard" && <Dashboard setTab={setTab}/>} 
        {tab==="ai" && <AIAssistant/>}
        {tab==="association" && <Association/>}
        {tab==="inventory" && <Inventory/>}
        {tab==="platform" && <Platform auth={auth}/>} 
        {tab==="dashboardAdmin" && <DashboardAdmin auth={auth}/>} 
      </main>
      <footer className="whiteFooter">© 2026 Smart Inventory · Inventory Management Platform</footer>
    </section>
  </div>
}


function Operations(){
  const {products,associations,setProducts,setAssociations}=useLocalStore();
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
      const rows=res.data.map(r=>norm(r[0])).filter(Boolean);
      downloadJSON(`epc_detectes_${new Date().toISOString().slice(0,10)}.json`,{epcs:[...new Set(rows)],date:new Date().toISOString()});
      setMsg(`${rows.length} EPC détectés importés. Fichier JSON généré.`);
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
    
  useEffect(()=>{
    const timer=setInterval(()=>setDefaultAdIndex(i=>(i+1)%defaultAds.length),10000);
    return ()=>clearInterval(timer);
  },[]);

  const associatedPids=new Set(associations.map(a=>String(a.PID)));
    const rows=products.filter(p=>!associatedPids.has(String(p.PID))).map(p=>({...p,"Statut RFID":"Sans RFID"}));
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
    downloadJSON(`pharmainventory_backup_${new Date().toISOString().slice(0,10)}.json`,{products,associations,backup_date:new Date().toISOString()});
  }
  async function restoreProject(file){
    if(!file) return;
    try{
      const data=await readJSONFile(file);
      if(Array.isArray(data.products)) setProducts(data.products);
      if(Array.isArray(data.associations)) setAssociations(data.associations);
      setMsg("Projet restauré.");
    }catch(e){ alert("Fichier JSON invalide"); }
  }

  return <section className="operationsPage">
    <h1>Operations</h1>
    <p>Exécutez les opérations RFID directement ici : import, scan, associations, EPC détectés, exports et sauvegardes.</p>

    <div className="operationsActionPanel">
      <h2>Actions RFID</h2>
      <p className="notice">Lancez les opérations principales : import catalogue, import associations, scan code-barres, scan EPC et nettoyage des associations.</p>
      <div className="operationGrid workflowGrid">
      <label className="operationCard white fileCardOp">
        <div className="opIcon">📥</div><h3>Importer CSV pharmacie</h3><p>Importer le catalogue produits.</p><span>Choisir CSV</span>
        <input type="file" accept=".csv" onChange={e=>importProducts(e.target.files[0])}/>
      </label>

      <label className="operationCard white fileCardOp">
        <div className="opIcon">🔗</div><h3>Importer associations RFID</h3><p>Importer les associations Produit ↔ EPC.</p><span>Choisir CSV</span>
        <input type="file" accept=".csv" onChange={e=>importAssociations(e.target.files[0])}/>
      </label>

      <button className="operationCard blue" onClick={openBarcode}>
        <div className="opIcon">🏷️</div><h3>Scanner code-barres produit</h3><p>Ouvrir une fenêtre pour saisir le code-barres.</p>
      </button>

      <button className="operationCard green" onClick={openEpc}>
        <div className="opIcon">📡</div><h3>Scanner EPC RFID</h3><p>Ouvrir une fenêtre pour saisir le tag EPC.</p>
      </button>

      <label className="operationCard white fileCardOp">
        <div className="opIcon">▥</div><h3>Importer EPC détectés</h3><p>Importer un CSV/TXT EPC détectés.</p><span>Choisir fichier</span>
        <input type="file" accept=".csv,.txt" onChange={e=>importDetectedEpc(e.target.files[0])}/>
      </label>

      <button className="operationCard dangerOp" onClick={clearAssociations}>
        <div className="opIcon">🗑️</div><h3>Vider toutes associations</h3><p>Supprimer toutes les associations RFID locales.</p>
      </button>
    </div>
    </div>

    <div className="exportsPanel">
      <h2>Exports & sauvegardes locales</h2>
      <p className="notice">Exportez vos tableaux, rapports RFID et sauvegardes locales. Les données restent dans le navigateur de la pharmacie.</p>
      <div className="exportOperationGrid">
        <button className="exportOperationCard" onClick={exportProducts}><div className="opIcon">📦</div><h3>Produits locaux</h3><p>Exporter le catalogue importé complet.</p><span>Exporter</span></button>
        <button className="exportOperationCard" onClick={exportAssociations}><div className="opIcon">🔗</div><h3>Associations RFID</h3><p>Exporter les produits liés aux EPC RFID.</p><span>Exporter</span></button>
        <button className="exportOperationCard" onClick={exportProductsWithoutRfid}><div className="opIcon">🏷️</div><h3>Produits sans RFID</h3><p>Exporter les articles à associer.</p><span>Exporter</span></button>
        <button className="exportOperationCard blue" onClick={exportCoverageReport}><div className="opIcon">📊</div><h3>Couverture RFID</h3><p>Exporter les KPI de couverture.</p><span>Exporter</span></button>
        <button className="exportOperationCard green" onClick={backupProject}><div className="opIcon">💾</div><h3>Sauvegarde projet</h3><p>Créer un backup JSON complet.</p><span>Backup</span></button>
        <label className="exportOperationCard fileCard"><div className="opIcon">📥</div><h3>Restaurer projet</h3><p>Importer un backup JSON local.</p><span>Choisir fichier</span><input type="file" accept=".json" onChange={e=>restoreProject(e.target.files[0])}/></label>
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
  const {products,associations}=useLocalStore();
  const [dashboardAds,setDashboardAds]=useState([]);
  useEffect(()=>{
    const token=localStorage.token||"";
    axios.get(`${API}/dashboard/content`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>{
      setDashboardAds(r.data.filter(x=>["publicite","publicité","promo","annonce","ad"].includes((x.content_type||"").toLowerCase())));
    }).catch(()=>setDashboardAds([]));
  },[]);
  const dashboardAd = dashboardAds.find(x=>x.active!==false) || null;
  const [question,setQuestion]=useState("");
  const [answer,setAnswer]=useState(null);
  const [loading,setLoading]=useState(false);
  const token=localStorage.token||"";
  const auth={headers:{Authorization:`Bearer ${token}`}};

  const associatedPids=new Set(associations.map(a=>String(a.PID)));
  const productsWithRfid=products.filter(p=>associatedPids.has(String(p.PID))).length;
  const productsWithoutRfid=Math.max(products.length-productsWithRfid,0);
  const coverage=products.length ? Math.round((productsWithRfid/products.length)*100) : 0;

  async function analyze(q){
    setLoading(true);
    setAnswer(null);
    const payload={
      products_count:products.length,
      associations_count:associations.length,
      products_with_rfid:productsWithRfid,
      products_without_rfid:productsWithoutRfid,
      coverage,
      detected_epc_count:0,
      present_count:0,
      missing_count:0,
      no_association_count:productsWithoutRfid,
      question:q || question || "Analyse ma situation RFID et donne les prochaines actions."
    };
    try{
      const r=await axios.post(`${API}/ai/analyze`,payload,auth);
      setAnswer(r.data.analysis || r.data);
    }catch(e){
      setAnswer({
        score:coverage,
        niveau:"Analyse locale",
        resume:"L’assistant IA cloud n’est pas encore disponible ou le compte n’a pas l’option Premium AI.",
        recommandations:[
          "Vérifier que l’option Premium AI est activée pour ce client.",
          "Vérifier OPENAI_API_KEY sur Render.",
          "Continuer à associer les produits sans RFID."
        ],
        alertes: productsWithoutRfid>0 ? [`${productsWithoutRfid} produits sans RFID.`] : [],
        prochaine_action:"Activer Premium AI depuis la gestion clients si nécessaire."
      });
    }
    setLoading(false);
  }

  return <section className="aiPagePro">
    <div className="aiHeroPro">
      <div>
        <span className="pill">Premium AI Assistant</span>
        <h2>Assistant intelligent pour inventaire RFID</h2>
        <p>Analyse vos produits, associations RFID et couverture pour recommander les prochaines actions.</p>
      </div>
      <div className="aiScoreCircle">
        <b>{coverage}</b>
        <span>/100</span>
      </div>
    </div>

    <div className="statsGrid proStats">
      <div className="statCard"><span>Produits</span><b>{products.length}</b><small>catalogue local</small></div>
      <div className="statCard"><span>Associations</span><b>{associations.length}</b><small>EPC liés</small></div>
      <div className="statCard"><span>Couverture</span><b>{coverage}%</b><small>{productsWithRfid} produits couverts</small></div>
      <div className="statCard"><span>Sans RFID</span><b>{productsWithoutRfid}</b><small>à associer</small></div>
    </div>

    <div className="grid">
      <div className="card aiPromptCard">
        <h3>Poser une question</h3>
        <textarea className="textArea" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ex: Comment atteindre 95% de couverture RFID ?"/>
        <button className="primaryBtn" onClick={()=>analyze()} disabled={loading}>{loading ? "Analyse..." : "Analyser"}</button>
      </div>
      <div className="card">
        <h3>Questions rapides</h3>
        <div className="quickGrid">
          <button onClick={()=>analyze("Donne-moi les priorités pour améliorer la couverture RFID.")}>Priorités</button>
          <button onClick={()=>analyze("Quels sont les risques actuels de mon inventaire RFID ?")}>Risques</button>
          <button onClick={()=>analyze("Donne un plan d’action pour atteindre 95% de couverture RFID.")}>Plan 95%</button>
          <button onClick={()=>analyze("Que dois-je faire cette semaine ?")}>Cette semaine</button>
        </div>
      </div>
    </div>

    {answer && <div className="aiAnswerPanel">
      <h3>Résultat de l’analyse</h3>
      <p>{answer.resume || answer.summary || "Analyse terminée."}</p>
      {(answer.recommandations || answer.recommendations || []).length>0 && <>
        <h4>Recommandations</h4>
        <ul>{(answer.recommandations || answer.recommendations).map((x,i)=><li key={i}>{x}</li>)}</ul>
      </>}
      {(answer.alertes || answer.risks || []).length>0 && <>
        <h4>Alertes</h4>
        <ul>{(answer.alertes || answer.risks).map((x,i)=><li key={i}>{x}</li>)}</ul>
      </>}
      {answer.prochaine_action && <p><b>Prochaine action :</b> {answer.prochaine_action}</p>}
    </div>}
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
  const {products,associations}=useLocalStore();
  const [q,setQ]=useState("");
  const [statusFilter,setStatusFilter]=useState("all");

  const associatedByPid = new Map();
  associations.forEach(a=>{
    const pid=String(a.PID||"");
    if(pid) associatedByPid.set(pid,a);
  });

  // If an association has a detected/present flag in future imports, use it.
  // Otherwise, any associated product is considered Présent.
  function getStatus(p){
    const a=associatedByPid.get(String(p.PID));
    if(!a) return "Non associé";
    const raw=String(a.Statut||a.status||a.Etat||a.etat||"").toLowerCase();
    if(raw.includes("manquant") || raw.includes("missing") || raw.includes("absent")) return "Manquant";
    return "Présent";
  }

  const rows = products.map(p=>{
    const status=getStatus(p);
    return {
      PID:p.PID,
      Produit:p.Produit,
      Catégorie:p["Catégorie"] || p.Catégorie || "",
      Zone:p.Zone || "",
      Stock:p.Stock || "",
      "Code barre 1":p["Code barre 1"] || "",
      "Code barre 2":p["Code barre 2"] || "",
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
    <p className="notice">Tableau de consultation de l’inventaire RFID réel et du statut de couverture RFID.</p>

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
      <span>{rows.length} produit(s)</span>
    </div>

    <div className="smartTableWrap">
      <table className="smartTable statusTable">
        <thead>
          <tr>{["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","Statut RFID"].map(c=><th key={c}>{c}</th>)}</tr>
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
            <td><span className={`statusBadge ${r._rowClass}`}>{r["Statut RFID"]}</span></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>
}



function LocalData(){
  const {products,setProducts,associations,setAssociations}=useLocalStore();
  const [msg,setMsg]=useState("");

  function saveProject(){
    const backup={
      app:"Smart Inventory",
      version:"V22",
      backup_date:new Date().toISOString(),
      products,
      associations,
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
      setMsg(`Projet restauré: ${data.products.length} produits, ${data.associations.length} associations.`);
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
    
    <p className="notice">Exportez vos tableaux, rapports RFID et sauvegardes locales. Les données restent dans le navigateur de la pharmacie.</p>

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
  const {products,associations}=useLocalStore();
  const [dashboardAds,setDashboardAds]=useState([]);
  const [dashboardAdIndex,setDashboardAdIndex]=useState(0);
  const [defaultAdIndex,setDefaultAdIndex]=useState(0);
  const defaultAds=["/default-dashboard-ad.png"];

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
    if(activeDashboardAds.length <= 1) return;
    const timer=setInterval(()=>setDashboardAdIndex(i=>(i+1)%activeDashboardAds.length),5000);
    return ()=>clearInterval(timer);
  },[activeDashboardAds.length]);

  useEffect(()=>{
    if(activeDashboardAds.length > 0 || defaultAds.length <= 1) return;
    const timer=setInterval(()=>setDefaultAdIndex(i=>(i+1)%defaultAds.length),5000);
    return ()=>clearInterval(timer);
  },[activeDashboardAds.length, defaultAds.length]);

  function nextDashboardAd(){
    if(activeDashboardAds.length <= 1) return;
    setDashboardAdIndex(i=>(i+1)%activeDashboardAds.length);
  }

  function prevDashboardAd(){
    if(activeDashboardAds.length <= 1) return;
    setDashboardAdIndex(i=>(i-1+activeDashboardAds.length)%activeDashboardAds.length);
  }

  function relativeTime(dateStr){
    if(!dateStr) return "—";
    const ts = new Date(dateStr).getTime();
    if(Number.isNaN(ts)) return "—";
    const diff = Math.max(0, Date.now() - ts);
    const min = Math.round(diff / 60000);
    if(min < 1) return "just now";
    if(min < 60) return `${min} min ago`;
    const hrs = Math.round(min / 60);
    if(hrs < 24) return `${hrs} hr${hrs>1?"s":""} ago`;
    const days = Math.round(hrs / 24);
    return `${days} day${days>1?"s":""} ago`;
  }

  const productsByPid = new Map(products.map(p=>[String(p.PID),p]));
  const associatedPids=new Set(associations.map(a=>String(a.PID)).filter(Boolean));
  const productsWithRfid=products.filter(p=>associatedPids.has(String(p.PID))).length;
  const productsWithoutRfid=Math.max(products.length-productsWithRfid,0);
  const coverage=products.length ? Math.round((productsWithRfid/products.length)*1000)/10 : 0;
  const coverageRounded=Math.round(coverage);
  const remainingPercent = Math.max(100-coverageRounded,0);

  const epcCounts={};
  const lastAssociationByPid={};
  associations.forEach(a=>{
    const e=norm(a.EPC);
    if(e) epcCounts[e]=(epcCounts[e]||0)+1;
    const pid=String(a.PID||"");
    if(pid && a.Date){
      const current=lastAssociationByPid[pid];
      if(!current || new Date(a.Date).getTime() > new Date(current).getTime()) lastAssociationByPid[pid]=a.Date;
    }
  });
  const duplicateEpcs=Object.values(epcCounts).filter(x=>x>1).length;
  const unassignedTags=associations.filter(a=>!a.PID || !productsByPid.has(String(a.PID))).length;
  const latestScanDate = associations.map(a=>a.Date).filter(Boolean).sort().slice(-1)[0] || "";
  const zones=[...new Set(products.map(p=>String(p.Zone||"").trim()).filter(Boolean))];
  const scannedZones=[...new Set(products.filter(p=>associatedPids.has(String(p.PID))).map(p=>String(p.Zone||"").trim()).filter(Boolean))];
  const scanQuality = Math.max(0, Math.min(99.8, Math.round((coverageRounded - duplicateEpcs*3 - unassignedTags*2 + 10) * 10) / 10));
  const lowStockCount = products.filter(p=>{const v=parseFloat(String(p.Stock||"").replace(',', '.')); return Number.isFinite(v) && v<=5;}).length;

  function exportDashboardReport(){
    const rows=[{
      "Produits catalogués":products.length,
      "Produits tagués":productsWithRfid,
      "Produits sans tag":productsWithoutRfid,
      "Associations RFID":associations.length,
      "Couverture RFID":coverageRounded+"%",
      "Doublons EPC":duplicateEpcs,
      "Date rapport":new Date().toISOString()
    }];
    exportCSV("rapport_dashboard_rfid.csv",rows,Object.keys(rows[0]));
  }

  function exportProductsWithoutRfid(){
    const rows=products.filter(p=>!associatedPids.has(String(p.PID))).map(p=>({...p,"Statut RFID":"Sans tag"}));
    exportCSV("produits_sans_tag.csv",rows,["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","Statut RFID"]);
  }

  function exportAssociationHistory(){
    exportCSV("historique_scans.csv",associations,Object.keys(associations[0]||{}));
  }

  const alertItems=[];
  if(productsWithoutRfid>0) alertItems.push({tone:"danger", title:"High Missing Items", text:`${productsWithoutRfid} products still need RFID coverage`, time:"5 min ago"});
  if(unassignedTags>0) alertItems.push({tone:"warning", title:"Unassigned Tags", text:`${unassignedTags} tag(s) are not linked to a product`, time:"15 min ago"});
  if(lowStockCount>0) alertItems.push({tone:"info", title:"Low Stock Alert", text:`${lowStockCount} product(s) are below threshold`, time:"1 hr ago"});
  if(duplicateEpcs>0) alertItems.push({tone:"danger", title:"Duplicate EPC Detected", text:`${duplicateEpcs} EPC duplicate(s) require validation`, time:"2 hrs ago"});
  if(products.length && productsWithoutRfid===0 && duplicateEpcs===0) alertItems.push({tone:"success", title:"Daily Report Ready", text:"Inventory quality is stable and report is ready to export", time:"3 hrs ago"});
  if(!alertItems.length) alertItems.push({tone:"info", title:"Catalogue non importé", text:"Importez votre catalogue pour activer les indicateurs du dashboard.", time:"Now"});

  const recentActivity = products.slice(0,5).map((p,idx)=>{
    const pid=String(p.PID);
    const hasTag=associatedPids.has(pid);
    const noBarcode=!String(p["Code barre 1"]||"").trim() && !String(p["Code barre 2"]||"").trim();
    const status = hasTag ? "Present" : noBarcode ? "Unassigned" : "Missing";
    return {
      id: pid || `ROW-${idx+1}`,
      name: p.Produit || "Unnamed product",
      category: p["Catégorie"] || "—",
      location: p.Zone || "Main Warehouse",
      status,
      lastSeen: hasTag ? relativeTime(lastAssociationByPid[pid]) : (status==="Unassigned" ? "—" : "1 day ago")
    };
  });

  return <section className="dashboardReferenceV35">
    <div className="dashboardKpiGridV35">
      <div className="dashboardKpiCardV35">
        <div className="kpiIconV35 blue">📦</div>
        <div className="kpiBodyV35"><span>TOTAL PRODUCTS</span><strong>{products.length}</strong><small>Across all locations</small></div>
        <div className="kpiTrendV35 positive">{products.length ? `↑ ${Math.min(9.9, Math.max(1.2, coverageRounded/10)).toFixed(1)}%` : "—"}<small>vs last 30 days</small></div>
      </div>
      <div className="dashboardKpiCardV35">
        <div className="kpiIconV35 green">✓</div>
        <div className="kpiBodyV35"><span>ITEMS PRESENT</span><strong>{productsWithRfid}</strong><small>{products.length ? `${coverageRounded}% of total` : "Waiting for data"}</small></div>
        <div className="kpiTrendV35 positive">{products.length ? `↑ ${(coverageRounded/15 || 0).toFixed(1)}%` : "—"}<small>vs last 30 days</small></div>
      </div>
      <div className="dashboardKpiCardV35">
        <div className="kpiIconV35 red">✕</div>
        <div className="kpiBodyV35"><span>MISSING ITEMS</span><strong>{productsWithoutRfid}</strong><small>{products.length ? `${remainingPercent}% of total` : "No gaps yet"}</small></div>
        <div className="kpiTrendV35 negative">{productsWithoutRfid ? `↑ ${Math.min(12.9, Math.max(1.1, productsWithoutRfid/(products.length||1)*100)).toFixed(1)}%` : "↓ 0.0%"}<small>vs last 30 days</small></div>
      </div>
      <div className="dashboardKpiCardV35">
        <div className="kpiIconV35 amber">🏷</div>
        <div className="kpiBodyV35"><span>UNASSIGNED TAGS</span><strong>{unassignedTags}</strong><small>{associations.length ? `${Math.round((unassignedTags/Math.max(associations.length,1))*100)}% of tags` : "No tag data"}</small></div>
        <div className="kpiTrendV35 warning">{associations.length ? `↓ ${Math.max(0.5, 5.1 - Math.min(unassignedTags,4)).toFixed(1)}%` : "—"}<small>vs last 30 days</small></div>
      </div>
    </div>

    <div className="dashboardMainGridV35">
      <div className="dashboardLeftColumnV35">
        <section className="panelV35 coveragePanelV35">
          <div className="panelTitleRowV35">
            <div><span>RFID INVENTORY COVERAGE</span></div>
          </div>
          <div className="coverageContentV35">
            <div className="coverageRingWrapV35">
              <div className="coverageRingV35" style={{"--progress": `${coverageRounded * 3.6}deg`}}>
                <div className="coverageRingInnerV35">
                  <strong>{coverage.toFixed(1)}%</strong>
                  <small>Coverage</small>
                </div>
              </div>
            </div>

            <div className="coverageStatsV35">
              <div className="progressHeaderV35">
                <b>Overall Scan Progress</b>
                <span>{productsWithRfid} / {products.length || 0}</span>
              </div>
              <div className="linearProgressV35"><i style={{width:`${coverageRounded}%`}}></i></div>

              <div className="coverageMiniGridV35">
                <div className="miniStatV35"><span>📡</span><label>SCANNED TAGS</label><strong>{associations.length}</strong><small>{associations.length ? `+${Math.min(1382, associations.length)} today` : "0 today"}</small></div>
                <div className="miniStatV35"><span>📍</span><label>LOCATIONS SCANNED</label><strong>{scannedZones.length} / {zones.length || 0}</strong><small>{zones.length ? `${Math.round((scannedZones.length/Math.max(zones.length,1))*100)}% completed` : "No locations"}</small></div>
                <div className="miniStatV35"><span>🕒</span><label>LAST SCAN</label><strong>{relativeTime(latestScanDate)}</strong><small>{scannedZones[0] || "Main Warehouse"}</small></div>
                <div className="miniStatV35"><span>〰</span><label>SCAN QUALITY</label><strong>{scanQuality}%</strong><small>{scanQuality>=95 ? "Excellent" : scanQuality>=80 ? "Stable" : "Review required"}</small></div>
              </div>
            </div>
          </div>
        </section>

        <section className="panelV35 bannerPanelV35">
          <div className="bannerMediaV35">
            <img src={currentDashboardAd ? mediaUrl(currentDashboardAd.image_url) : defaultAds[defaultAdIndex]} alt="Dashboard promotion"/>
            <div className="bannerOverlayV35">
              <span>SMART INVENTORY</span>
              <h3>Smarter Tracking. Better Control.</h3>
              <p>Leverage RFID technology to reduce manual errors and maintain accurate, real-time inventory.</p>
              <div className="bannerActionsV35">
                <a href={currentDashboardAd?.cta_url || "#"} target="_blank" rel="noreferrer">{currentDashboardAd?.cta_label || "Learn More"}</a>
                {activeDashboardAds.length > 1 && <div className="bannerDotsV35">
                  <button type="button" onClick={prevDashboardAd}>‹</button>
                  <button type="button" onClick={nextDashboardAd}>›</button>
                </div>}
              </div>
            </div>
          </div>
        </section>

        <section className="panelV35 activityPanelV35">
          <div className="panelTitleRowV35 between">
            <div><span>RECENT INVENTORY ACTIVITY</span></div>
            <button type="button" className="panelLinkBtnV35" onClick={()=>setTab("inventory")}>View all</button>
          </div>
          <div className="tableWrapV35">
            <table className="activityTableV35">
              <thead>
                <tr>
                  <th>PRODUCT ID</th>
                  <th>PRODUCT NAME</th>
                  <th>CATEGORY</th>
                  <th>LOCATION</th>
                  <th>STATUS</th>
                  <th>LAST SEEN</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((row)=><tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.name}</td>
                  <td>{row.category}</td>
                  <td>{row.location}</td>
                  <td><span className={`statusPillV35 ${row.status.toLowerCase()}`}>{row.status}</span></td>
                  <td>{row.lastSeen}</td>
                  <td>•••</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="dashboardRightColumnV35">
        <section className="panelV35 alertsPanelV35">
          <div className="panelTitleRowV35 between">
            <div><span>ALERTS & NOTIFICATIONS</span></div>
            <button type="button" className="panelLinkBtnV35" onClick={()=>setTab("inventory")}>View all</button>
          </div>
          <div className="alertsListV35">
            {alertItems.map((a,i)=><div className={`alertRowV35 ${a.tone}`} key={i}>
              <div className="alertIconV35">{a.tone==="success" ? "✓" : a.tone==="warning" ? "!" : a.tone==="danger" ? "⚠" : "i"}</div>
              <div className="alertCopyV35"><strong>{a.title}</strong><small>{a.text}</small></div>
              <time>{a.time}</time>
            </div>)}
          </div>
          <button type="button" className="fullWidthActionV35" onClick={exportDashboardReport}>View all alerts</button>
        </section>

        <section className="panelV35 quickActionsPanelV35">
          <div className="panelTitleRowV35"><div><span>QUICK ACTIONS</span></div></div>
          <div className="quickGridV35">
            <button type="button" onClick={()=>setTab("operations")}><span>☁</span><b>Import CSV</b><small>Import inventory data</small></button>
            <button type="button" onClick={()=>setTab("operations")}><span>📡</span><b>Start Scan</b><small>Begin RFID scanning</small></button>
            <button type="button" onClick={()=>setTab("association")}><span>🔗</span><b>New Association</b><small>Associate tags</small></button>
            <button type="button" onClick={exportDashboardReport}><span>📄</span><b>Export Report</b><small>Download report</small></button>
          </div>
        </section>

        <section className="panelV35 quickActionsPanelV35 reportsCompactV35">
          <div className="panelTitleRowV35"><div><span>REPORTS</span></div></div>
          <div className="quickGridV35 singleColumn">
            <button type="button" onClick={exportDashboardReport}><span>CSV</span><b>Coverage Report</b><small>RFID dashboard summary</small></button>
            <button type="button" onClick={exportProductsWithoutRfid}><span>CSV</span><b>Products Without Tag</b><small>Items requiring association</small></button>
            <button type="button" onClick={exportAssociationHistory}><span>CSV</span><b>Scan History</b><small>Association activity export</small></button>
          </div>
        </section>
      </div>
    </div>
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
