
import React, {useEffect, useMemo, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import axios from "axios";
import Papa from "papaparse";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
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





function App(){
  const [token,setToken]=useState(localStorage.token||"");
  const [me,setMe]=useState(null);
  const [tab,setTab]=useState("operations");
  const [search,setSearch]=useState("");
  const auth={headers:{Authorization:`Bearer ${token}`}};

  useEffect(()=>{ if(token) axios.get(`${API}/me`,auth).then(r=>setMe(r.data)).catch(()=>logout()) },[token]);

  function logout(){ localStorage.removeItem("token"); setToken(""); setMe(null); }

  if(!token) return <Login setToken={setToken}/>;

  const displayName = me?.username || "Utilisateur";
  const accountName = me?.pharmacy_name || displayName;
  const roleName = me?.role==="platform_admin" ? "Administrateur" : "Utilisateur";

  const menu=[
    {id:"operations",label:"Operations",icon:"⌂"},
    {id:"dashboard",label:"Dashboard",icon:"📊"},
    {id:"association",label:"RFID Associations",icon:"🔗"},
    {id:"inventory",label:"Inventory",icon:"▥"},
    {id:"ai",label:"AI Assistant",icon:"✣"},
  ];
  if(me?.role==="platform_admin"){
    menu.push({id:"platform",label:"Clients SaaS",icon:"👥"});
    menu.push({id:"dashboardAdmin",label:"Publicités",icon:"📣"});
  }

  return <div className="appShell whiteShell">
    <aside className="sidebar whiteSidebar">
      <div className="whiteBrand">
        <div className="cubeLogo">◆</div>
        <div className="brandText">PharmaInventory</div>
      </div>

      <nav className="whiteNav">
        {menu.map(m=><button key={m.id} className={tab===m.id ? "whiteNavItem active" : "whiteNavItem"} onClick={()=>setTab(m.id)}>
          <span>{m.icon}</span>
          <b>{m.label}</b>
        </button>)}
      </nav>

      <div className="whiteSideBottom">
        <button className="helpBtn">ⓘ Help & Support</button>
        <button className="whiteLogout" onClick={logout}>↪ Log out</button>
      </div>
    </aside>

    <section className="whiteMain">
      <header className="whiteTopbar">
        <button className="hamburger">☰</button>
        <div className="whiteAccount">
          <div>
            <b>{accountName}</b>
            <small>{roleName}</small>
          </div>
          <span>{displayName.slice(0,1).toUpperCase()}</span>
        </div>
      </header>

      <main className="whiteContent">
        {tab==="operations" && <Operations setTab={setTab}/>}
        {tab==="dashboard" && <Dashboard/>}
        {tab==="ai" && <AIAssistant/>}
        {tab==="association" && <Association/>}
        {tab==="inventory" && <Inventory/>}
        {tab==="platform" && <Platform auth={auth}/>}
        {tab==="dashboardAdmin" && <DashboardAdmin auth={auth}/>}
      </main>
      <footer className="whiteFooter">© 2026 PharmaInventory. All rights reserved.</footer>
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

  function exportProducts(){ exportCSV("produits_locaux.csv",products,Object.keys(products[0]||{})); }
  function exportAssociations(){ exportCSV("associations_rfid.csv",associations,Object.keys(associations[0]||{})); }
  function exportProductsWithoutRfid(){
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
    <p>Exécutez les opérations RFID directement ici : import, scan code-barres, scan EPC, associations, EPC détectés et exports.</p>

    <div className="operationGrid workflowGrid">
      <label className="operationCard white fileCardOp">
        <div className="opIcon">📥</div>
        <h3>Importer CSV pharmacie</h3>
        <p>Importer le catalogue produits.</p>
        <span>Choisir CSV</span>
        <input type="file" accept=".csv" onChange={e=>importProducts(e.target.files[0])}/>
      </label>

      <button className="operationCard blue" onClick={openBarcode}>
        <div className="opIcon">🏷️</div>
        <h3>Scanner code-barres produit</h3>
        <p>Ouvrir une fenêtre pour saisir le code-barres.</p>
      </button>

      <button className="operationCard green" onClick={openEpc}>
        <div className="opIcon">📡</div>
        <h3>Scanner EPC RFID</h3>
        <p>Ouvrir une fenêtre pour saisir le tag EPC.</p>
      </button>

      <div className="operationCard white">
        <div className="opIcon">🔗</div>
        <h3>Associations locales</h3>
        <p>{associations.length} associations RFID locales.</p>
      </div>

      <label className="operationCard white fileCardOp">
        <div className="opIcon">▥</div>
        <h3>Importer EPC détectés</h3>
        <p>Importer un CSV/TXT EPC détectés.</p>
        <span>Choisir fichier</span>
        <input type="file" accept=".csv,.txt" onChange={e=>importDetectedEpc(e.target.files[0])}/>
      </label>

      <button className="operationCard white" onClick={backupProject}>
        <div className="opIcon">💾</div>
        <h3>Sauvegarder projet</h3>
        <p>Backup JSON produits + associations.</p>
      </button>
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
      const r=await axios.post(`${API}/auth/login`,form);
      localStorage.token=r.data.access_token;
      setToken(r.data.access_token);
    }catch(e){
      setErr(e.response?.status===402 ? "Abonnement expiré" : "Connexion échouée. Vérifier utilisateur/mot de passe.");
    }
    setLoading(false);
  }

  return <div className="login pharmaLogin">
    <form onSubmit={login} className="loginCard">
      <div className="loginLogoWrap">
        <div className="pharmaLogo loginLogo"><span></span></div>
      </div>
      <h2>PharmaInventory</h2>
      <p className="loginSub">Smart Inventory Solution pour pharmacies</p>

      <label>Utilisateur</label>
      <input value={u} onChange={e=>setU(e.target.value)} placeholder="Utilisateur"/>

      <label>Mot de passe</label>
      <input value={p} onChange={e=>setP(e.target.value)} placeholder="Mot de passe" type="password"/>

      <button type="submit" className="primaryLoginBtn" disabled={loading}>{loading ? "Connexion..." : "Connexion"}</button>

      {err && <p className="err">{err}</p>}

      <div className="loginHelp">
        <small>Compte démo : demo / demo123</small>
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
  const {products,setProducts,associations,setAssociations}=useLocalStore();
  const [barcode,setBarcode]=useState("");
  const [epc,setEpc]=useState("");
  const [selected,setSelected]=useState(null);
  const [msg,setMsg]=useState("");
  const barcodeRef=useRef(null);
  const epcRef=useRef(null);

  function importProducts(file){
    Papa.parse(file,{header:true,delimiter:";",skipEmptyLines:true,complete:(res)=>{
      const rows=res.data.map(r=>({
        PID:r["PID"]||"",
        Produit:r["Produit"]||"",
        Catégorie:r["Catégorie"]||"",
        TVA:r["TVA"]||"",
        PPV:r["PPV"]||"",
        PPH:r["PPH"]||"",
        Zone:r["Zone"]||"",
        Stock:r["Stock"]||"",
        "Date de péremption":r["Date de péremption"]||"",
        "Stock min":r["Stock min"]||"",
        "Stock max":r["Stock max"]||"",
        "Code barre 1":r["Code barre 1"]||"",
        "Code barre 2":r["Code barre 2"]||""
      })).filter(r=>r.PID && r.Produit);
      setProducts(rows);
      setMsg(`${rows.length} produits importés localement`);
    }});
  }

  function lookup(){
    const p=findProduct(products,barcode);
    if(!p){
      setSelected(null);
      setMsg("Produit introuvable. Vérifier le code-barres/PID ou importer le CSV pharmacie.");
      return;
    }
    setSelected(p);
    setMsg(`Produit trouvé: ${p.Produit} | PID ${p.PID}`);
    setTimeout(()=>epcRef.current?.focus(),50);
  }

  function assignNow(epcValue){
    const e=norm(epcValue||epc);
    if(!selected) return setMsg("Scanner/rechercher un produit d'abord.");
    if(!e) return setMsg("Scanner EPC RFID.");
    const existing=associations.find(a=>norm(a.EPC)===e);
    if(existing && existing.PID!==selected.PID){
      return setMsg(`Erreur: cet EPC est déjà associé au PID ${existing.PID}`);
    }
    const newAssoc=[
      ...associations.filter(a=>norm(a.EPC)!==e),
      {PID:selected.PID,Produit:selected.Produit,"Code barre 1":selected["Code barre 1"],"Code barre 2":selected["Code barre 2"],EPC:e,Date:new Date().toISOString()}
    ];
    setAssociations(newAssoc);
    setMsg(`✓ Association réussie: ${selected.Produit} ↔ ${e}`);
    setBarcode(""); setEpc(""); setSelected(null);
    setTimeout(()=>barcodeRef.current?.focus(),80);
  }

  const assocCols=["PID","Produit","Code barre 1","Code barre 2","EPC","Date"];

  function deleteAssociation(epc){
    if(!confirm(`Supprimer l'association EPC ${epc} ?`)) return;
    const updated = associations.filter(a => norm(a.EPC) !== norm(epc));
    setAssociations(updated);
    setMsg(`Association supprimée: ${epc}`);
  }

  return <section>
    
    <h2>Association RFID locale</h2>
    <p className="notice">Produits et associations restent dans ce navigateur. Rien n'est envoyé au serveur.</p>
    <div className="statsGrid">
      <div className="statCard"><span>Produits</span><b>{products.length}</b><small>catalogue local</small></div>
      <div className="statCard"><span>Associations</span><b>{associations.length}</b><small>tags RFID liés</small></div>
      <div className="statCard"><span>Mode</span><b>Local</b><small>aucune donnée cloud</small></div>
    </div>
    <div className="card">
      <h3>Importer CSV pharmacie</h3>
      <input type="file" accept=".csv" onChange={e=>importProducts(e.target.files[0])}/>
      <p>{products.length} produits chargés localement</p>
    </div>
    <div className="card">
      <h3>1. Scanner code-barres produit</h3>
      <input ref={barcodeRef} autoFocus value={barcode} onChange={e=>setBarcode(e.target.value)}
        onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); lookup(); }}}
        placeholder="Scanner code-barres ou PID puis ENTER"/>
      <button onClick={lookup}>Rechercher produit</button>
    </div>
    {selected && <div className="productBox">
      <h3>Produit trouvé</h3>
      <p><b>{selected.Produit}</b></p>
      <p>PID: {selected.PID} | Zone: {selected.Zone||"-"} | Stock: {selected.Stock||"-"}</p>
    </div>}
    <div className="card">
      <h3>2. Scanner EPC RFID</h3>
      <input ref={epcRef} value={epc} onChange={e=>setEpc(e.target.value)}
        onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); assignNow(e.target.value); }}}
        placeholder="Scanner EPC RFID puis ENTER"/>
      <button onClick={()=>assignNow()}>Associer</button>
    </div>
    <p className={msg.startsWith("✓")?"success":""}>{msg}</p>
    <h3>Associations locales</h3>
    <button onClick={()=>exportCSV("associations_rfid.csv",associations,assocCols)}>Exporter associations CSV</button>
    <input type="file" accept=".csv" onChange={e=>{
      Papa.parse(e.target.files[0],{header:true,delimiter:";",skipEmptyLines:true,complete:(res)=>{
        const rows=res.data.filter(r=>r.PID&&r.EPC);
        setAssociations(rows);
        setMsg(`${rows.length} associations importées`);
      }});
    }}/>
    <button onClick={()=>{ if(confirm("Vider les associations locales ?")) setAssociations([]); }}>Vider associations</button>
    <table>
      <thead>
        <tr>
          {assocCols.map(c=><th key={c}>{c}</th>)}
          <th>Delete</th>
        </tr>
      </thead>
      <tbody>
        {associations.map((a,i)=><tr key={i}>
          {assocCols.map(c=><td key={c}>{String(a[c]??"")}</td>)}
          <td><button className="dangerBtn" onClick={()=>deleteAssociation(a.EPC)}>Delete</button></td>
        </tr>)}
      </tbody>
    </table>
  </section>
}

