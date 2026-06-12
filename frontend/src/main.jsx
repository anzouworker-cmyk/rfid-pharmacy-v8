
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
  const [tab,setTab]=useState("association");
  const auth={headers:{Authorization:`Bearer ${token}`}};

  useEffect(()=>{ if(token) axios.get(`${API}/me`,auth).then(r=>setMe(r.data)).catch(()=>logout()) },[token]);

  function logout(){ localStorage.removeItem("token"); setToken(""); setMe(null); }

  if(!token) return <Login setToken={setToken}/>;

  return <div>
    <header>
      <b>RFID Pharmacy Web SaaS V10</b>
      <span>{me?.pharmacy_name} | expire: {me?.expires_at?.slice(0,10)}</span>
      <button onClick={()=>setTab("association")}>Association RFID</button>
      <button onClick={()=>setTab("inventory")}>Inventaire réel</button>
      <button onClick={()=>setTab("data")}>Données locales</button>
      {me?.role==="platform_admin" && <button onClick={()=>setTab("platform")}>Clients</button>}
      <button onClick={logout}>Fermer session</button>
    </header>
    <main>
      {tab==="association" && <Association/>}
      {tab==="inventory" && <Inventory/>}
      {tab==="data" && <LocalData/>}
      {tab==="platform" && <Platform auth={auth}/>}
    </main>
  </div>
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
    <h2>Connexion SaaS</h2>
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

  return <section>
    <h2>Association RFID locale</h2>
    <p className="notice">Produits et associations restent dans ce navigateur. Rien n'est envoyé au serveur.</p>
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
    <Table rows={associations} cols={assocCols}/>
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
      setClients((await axios.get(`${API}/platform/clients`,auth)).data);
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
      load();
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur création client");
    }
  }

  async function setClientActive(u, active){
    try{
      await axios.post(`${API}/platform/set-active/${encodeURIComponent(u)}?active=${active}`,{},auth);
      setMsg(active ? "Client activé." : "Client désactivé.");
      load();
    }catch(e){
      setMsg(e.response?.data?.detail || "Erreur changement statut");
    }
  }

  async function deleteClient(u){
    if(!confirm(`Supprimer définitivement le client ${u} ?`)) return;
    try{
      await axios.delete(`${API}/platform/delete-client/${encodeURIComponent(u)}`,auth);
      setMsg("Client supprimé.");
      load();
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
    const d=prompt(`Nouvelle date expiration pour ${u} (YYYY-MM-DD):`, currentDate?.slice(0,10) || "");
    if(!d) return;
    try{
      await axios.post(`${API}/platform/update-expiry/${encodeURIComponent(u)}`,{expires_at:d},auth);
      setMsg(`Date expiration changée pour ${u}.`);
      load();
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
          const isAdmin=c.username==="admin";
          const expDate=c.expires_at?.slice(0,10);
          return <tr key={c.username}>
            <td>{c.username}</td>
            <td>{c.pharmacy_name}</td>
            <td>{c.subscription_status}</td>
            <td>{c.active ? "active" : "inactive"}</td>
            <td>
              {expDate}
              <br/>
              <button onClick={()=>changeExpiry(c.username, expDate)}>Changer date</button>
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

function Table({rows,cols}){
  return <table><thead><tr>{cols.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>
    {rows.map((r,i)=><tr key={i} className={r.Statut==="Présent"?"ok":r.Statut==="Manquant"?"bad":r.Statut==="Sans association"?"neutral":""}>{cols.map(c=><td key={c}>{String(r[c]??"")}</td>)}</tr>)}
  </tbody></table>
}

createRoot(document.getElementById("root")).render(<App/>);
