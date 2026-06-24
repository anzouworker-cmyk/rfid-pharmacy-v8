import React from "react";
import shuffleCss from "./shuffle-home.css?raw";

function CubeIcon({className=""}){
  return <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>;
}

const authClick = (goLogin) => (e) => {
  e.preventDefault();
  goLogin(e);
};

function IndexSectionCustomComponents1({goLogin}){
  return <nav className="border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50 py-4 px-6 md:px-12">
    <div className="max-w-7xl mx-auto flex items-center justify-between">
      <a href="#home" className="flex items-center gap-3" onClick={(e)=>{e.preventDefault(); window.scrollTo({top:0, behavior:'smooth'});}}>
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
          <CubeIcon className="w-5 h-5" />
        </div>
        <span className="font-heading font-bold text-xl tracking-tight text-slate-900">Smart Inventory</span>
      </a>
      <div className="hidden lg:flex items-center gap-8">
        <a href="#dashboard" className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">Dashboard</a>
        <a href="#operations-panel" className="text-sm font-medium text-indigo-600 border-b-2 border-indigo-600 pb-1">Opérations</a>
        <a href="#associations" className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">Associations</a>
        <a href="#inventaire" className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">Inventaire</a>
        <a href="#assistant-ai" className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1.5">
          <span>Assistant AI</span>
          <span className="px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 font-bold rounded-full uppercase tracking-wider">New</span>
        </a>
      </div>
      <div className="flex items-center gap-4">
        <a href="#login" onClick={authClick(goLogin)} className="hidden sm:inline-flex text-sm font-medium text-slate-600 hover:text-slate-900">Connexion</a>
        <a href="#login" onClick={authClick(goLogin)} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm hover:shadow-indigo-100 hover:shadow-lg">Essai gratuit</a>
      </div>
    </div>
  </nav>;
}

function IndexSectionCustomComponents2({goLogin}){
  return <section className="py-16 md:py-24 px-6 md:px-12 bg-gradient-to-b from-white via-[#fafbfe] to-slate-50">
    <div className="max-w-7xl mx-auto text-center">
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-semibold text-indigo-700 mb-6"><span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
        Redéfinir la gestion d'inventaire SaaS
      </span>
      <h1 className="font-heading text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 max-w-4xl mx-auto leading-tight">
        Pilotez vos <span className="shuffle-gradient-title text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-indigo-800">Opérations de Stock</span> et de Caisse en un seul écran
      </h1>
      <p className="mt-6 text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
        Importez vos catalogues de pharmacies, automatisez les rapprochements de caisse et synchronisez votre comptabilité avec un tableau de bord ultra-fluide.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <a href="#login" onClick={authClick(goLogin)} className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl transition-all shadow-md">Accéder à l'application</a>
        <a href="#operations-panel" className="px-6 py-3.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2"><svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Voir la démo interactive
        </a>
      </div>
    </div>
  </section>;
}

