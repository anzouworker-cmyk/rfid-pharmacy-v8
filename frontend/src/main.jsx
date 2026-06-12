
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
  const [tab,setTab]=useState("dashboard");
  const auth={headers:{Authorization:`Bearer ${token}`}};

  useEffect(()=>{ if(token) axios.get(`${API}/me`,auth).then(r=>setMe(r.data)).catch(()=>logout()) },[token]);

  function logout(){ localStorage.removeItem("token"); setToken(""); setMe(null); }

  if(!token) return <Login setToken={setToken}/>;

  const menu=[
    {id:"dashboard",label:"Dashboard",icon:"📊"},
    {id:"ai",label:"Assistant IA",icon:"🤖"},
    {id:"association",label:"Association RFID",icon:"📡"},
    {id:"inventory",label:"Inventaire réel",icon:"📦"},
    {id:"data",label:"Données locales",icon:"💾"},
  ];
  if(me?.role==="platform_admin"){
    menu.push({id:"platform",label:"Clients SaaS",icon:"👥"});
    menu.push({id:"dashboardAdmin",label:"Dashboard Admin",icon:"📣"});
  }

  return <div className="appShell">
    <aside className="sidebar">
      <div className="brand">
        <div className="brandIcon">RF</div>
        <div><div className="brandTitle">RFID Pharmacy</div><div className="brandSub">RFID Pharmacy SaaS V16 AI</div></div>
      </div>
      <nav className="navMenu">
        {menu.map(m=><button key={m.id} className={tab===m.id ? "navItem active" : "navItem"} onClick={()=>setTab(m.id)}>
          <span>{m.icon}</span><span>{m.label}</span>
        </button>)}
      </nav>
      <div className="sidebarFooter">
        <div className="pharmacyBadge"><small>Pharmacie</small><b>{me?.pharmacy_name}</b></div>
        <button className="logoutBtn" onClick={logout}>Déconnexion</button>
      </div>
    </aside>
    <section className="mainArea">
      <header className="topbar">
        <div>
          <h1>{tab==="dashboard"?"Dashboard":tab==="ai"?"Assistant IA RFID":tab==="association"?"Association RFID":tab==="inventory"?"Inventaire RFID réel":tab==="data"?"Données locales":tab==="dashboardAdmin"?"Gestion Dashboard":"Gestion clients SaaS"}</h1>
          <p>Gestion RFID pharmacie sans stockage métier dans le cloud.</p>
        </div>
        <div className="accountCard">
          <span>{me?.username}</span>
          <b>{me?.expires_at ? `Expire: ${me.expires_at.slice(0,10)}` : "Admin plateforme"}</b>
        </div>
      </header>
      <main className="content">
        {tab==="dashboard" && <Dashboard/>}
        {tab==="ai" && <AIAssistant/>}
        {tab==="association" && <Association/>}
        {tab==="inventory" && <Inventory/>}
        {tab==="data" && <LocalData/>}
        {tab==="platform" && <Platform auth={auth}/>}
        {tab==="dashboardAdmin" && <DashboardAdmin auth={auth}/>}
      </main>
    </section>
  </div>
}