function Inventory(){
  const {products,associations}=useLocalStore();
  const [epcs,setEpcs]=useState([]);
  const [search,setSearch]=useState("");

  function importEpcs(file){
    Papa.parse(file,{header:false,skipEmptyLines:true,complete:(res)=>{
      const rows=res.data.map(r=>norm(r[0])).filter(e=>e && e!=="EPC" && e.length>=3);
      setEpcs([...new Set(rows)]);
    }});
  }

  const results=useMemo(()=>{
    const detected=new Set(epcs.map(norm));
    return products.map(p=>{
      const productAssoc=associations.filter(a=>String(a.PID)===String(p.PID));
      const epcList=productAssoc.map(a=>norm(a.EPC)).filter(Boolean);
      let Statut="Sans association";
      if(epcList.length>0) Statut=epcList.some(e=>detected.has(e)) ? "Présent" : "Manquant";
      return {...p, Statut, "EPC associés":epcList.join(", ")};
    });
  },[products,associations,epcs]);

  const filtered=results.filter(r=>!search || Object.values(r).join(" ").toLowerCase().includes(search.toLowerCase()));
  const cols=["Statut","PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","EPC associés"];
  const present=results.filter(r=>r.Statut==="Présent").length;
  const missing=results.filter(r=>r.Statut==="Manquant").length;
  const noAssoc=results.filter(r=>r.Statut==="Sans association").length;

  return <section>
    <h2>Inventaire RFID réel</h2>
    <h2>Inventaire RFID réel</h2>
    <p className="notice">Importer un CSV/TXT avec une seule colonne EPC détectés. La comparaison se fait localement.</p>
    <div className="card">
      <h3>Importer EPC détectés</h3>
      <input type="file" accept=".csv,.txt" onChange={e=>importEpcs(e.target.files[0])}/>
      <p>{epcs.length} EPC détectés chargés</p>
    </div>
    <div className="summary">
      <span className="okBox">Présents: {present}</span>
      <span className="badBox">Manquants: {missing}</span>
      <span className="neutralBox">Sans association: {noAssoc}</span>
    </div>
    <div className="row">
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Recherche"/>
      <button onClick={()=>exportCSV("inventaire_rfid_resultat.csv",filtered,cols)}>Exporter résultat CSV</button>
    </div>
    <Table rows={filtered} cols={cols}/>
  </section>
}