function OperationsPanel(){
  return <section id="operations-panel" className="py-12 pb-24 px-4 md:px-8 bg-slate-50">
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-400" />
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              <span className="w-3 h-3 rounded-full bg-emerald-400" />
            </div>
            <span className="text-xs font-semibold text-slate-500 ml-4 font-mono">app.smartinventory.io/operations</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 bg-slate-200/50 px-2 py-1 rounded">2026 Stable</span>
          </div>
        </div>
        <div className="p-6 md:p-8 space-y-12">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17" />
                </svg>
              </div>
              <div>
                <h3 className="font-heading text-lg font-bold text-slate-900">Actions Inventaire</h3>
                <p className="text-xs text-slate-500">Gérez vos importations de stocks et synchronisez vos fichiers en un clic.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all flex flex-col justify-between">
                <div>
                  <span className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 inline-block mb-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </span>
                  <h4 className="font-semibold text-sm text-slate-900">Importer CSV pharmacie</h4>
                  <p className="text-xs text-slate-500 mt-1">Mettez à jour le catalogue complet de votre officine.</p>
                </div>
                <button className="mt-4 w-full py-2 bg-white border border-slate-200 hover:border-indigo-600 hover:text-indigo-600 text-xs font-semibold text-slate-700 rounded-lg transition-colors">Choisir CSV</button>
              </div>
              <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all flex flex-col justify-between">
                <div>
                  <span className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 inline-block mb-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                  </span>
                  <h4 className="font-semibold text-sm text-slate-900">Importer associations</h4>
                  <p className="text-xs text-slate-500 mt-1">Associez automatiquement vos codes barres et références.</p>
                </div>
                <button className="mt-4 w-full py-2 bg-white border border-slate-200 hover:border-indigo-600 hover:text-indigo-600 text-xs font-semibold text-slate-700 rounded-lg transition-colors">Choisir CSV</button>
              </div>
              <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all flex flex-col justify-between">
                <div>
                  <span className="p-2.5 rounded-lg bg-rose-50 text-rose-600 inline-block mb-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-16v1a3 3 0 003 3h10M9 3h6m2 5V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </span>
                  <h4 className="font-semibold text-sm text-slate-900">Supprimer stock manquant</h4>
                  <p className="text-xs text-slate-500 mt-1">Nettoyez votre base de données des entrées obsolètes.</p>
                </div>
                <button className="mt-4 w-full py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-semibold rounded-lg transition-colors">Exécuter</button>
              </div>
              <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md hover:border-indigo-100 transition-all flex flex-col justify-between">
                <div>
                  <span className="p-2.5 rounded-lg bg-amber-50 text-amber-600 inline-block mb-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                  </span>
                  <h4 className="font-semibold text-sm text-slate-900">Scanner & Vérifier</h4>
                  <p className="text-xs text-slate-500 mt-1">Contrôle rapide des écarts d'inventaire physiques.</p>
                </div>
                <button className="mt-4 w-full py-2 bg-white border border-slate-200 hover:border-indigo-600 hover:text-indigo-600 text-xs font-semibold text-slate-700 rounded-lg transition-colors">Scanner</button>
              </div>
            </div>
          </div>
          <div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-t border-slate-100 pt-8 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" /></svg>
                </div>
                <div>
                  <h3 className="font-heading text-lg font-bold text-slate-900">Opérations de caisse</h3>
                  <p className="text-xs text-slate-500">Suivi des flux financiers entrants et sortants.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-100 text-xs font-semibold text-rose-600"><span className="w-1.5 h-1.5 rounded-full bg-rose-600"/> Montant manquant: 0 DH</span>
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs font-semibold text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-600"/> Montant surplus: 0 DH</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                'Retrait par jour','Versement global','Retraits global','Bénéfice net','Règlements reçus','Règlements à payer'
              ].map((label,idx)=><div key={label} className="p-5 rounded-xl border border-slate-100 bg-slate-50/40 text-center">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
                <div className="mt-2 font-heading text-xl font-extrabold text-slate-900">{idx>=4?'+':'−'} DH 0</div>
                <button className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 text-xs font-semibold rounded transition-colors">Détails</button>
              </div>)}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-6 border-t border-slate-100 pt-8">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              </div>
              <div>
                <h3 className="font-heading text-lg font-bold text-slate-900">Exports et Sauvegardes locales</h3>
                <p className="text-xs text-slate-500">Sécurisez vos données critiques et exportez vos tables au format standard.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md transition-all flex justify-between items-center">
                <div><h4 className="font-semibold text-sm text-slate-900">Catalogue de produits</h4><p className="text-xs text-slate-500 mt-0.5">Export complet de la base articles.</p></div>
                <button className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors">Exporter</button>
              </div>
              <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md transition-all flex justify-between items-center">
                <div><h4 className="font-semibold text-sm text-slate-900">Historique des ventes</h4><p className="text-xs text-slate-500 mt-0.5">Exportez toutes les sessions actives.</p></div>
                <button className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors">Exporter</button>
              </div>
              <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:shadow-md transition-all flex justify-between items-center">
                <div><h4 className="font-semibold text-sm text-slate-900">Sauvegarde Complète (JSON)</h4><p className="text-xs text-slate-500 mt-0.5">Fichier de restauration complet.</p></div>
                <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors">Créer backup</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