function AIAssistant(){
  const {products,associations}=useLocalStore();
  const [epcs,setEpcs]=useState([]);
  const [question,setQuestion]=useState("");
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(false);
  const token=localStorage.token||"";
  const auth={headers:{Authorization:`Bearer ${token}`}};

  function importEpcs(file){
    Papa.parse(file,{header:false,skipEmptyLines:true,complete:(res)=>{
      const rows=res.data.map(r=>norm(r[0])).filter(e=>e && e!=="EPC" && e.length>=3);
      setEpcs([...new Set(rows)]);
    }});
  }

  function computeStats(){
    const associatedPids=new Set(associations.map(a=>String(a.PID)));
    const productsWithRfid=products.filter(p=>associatedPids.has(String(p.PID))).length;
    const productsWithoutRfid=Math.max(products.length-productsWithRfid,0);
    const coverage=products.length ? Math.round((productsWithRfid/products.length)*100) : 0;
    const detected=new Set(epcs.map(norm));
    let present=0, missing=0, noAssoc=0;
    products.forEach(p=>{
      const productAssoc=associations.filter(a=>String(a.PID)===String(p.PID));
      const epcList=productAssoc.map(a=>norm(a.EPC)).filter(Boolean);
      if(epcList.length===0) noAssoc++;
      else if(epcList.some(e=>detected.has(e))) present++;
      else missing++;
    });
    return {products_count:products.length,associations_count:associations.length,products_with_rfid:productsWithRfid,products_without_rfid:productsWithoutRfid,coverage,detected_epc_count:epcs.length,present_count:present,missing_count:missing,no_association_count:noAssoc};
  }

  async function analyze(customQuestion=""){
    setLoading(true); setResult(null);
    try{
      const r=await axios.post(`${API}/ai/analyze`,{...computeStats(),question:customQuestion||question},auth);
      setResult(r.data);
    }catch(e){
      setResult({mode:"frontend-error",analysis:{score:0,niveau:"Erreur",resume:e.response?.data?.detail||"Erreur IA",recommandations:[],alertes:[],prochaine_action:"Vérifier backend / OPENAI_API_KEY"}});
    }
    setLoading(false);
  }

  const stats=computeStats();
  const analysis=result?.analysis;

  return <section>
    <div className="heroCard aiHero">
      <div>
        <span className="pill">Assistant IA Premium</span>
        <h2>Analyse intelligente de votre couverture RFID</h2>
        <p>L’IA transforme vos données locales en recommandations simples pour améliorer l’inventaire et réduire les manquants.</p>
      </div>
      <div className="heroActions">
        <span className="statusBadge successBadge">Score actuel: {stats.coverage}/100</span>
        <span className="statusBadge infoBadge">{products.length} produits</span>
      </div>
    </div>

    <div className="statsGrid proStats">
      <div className="statCard"><span>Couverture RFID</span><b>{stats.coverage}%</b><small>{stats.products_without_rfid} sans RFID</small></div>
      <div className="statCard"><span>Associations</span><b>{stats.associations_count}</b><small>tags liés</small></div>
      <div className="statCard"><span>Présents détectés</span><b>{stats.present_count}</b><small>selon EPC importés</small></div>
      <div className="statCard"><span>Manquants</span><b>{stats.missing_count}</b><small>associés non détectés</small></div>
    </div>

    <div className="grid">
      <div className="card">
        <h3>Analyse IA</h3>
        <input type="file" accept=".csv,.txt" onChange={e=>importEpcs(e.target.files[0])}/>
        <p>{epcs.length} EPC détectés chargés.</p>
        <textarea className="textArea" placeholder="Question: Comment améliorer ma couverture RFID ?" value={question} onChange={e=>setQuestion(e.target.value)} />
        <button onClick={()=>analyze()} disabled={loading}>{loading?"Analyse en cours...":"Analyser avec IA"}</button>
      </div>
      <div className="card">
        <h3>Questions rapides</h3>
        <div className="quickGrid">
          <button onClick={()=>analyze("Analyse ma couverture RFID et donne les priorités.")}>Analyser couverture</button>
          <button onClick={()=>analyze("Quels sont les risques dans mon inventaire RFID ?")}>Identifier risques</button>
          <button onClick={()=>analyze("Donne un plan d'action pour atteindre 95% de couverture RFID.")}>Plan 95%</button>
          <button onClick={()=>analyze("Explique les anomalies manquants et sans association.")}>Anomalies</button>
        </div>
      </div>
    </div>

    {analysis && <div className="aiResult">
      <div className="aiScore"><span>Score IA</span><b>{analysis.score ?? stats.coverage}</b><small>{analysis.niveau || result?.mode}</small></div>
      <div className="aiPanel">
        <h3>Résumé</h3><p>{analysis.resume || analysis.summary}</p>
        {(analysis.recommandations || analysis.recommendations || []).length>0 && <><h3>Recommandations</h3><ul className="steps">{(analysis.recommandations || analysis.recommendations).map((x,i)=><li key={i}>{x}</li>)}</ul></>}
        {(analysis.alertes || analysis.risks || []).length>0 && <><h3>Alertes / Risques</h3><ul className="steps">{(analysis.alertes || analysis.risks).map((x,i)=><li key={i}>{x}</li>)}</ul></>}
        {analysis.prochaine_action && <><h3>Prochaine action</h3><p><b>{analysis.prochaine_action}</b></p></>}
      </div>
    </div>}
  </section>
}