function LocalData(){
  const {products,setProducts,associations,setAssociations}=useLocalStore();
  const [msg,setMsg]=useState("");

  function saveProject(){
    const backup={
      app:"PharmaInventory",
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



function Dashboard(){
  const {products,associations}=useLocalStore();
  const associatedPids=new Set(associations.map(a=>String(a.PID)));
  const productsWithRfid=products.filter(p=>associatedPids.has(String(p.PID))).length;
  const productsWithoutRfid=Math.max(products.length-productsWithRfid,0);
  const coverage=products.length ? Math.round((productsWithRfid/products.length)*100) : 0;

  function exportInventoryReport(){
    const rows=products.map(p=>{
      const linked=associations.filter(a=>String(a.PID)===String(p.PID)).map(a=>a.EPC).join(", ");
      return {...p,"EPC associés":linked,"Statut RFID":linked?"Associé":"Sans RFID"};
    });
    exportCSV("rapport_inventaire_rfid.csv",rows,["PID","Produit","Catégorie","Zone","Stock","Code barre 1","Code barre 2","EPC associés","Statut RFID"]);
  }

  function backupProject(){
    downloadJSON("backup_pharmainventory.json",{products,associations,backup_date:new Date().toISOString()});
  }

  return <section className="proDashboard clientDashboard">
    

    <div className="kpiRow">
      <div className="kpiCard"><div className="kpiIcon blue">📦</div><span>Produits locaux</span><b>{products.length}</b><small>catalogue importé</small></div>
      <div className="kpiCard"><div className="kpiIcon green">🔗</div><span>Associations RFID</span><b>{associations.length}</b><small>EPC liés aux produits</small></div>
      <div className="kpiCard"><div className="kpiIcon teal">📡</div><span>Couverture RFID</span><b>{coverage}%</b><small>{productsWithRfid} produits couverts</small></div>
      <div className="kpiCard"><div className="kpiIcon red">🏷️</div><span>Produits sans RFID</span><b>{productsWithoutRfid}</b><small>à couvrir</small></div>
    </div>

    <div className="clientDashGrid">
      <div className="adMainPanel">
        <div className="adMainText">
          <span className="adPill">OFFRE EXCLUSIVE</span>
          <h2>Offre Premium RFID</h2>
          <p>Passez à la vitesse supérieure avec une solution RFID professionnelle pour pharmacie.</p>
          <div className="adFeatureGrid">
            <div><span>⏱️</span><b>Traçabilité fiable</b><small>Suivi clair de vos produits</small></div>
            <div><span>🛡️</span><b>Réduction des pertes</b><small>Moins d’écarts et de ruptures</small></div>
            <div><span>📊</span><b>Données exploitables</b><small>Décisions rapides</small></div>
          </div>
          <button className="adButton">Découvrir l’offre Premium →</button>
        </div>
        <div className="adVisual">
          <div className="box3d bigBox">PharmaInventory</div>
          <div className="tag3d bigTag">RFID</div>
        </div>
      </div>

      <div className="sideAdStack">
        <div className="miniAdCard tealAd"><span>🎓 Service</span><h3>Formation inventaire RFID</h3><p>Améliorez la couverture RFID avec votre équipe.</p></div>
        <div className="miniAdCard blueAd"><span>⭐ Premium</span><h3>Support Premium</h3><p>Accompagnement prioritaire pour vos inventaires.</p></div>
      </div>
    </div>

    <div className="bottomGrid betterBottom">
      <div className="smallPanel realtimePanel">
        <h3>Inventaire en temps réel</h3>
        <div className="donut"><span>{associations.length}</span></div>
        <p>Associés: {productsWithRfid} · Non associés: {productsWithoutRfid}</p>
      </div>

      <div className="smallPanel alertsPanel">
        <h3>Alertes et anomalies</h3>
        {productsWithoutRfid>0 ? 
          <ul className="alertList"><li><span>🏷️</span><div><b>{productsWithoutRfid} produits sans RFID</b><small>À associer progressivement.</small></div></li></ul> :
          <div className="noAnomaly">✅ Pas d’anomalies détectées</div>}
      </div>

      <div className="smallPanel reportsPanel">
        <div className="sectionTitle"><b>Reports & Exports</b></div>
        <div className="reportCards">
          <div className="reportCard"><span>📄</span><div><b>Rapport d’inventaire</b><small>Produits et associations</small></div><button onClick={exportInventoryReport}>Exporter</button></div>
          <div className="reportCard"><span>💾</span><div><b>Sauvegarde projet</b><small>Backup local JSON</small></div><button onClick={backupProject}>Backup</button></div>
        </div>
      </div>
    </div>
  </section>
}


function DashboardAdmin({auth}){
  const [items,setItems]=useState([]);
  const [clients,setClients]=useState([]);
  const [scope,setScope]=useState("global");
  const [target,setTarget]=useState("");
  const [title,setTitle]=useState("");
  const [message,setMessage]=useState("");
  const [type,setType]=useState("conseil");
  const [ctaLabel,setCtaLabel]=useState("");
  const [ctaUrl,setCtaUrl]=useState("");
  const [imageUrl,setImageUrl]=useState("");
  const [msg,setMsg]=useState("");

  async function load(){
    try{
      setItems((await axios.get(`${API}/platform/dashboard-content`,auth)).data);
      setClients((await axios.get(`${API}/platform/clients`,auth)).data.filter(c=>c.role!=="platform_admin"));
    }catch(e){ setMsg(e.response?.data?.detail || "Erreur chargement dashboard admin"); }
  }
  useEffect(()=>{load()},[]);

  async function create(){
    try{
      await axios.post(`${API}/platform/dashboard-content`,{scope,target_username:scope==="pharmacy"?target:null,title,message,content_type:type,cta_label:ctaLabel,cta_url:ctaUrl,image_url:imageUrl,active:true},auth);
      setTitle(""); setMessage(""); setCtaLabel(""); setCtaUrl(""); setImageUrl(""); setMsg("Contenu dashboard créé."); load();
    }catch(e){ setMsg(e.response?.data?.detail || "Erreur création contenu"); }
  }
  async function toggle(id){ await axios.post(`${API}/platform/dashboard-content-toggle/${id}`,{},auth); load(); }
  async function del(id){ if(!confirm("Supprimer ce contenu dashboard ?")) return; await axios.post(`${API}/platform/dashboard-content-delete/${id}`,{},auth); load(); }

  return <section>
    <h2>Gestion du Dashboard marketing</h2>
    <p className="notice">Créer des annonces globales pour toutes les pharmacies ou des messages ciblés pour une pharmacie spécifique.</p>
    <div className="card">
      <h3>Nouveau contenu</h3>
      <div className="row">
        <select value={scope} onChange={e=>setScope(e.target.value)}><option value="global">Toutes les pharmacies</option><option value="pharmacy">Pharmacie spécifique</option></select>
        {scope==="pharmacy" && <select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choisir pharmacie</option>{clients.map(c=><option key={c.username} value={c.username}>{c.pharmacy_name} ({c.username})</option>)}</select>}
        <select value={type} onChange={e=>setType(e.target.value)}><option value="conseil">Conseil</option><option value="promo">Publicité</option><option value="annonce">Annonce</option><option value="info">Info</option></select>
      </div>
      <input placeholder="Titre" value={title} onChange={e=>setTitle(e.target.value)} style={{width:"100%"}}/>
      <textarea className="textArea" placeholder="Message" value={message} onChange={e=>setMessage(e.target.value)} />
      <div className="row"><input placeholder="Bouton CTA" value={ctaLabel} onChange={e=>setCtaLabel(e.target.value)}/><input placeholder="URL CTA https://..." value={ctaUrl} onChange={e=>setCtaUrl(e.target.value)}/><input placeholder="URL image publicité https://..." value={imageUrl} onChange={e=>setImageUrl(e.target.value)}/><button onClick={create}>Publier</button></div>
    </div>
    <p className={msg.includes("Erreur")?"err":"success"}>{msg}</p>
    <table><thead><tr><th>Type</th><th>Portée</th><th>Pharmacie</th><th>Titre</th><th>Message</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
      {items.map(i=><tr key={i.id}><td>{i.content_type}</td><td>{i.scope==="global"?"Toutes":"Ciblée"}</td><td>{i.target_username||"-"}</td><td>{i.title}</td><td>{i.message}</td><td>{i.active?"active":"inactive"}</td><td><button onClick={()=>toggle(i.id)}>{i.active?"Désactiver":"Activer"}</button><button className="dangerBtn" onClick={()=>del(i.id)}>Delete</button></td></tr>)}
    </tbody></table>
  </section>
}


function Table({rows,cols}){
  return <table><thead><tr>{cols.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>
    {rows.map((r,i)=><tr key={i} className={r.Statut==="Présent"?"ok":r.Statut==="Manquant"?"bad":r.Statut==="Sans association"?"neutral":""}>{cols.map(c=><td key={c}>{String(r[c]??"")}</td>)}</tr>)}
  </tbody></table>
}

createRoot(document.getElementById("root")).render(<App/>);