function AiSection(){
  return <section id="assistant-ai" className="py-20 px-6 md:px-12 bg-white">
    <div className="max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-5 space-y-6">
          <span className="text-sm font-bold tracking-widest text-indigo-600 uppercase">Algorithmes intelligents</span>
          <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-slate-900 leading-tight">L'Assistant AI au service de votre rentabilité</h2>
          <p className="text-slate-600 leading-relaxed">Notre assistant intelligent analyse en continu vos historiques de vente pour anticiper les ruptures de stock, suggérer des ajustements de prix automatiques et optimiser vos commandes fournisseurs.</p>
          <div className="space-y-4 pt-4">
            <div className="flex items-start gap-3.5"><div className="mt-1 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg></div><div><h4 className="font-bold text-slate-900 text-sm">Détection intelligente d'anomalies de caisse</h4><p className="text-xs text-slate-500 mt-0.5">Repérez instantanément les écarts injustifiés entre stock réel et virtuel.</p></div></div>
            <div className="flex items-start gap-3.5"><div className="mt-1 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg></div><div><h4 className="font-bold text-slate-900 text-sm">Recommandations prédictives</h4><p className="text-xs text-slate-500 mt-0.5">Sachez exactement quels produits commander avant la haute saison.</p></div></div>
          </div>
        </div>
        <div className="lg:col-span-7">
          <div className="p-6 md:p-8 rounded-2xl bg-slate-900 text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-500 animate-pulse" /><span className="font-mono text-xs text-slate-400">Assistant AI connecté</span></div><span className="text-xs px-2 py-1 bg-slate-800 rounded text-indigo-300 font-mono">v2.4-stable</span></div>
            <div className="space-y-4 font-mono text-sm"><div className="text-slate-400">&gt; Analyse des ventes de la semaine...</div><div className="text-indigo-300">&gt; [ALERTE] Écart de -12 unités détecté sur la référence 'Paracétamol 500mg'.</div><div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/50 space-y-2"><p className="text-xs text-slate-300 font-sans">"Il semblerait qu'un lot reçu le 12/03 n'ait pas été scanné à l'entrée. Voulez-vous que je régularise l'association de stock ?"</p><div className="flex gap-2 pt-2"><button className="px-3 py-1.5 bg-indigo-600 text-white font-sans text-xs font-semibold rounded hover:bg-indigo-700 transition-colors">Oui, régulariser</button><button className="px-3 py-1.5 bg-transparent border border-slate-600 text-slate-300 font-sans text-xs font-semibold rounded hover:bg-slate-700 transition-colors">Ignorer</button></div></div></div>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

function CtaFooter({goLogin}){
  return <>
    <section className="py-20 px-6 md:px-12 bg-slate-900 text-white">
      <div className="max-w-5xl mx-auto text-center space-y-8">
        <h2 className="font-heading text-3xl md:text-5xl font-extrabold tracking-tight">Prêt à passer à la vitesse supérieure ?</h2>
        <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">Rejoignez les dizaines de pharmacies et commerces qui font confiance à Smart Inventory pour sécuriser, optimiser et automatiser leur gestion quotidienne.</p>
        <div className="pt-4 flex flex-wrap justify-center gap-4"><a href="#login" onClick={authClick(goLogin)} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20">Commencer l'essai gratuit de 14 jours</a><a href="#contact" className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition-all">Parler à un expert</a></div>
        <p className="text-xs text-slate-500">Aucune carte de crédit requise. Installation et synchronisation en moins de 10 minutes.</p>
      </div>
    </section>
    <footer className="border-t border-slate-100 bg-white py-12 px-6 md:px-12">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white"><CubeIcon className="w-4 h-4" /></div><span className="font-heading font-bold text-base text-slate-900">Smart Inventory</span></div><div className="flex flex-wrap justify-center gap-8 text-sm text-slate-500"><a href="#politique" className="hover:text-indigo-600 transition-colors">Politique de confidentialité</a><a href="#cgu" className="hover:text-indigo-600 transition-colors">Conditions d'utilisation</a><a href="#contact" className="hover:text-indigo-600 transition-colors">Contact &amp; Support</a></div><p className="text-xs text-slate-400">© 2026 Smart Inventory. Tous droits réservés.</p></div>
    </footer>
  </>;
}

export default function ShuffleHomepage({goLogin}){
  return <div className="shuffleHomeReactExact antialiased font-body bg-body text-body bg-[#fafbfe] text-slate-900">
    <style>{shuffleCss}</style>
    <IndexSectionCustomComponents1 goLogin={goLogin}/>
    <IndexSectionCustomComponents2 goLogin={goLogin}/>
    <OperationsPanel />
    <AiSection />
    <CtaFooter goLogin={goLogin}/>
  </div>;
}