function Dashboard(){
  const {products,associations}=useLocalStore();
  const [content,setContent]=useState([]);
  const token=localStorage.token||"";
  const auth={headers:{Authorization:`Bearer ${token}`}};

  useEffect(()=>{
    axios.get(`${API}/dashboard/content`,auth).then(r=>setContent(r.data)).catch(()=>setContent([]));
  },[]);

  const associatedPids=new Set(associations.map(a=>String(a.PID)));
  const productsWithRfid=products.filter(p=>associatedPids.has(String(p.PID))).length;
  const productsWithoutRfid=Math.max(products.length-productsWithRfid,0);
  const coverage=products.length ? Math.round((productsWithRfid/products.length)*100) : 0;

  const defaultContent=[
    {id:"default1",content_type:"conseil",title:"Conseil professionnel",message:"Sauvegardez votre projet JSON à la fin de chaque journée pour éviter toute perte locale.",cta_label:"",cta_url:""},
    {id:"default2",content_type:"promo",title:"Optimisez votre inventaire RFID",message:"Un taux de couverture RFID élevé réduit les écarts d’inventaire et accélère les audits magasin.",cta_label:"",cta_url:""}
  ];
  const cards=content.length ? content : defaultContent;

  return <section>
    <div className="heroCard marketingHero">
      <div>
        <span className="pill">Solution SaaS RFID pour pharmacies</span>
        <h2>Pilotez votre inventaire avec rapidité, précision et contrôle</h2>
        <p>Accès par abonnement, données produits/EPC conservées localement par la pharmacie, exports et sauvegardes projet.</p>
      </div>
      <div className="heroActions">
        <span className="statusBadge successBadge">Service actif</span>
        <span className="statusBadge infoBadge">Données métier locales</span>
      </div>
    </div>

    <div className="statsGrid proStats">
      <div className="statCard"><span>Produits locaux</span><b>{products.length}</b><small>catalogue importé</small></div>
      <div className="statCard"><span>Associations RFID</span><b>{associations.length}</b><small>EPC liés aux produits</small></div>
      <div className="statCard"><span>Couverture RFID</span><b>{coverage}%</b><small>{productsWithoutRfid} produits sans RFID</small></div>
      <div className="statCard"><span>Mode données</span><b>Local</b><small>pas de stockage métier cloud</small></div>
    </div>

    <h2>Messages, conseils et annonces</h2>
    <div className="marketingGrid">
      {cards.map(c=><div key={c.id} className={`marketingCard ${c.content_type||"info"}`}>
        <div className="cardType">{c.content_type||"info"}</div>
        <h3>{c.title}</h3>
        <p>{c.message}</p>
        {c.cta_label && c.cta_url && <a className="ctaLink" href={c.cta_url} target="_blank">{c.cta_label}</a>}
      </div>)}
    </div>

    <div className="grid">
      <div className="card"><h3>Plan d’action recommandé</h3><ol className="steps"><li>Importer le CSV pharmacie.</li><li>Associer les produits prioritaires avec leurs EPC RFID.</li><li>Faire une sauvegarde projet JSON.</li><li>Importer les EPC détectés et analyser les manquants.</li></ol></div>
      <div className="card"><h3>Indicateurs pertinents</h3><ul className="steps"><li>Couverture RFID actuelle : {coverage}%.</li><li>Produits sans RFID : {productsWithoutRfid}.</li><li>Associations disponibles : {associations.length}.</li><li>Catalogue local : {products.length} produits.</li></ul></div>
    </div>
  </section>
}

function Login({setToken}){
  const [u,setU]=useState("demo"), [p,setP]=useState("demo123"), [err,setErr]=useState("");
  async function login(e){
    e.preventDefault();
    const form=new URLSearchParams(); form.append("username",u); form.append("password",p);
    try{ const r=await axios.post(`${API}/auth/login`,form); localStorage.token=r.data.access_token; setToken(r.data.access_token); }
    catch(e){ setErr(e.response?.status===402 ? "Abonnement expiré" : "Connexion échouée"); }
  }
  return <div className="login"><form onSubmit={login}>
    <h2>RFID Pharmacy SaaS</h2><p className="loginSub">Plateforme professionnelle de gestion RFID pour pharmacies</p>
    <input value={u} onChange={e=>setU(e.target.value)} placeholder="Utilisateur"/>
    <input value={p} onChange={e=>setP(e.target.value)} placeholder="Mot de passe" type="password"/>
    <button>Connexion</button>
    <p className="err">{err}</p>
    <small>Démo: demo / demo123</small>
  </form></div>
}

function findProduct(products,value){
  const v=String(value||"").trim();
  return products.find(p => 
    String(p.PID||"").trim()===v ||
    String(p["Code barre 1"]||"").trim()===v ||
    String(p["Code barre 2"]||"").trim()===v
  );
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
      app:"RFID Pharmacy Web SaaS NoData",
      version:"V8",
      backup_date:new Date().toISOString(),
      products,
      associations,
      settings:{
        storage:"local-browser",
        cloud_business_data:false
      }
    };
    const d=new Date().toISOString().slice(0,10);
    downloadJSON(`pharmacie_backup_${d}.json`, backup);
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

  return <section>
    <h2>Données locales & sauvegarde projet</h2>
    <p className="notice">Ces données sont dans localStorage du navigateur, pas dans le cloud. Utilise la sauvegarde JSON pour changer de PC ou faire une copie de sécurité.</p>

    <div className="summary">
      <span className="neutralBox">Produits: {products.length}</span>
      <span className="neutralBox">Associations RFID: {associations.length}</span>
    </div>

    <div className="card">
      <h3>Sauvegarde complète</h3>
      <button onClick={saveProject}>Sauvegarder projet JSON</button>
      <p>Contient produits + associations RFID + paramètres locaux.</p>
    </div>

    <div className="card">
      <h3>Restauration complète</h3>
      <input type="file" accept=".json" onChange={e=>restoreProject(e.target.files[0])}/>
      <p>Charge un fichier pharmacie_backup_YYYY-MM-DD.json.</p>
    </div>

    <div className="card">
      <h3>Exports CSV séparés</h3>
      <button onClick={()=>exportCSV("produits_locaux.csv",products,Object.keys(products[0]||{}))}>Exporter produits locaux</button>
      <button onClick={()=>exportCSV("associations_locales.csv",associations,Object.keys(associations[0]||{}))}>Exporter associations locales</button>
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
      await axios.post(`${API}/platform/create-client`,{username,password,pharmacy_name:pharmacy,days:Number(days)},auth);
      setUsername(""); setPassword(""); setPharmacy(""); setDays(30);
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

  return <section>
    <h2>Gestion clients SaaS</h2>

    <div className="card">
      <h3>Créer un client pharmacie</h3>
      <input placeholder="username" value={username} onChange={e=>setUsername(e.target.value)}/>
      <input placeholder="password" value={password} onChange={e=>setPassword(e.target.value)}/>
      <input placeholder="nom pharmacie" value={pharmacy} onChange={e=>setPharmacy(e.target.value)}/>
      <input placeholder="jours" value={days} onChange={e=>setDays(e.target.value)}/>
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
            <td>{isAdmin ? "" : <button onClick={()=>setClientActive(c.username,!c.active)}>{c.active ? "Désactiver" : "Activer"}</button>}</td>
            <td>{isAdmin ? "" : <button className="dangerBtn" onClick={()=>deleteClient(c.username)}>Delete</button>}</td>
          </tr>
        })}
      </tbody>
    </table>
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
      await axios.post(`${API}/platform/dashboard-content`,{scope,target_username:scope==="pharmacy"?target:null,title,message,content_type:type,cta_label:ctaLabel,cta_url:ctaUrl,active:true},auth);
      setTitle(""); setMessage(""); setCtaLabel(""); setCtaUrl(""); setMsg("Contenu dashboard créé."); load();
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
      <div className="row"><input placeholder="Bouton CTA" value={ctaLabel} onChange={e=>setCtaLabel(e.target.value)}/><input placeholder="URL CTA https://..." value={ctaUrl} onChange={e=>setCtaUrl(e.target.value)}/><button onClick={create}>Publier</button></div>
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
