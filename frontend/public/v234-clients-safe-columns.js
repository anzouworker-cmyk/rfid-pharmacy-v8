/* V244 - Clients table helpers + cash cloud sync. Never call API routes on the frontend domain. */
(function(){
  if(window.__v244ClientsSafeColumns) return;
  window.__v244ClientsSafeColumns = true;
  var cachedUsers=[];
  var fetching=false;
  var creatorFilterValue='all';
  var apiBase='';
  var DEFAULT_BACKEND='https://rfid-pharmacy-v8-staging.onrender.com';
  function clean(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}
  function labelKey(v){return clean(v||'—')}
  function token(){return localStorage.getItem('token') || localStorage.token || ''}
  function sameOrigin(u){try{return new URL(u,location.href).origin===location.origin}catch(e){return true}}
  function discoverApiBase(){
    if(apiBase) return apiBase;
    var saved=String(localStorage.getItem('inventory_connect_api_base')||window.__inventoryConnectApiBase||'').trim().replace(/\/$/,'');
    if(saved && /^https?:\/\//i.test(saved) && !sameOrigin(saved)){apiBase=saved;window.__inventoryConnectApiBase=apiBase;return apiBase;}
    var paths=['/auth/login','/me','/platform/clients','/users/my-users','/cash/data','/dashboard/content'];
    try{
      (performance.getEntriesByType('resource')||[]).forEach(function(e){
        if(apiBase) return;
        var n=String(e.name||'');
        if(!/^https?:\/\//i.test(n) || sameOrigin(n)) return;
        for(var i=0;i<paths.length;i++){
          var idx=n.indexOf(paths[i]);
          if(idx>0){apiBase=n.slice(0,idx).replace(/\/$/,'');break;}
        }
      });
    }catch(e){}
    if(!apiBase && /(^|\.)inventoryconnect\.app$|\.vercel\.app$/i.test(location.hostname)) apiBase=DEFAULT_BACKEND;
    if(apiBase) window.__inventoryConnectApiBase=apiBase;
    return apiBase;
  }
  function api(path){var b=discoverApiBase();return b?b+path:''}
  function findClientsTable(){
    return Array.prototype.slice.call(document.querySelectorAll('table')).find(function(table){
      var h=Array.prototype.slice.call(table.querySelectorAll('thead th')).map(function(th){return clean(th.textContent)});
      return h.indexOf('user')>=0 && h.indexOf('user name')>=0 && h.indexOf('abonnement')>=0 && h.indexOf('pages visibles')>=0 && h.indexOf('delete')>=0;
    });
  }
  function fetchUsers(){
    var t=token(), url=api('/platform/clients');
    if(!t || !url || fetching) return;
    fetching=true;
    fetch(url,{headers:{Authorization:'Bearer '+t}}).then(function(r){return r.ok?r.json():[]}).then(function(data){
      if(Array.isArray(data)) cachedUsers=data;
    }).catch(function(){}).finally(function(){fetching=false;decorate()});
  }
  function identityUsername(row){
    try{
      var identity=row.querySelector('.platformUserIdentity');
      if(identity){
        var spans=Array.prototype.slice.call(identity.querySelectorAll('span'));
        var txt=String(spans.length?spans[spans.length-1].textContent:'').trim();
        if(txt && txt.length>1) return txt;
        var all=String(identity.textContent||'').trim().split(/\s+/).filter(Boolean);
        if(all.length>1) return all[all.length-1];
      }
    }catch(e){}
    return '';
  }
  function userForRow(row){
    var exact=identityUsername(row);
    if(exact){
      var found=cachedUsers.find(function(u){return clean(u.username)===clean(exact)});
      if(found) return found;
    }
    var text=clean(row.textContent), best=null, score=0;
    cachedUsers.forEach(function(u){
      var s=0, username=clean(u.username), name=clean(u.pharmacy_name||u.full_name||'');
      if(username && text.indexOf(username)>=0) s+=80;
      if(name && text.indexOf(name)>=0) s+=50;
      if(s>score){best=u;score=s}
    });
    return score>0?best:null;
  }
  function usernameForRow(row){var u=userForRow(row);return u&&u.username?String(u.username).trim():identityUsername(row)}
  function category(user,row){
    var text=clean(row.textContent), role=clean(user&&user.role), parent=clean(user&&user.parent_username);
    if(role==='platform_admin' || text.indexOf(' admin ')>=0 || text.indexOf('admin')===0) return {key:'admin',label:'Admin'};
    if(role==='client_user' || parent || text.replace(/\s/g,'').startsWith('uactive')) return {key:'under',label:'Under user'};
    return {key:'user',label:'User'};
  }
  function creator(user,cat){
    if(user&&user.created_by_username) return String(user.created_by_username).trim();
    if(user&&user.parent_username) return String(user.parent_username).trim();
    if(cat.key==='admin') return 'Système';
    if(cat.key==='under') return 'User principal';
    return 'admin';
  }
  function rank(cat){return cat.key==='admin'?0:cat.key==='user'?1:cat.key==='under'?2:3}
  function mkHeader(txt,cls){var th=document.createElement('th');th.textContent=txt;th.className=cls;return th}
  function ensureHeaders(table){
    var tr=table.querySelector('thead tr'); if(!tr) return;
    Array.prototype.slice.call(tr.querySelectorAll('.v234HeadCreatedAt,.v235HeadCreatedAt')).forEach(function(th){th.remove()});
    var h=Array.prototype.slice.call(tr.children).map(function(th){return clean(th.textContent)});
    if(h.indexOf('catégorie')>=0 || h.indexOf('categorie')>=0) return;
    var before=tr.children[2]||null;
    tr.insertBefore(mkHeader('Catégorie','v234HeadCategory'),before);
    tr.insertBefore(mkHeader('Créé par','v234HeadCreatedBy'),before);
  }
  function clearOld(row){Array.prototype.slice.call(row.querySelectorAll('.v234CellCategory,.v234CellCreatedBy,.v234CellCreatedAt,.v235CellCreatedAt')).forEach(function(td){td.remove()})}
  function catCell(cat){var td=document.createElement('td');td.className='v234CellCategory';var s=document.createElement('span');s.className='v234Chip '+cat.key;s.textContent=cat.label;td.appendChild(s);return td}
  function textCell(cls,txt){var td=document.createElement('td');td.className=cls;td.textContent=txt||'—';return td}
  function filterSelect(){return document.querySelector('.v238CreatedByFilter')}
  function ensureCreatorFilter(table){
    var filters=document.querySelector('.platformUsersFilters'); if(!filters||!table) return;
    var select=filterSelect();
    if(!select){
      select=document.createElement('select');
      select.className='v238CreatedByFilter';
      select.setAttribute('aria-label','Filtrer par Créé par');
      select.style.cssText='min-width:180px;height:44px;border:1px solid #d8e2f0;border-radius:10px;background:#fff;color:#334155;font-weight:800;padding:0 14px;';
      select.addEventListener('change',function(){creatorFilterValue=select.value||'all';applyCreatorFilter(table)});
      filters.insertBefore(select,filters.querySelector('.platformResetFilter')||null);
    }
    var current=select.value || creatorFilterValue || 'all', map={};
    Array.prototype.slice.call(table.querySelectorAll('tbody tr')).forEach(function(row){var v=row.dataset.v234Creator||'';if(v) map[labelKey(v)]=v});
    var values=Object.keys(map).sort(function(a,b){return map[a].localeCompare(map[b],'fr')});
    select.innerHTML='<option value="all">Créé par — Tous</option>'+values.map(function(k){var safe=map[k].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');return '<option value="'+k+'">'+safe+'</option>'}).join('');
    select.value=values.indexOf(current)>=0?current:'all'; creatorFilterValue=select.value;
  }
  function applyCreatorFilter(table){
    var select=filterSelect(); creatorFilterValue=(select?select.value:creatorFilterValue)||'all';
    if(!table) table=findClientsTable(); if(!table) return;
    Array.prototype.slice.call(table.querySelectorAll('tbody tr')).forEach(function(row){
      if(!row.dataset.v234Category) return;
      var creatorKey=labelKey(row.dataset.v234Creator||'');
      row.style.display=(creatorFilterValue==='all'||creatorKey===creatorFilterValue)?'':'none';
    });
  }
  function decorate(){
    var table=findClientsTable(); if(!table||table.dataset.v234Busy==='1') return;
    table.dataset.v234Busy='1'; ensureHeaders(table); table.classList.add('v234ClientsTable');
    var body=table.querySelector('tbody'); if(!body){table.dataset.v234Busy='0';return}
    var pack=[];
    Array.prototype.slice.call(body.querySelectorAll('tr')).forEach(function(row,i){
      if(row.children.length<4) return;
      clearOld(row);
      var user=userForRow(row), cat=category(user,row), rowUsername=(user&&user.username)||identityUsername(row), creatorLabel=creator(user,cat);
      row.insertBefore(catCell(cat),row.children[2]||null);
      row.insertBefore(textCell('v234CellCreatedBy',creatorLabel),row.children[3]||null);
      row.dataset.v234Category=cat.key; row.dataset.v234Creator=creatorLabel; if(rowUsername) row.dataset.v234Username=rowUsername;
      pack.push({row:row,r:rank(cat),i:i,d:user&&user.created_at?new Date(user.created_at).getTime():0});
    });
    pack.sort(function(a,b){return a.r-b.r || b.d-a.d || a.i-b.i}).forEach(function(x){body.appendChild(x.row)});
    ensureCreatorFilter(table); applyCreatorFilter(table); table.dataset.v234Busy='0';
  }
  async function deleteByApi(username,row,button){
    var t=token(), base=discoverApiBase(); if(!username||!t||!base) return false;
    if(!confirm('Supprimer définitivement le user '+username+' ?')) return true;
    if(button){button.disabled=true;button.textContent='Suppression...'}
    var enc=encodeURIComponent(username), headers={Authorization:'Bearer '+t};
    var attempts=[['/platform/client-delete/','POST'],['/platform/delete-client/','DELETE'],['/users/delete/','DELETE']];
    var ok=false,last='';
    for(var i=0;i<attempts.length;i++){
      try{var r=await fetch(base+attempts[i][0]+enc,{method:attempts[i][1],headers:headers}); if(r.ok){ok=true;break;} last=await r.text();}catch(e){last=String(e&&e.message||e)}
    }
    if(ok){cachedUsers=cachedUsers.filter(function(u){return clean(u.username)!==clean(username)}); if(row) row.remove(); var table=findClientsTable(); if(table){ensureCreatorFilter(table);applyCreatorFilter(table)} return true;}
    if(button){button.disabled=false;button.textContent='Delete'}
    alert('Erreur suppression utilisateur: '+(last||'réessayez'));
    return true;
  }
  document.addEventListener('click',function(e){
    var reset=e.target&&e.target.closest?e.target.closest('.platformResetFilter'):null;
    if(reset){setTimeout(function(){var s=filterSelect();if(s){s.value='all';creatorFilterValue='all';applyCreatorFilter(findClientsTable())}},0)}
    var btn=e.target&&e.target.closest?e.target.closest('button'):null;
    if(!btn || clean(btn.textContent)!=='delete') return;
    var table=findClientsTable(); if(!table||!table.contains(btn)) return;
    var row=btn.closest('tr'); if(!row||row.dataset.v234Category==='admin') return;
    var username=row.dataset.v234Username||usernameForRow(row); if(!username||!discoverApiBase()) return;
    e.preventDefault(); e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation(); deleteByApi(username,row,btn);
  },true);
  function tick(){try{discoverApiBase();decorate();fetchUsers()}catch(e){}}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',tick); else tick();
  var n=0,timer=setInterval(function(){tick(); if(++n>40) clearInterval(timer)},1500);
})();

/* V244 - Sync caisse localStorage to PostgreSQL via backend /cash/data. */
(function(){
  if(window.__v244CashCloudSync) return;
  window.__v244CashCloudSync=true;
  var REGISTER_KEY='smart_inventory_cash_register_v1', SETTINGS_KEY='smart_inventory_cash_settings_v1';
  var lastPayload='', loading=false, saving=false, apiBase='';
  var DEFAULT_BACKEND='https://rfid-pharmacy-v8-staging.onrender.com';
  function token(){return localStorage.getItem('token') || localStorage.token || ''}
  function raw(key){return localStorage.getItem(key)||''}
  function hasUsefulValue(v){var s=String(v||'').trim();return !!s&&s!=='{}'&&s!=='[]'&&s!=='null'&&s!=='undefined'}
  function sameOrigin(u){try{return new URL(u,location.href).origin===location.origin}catch(e){return true}}
  function discoverApiBase(){
    if(apiBase) return apiBase;
    var saved=String(localStorage.getItem('inventory_connect_api_base')||window.__inventoryConnectApiBase||'').trim().replace(/\/$/,'');
    if(saved && /^https?:\/\//i.test(saved) && !sameOrigin(saved)){apiBase=saved;window.__inventoryConnectApiBase=apiBase;return apiBase;}
    try{(performance.getEntriesByType('resource')||[]).forEach(function(e){
      if(apiBase) return; var n=String(e.name||''); if(!/^https?:\/\//i.test(n)||sameOrigin(n)) return;
      ['/auth/login','/me','/platform/clients','/cash/data'].forEach(function(p){var idx=n.indexOf(p);if(!apiBase&&idx>0) apiBase=n.slice(0,idx).replace(/\/$/,'')});
    })}catch(e){}
    if(!apiBase && /(^|\.)inventoryconnect\.app$|\.vercel\.app$/i.test(location.hostname)) apiBase=DEFAULT_BACKEND;
    if(apiBase) window.__inventoryConnectApiBase=apiBase;
    return apiBase;
  }
  function cashPayload(){return JSON.stringify({register:raw(REGISTER_KEY),settings:raw(SETTINGS_KEY)})}
  async function loadFromCloud(){
    var base=discoverApiBase(), t=token(); if(!base||!t||loading) return false; loading=true;
    try{var r=await fetch(base+'/cash/data',{headers:{Authorization:'Bearer '+t}}); if(!r.ok) return false; var data=await r.json();
      var cr=String(data.register||''), cs=String(data.settings||'');
      if(!hasUsefulValue(raw(REGISTER_KEY))&&hasUsefulValue(cr)) localStorage.setItem(REGISTER_KEY,cr);
      if(!hasUsefulValue(raw(SETTINGS_KEY))&&hasUsefulValue(cs)) localStorage.setItem(SETTINGS_KEY,cs);
      lastPayload=cashPayload(); return true;
    }catch(e){return false} finally{loading=false}
  }
  async function saveToCloud(force){
    var base=discoverApiBase(), t=token(); if(!base||!t||saving) return false;
    var payload=cashPayload(); if(!force&&payload===lastPayload) return true; saving=true;
    try{var r=await fetch(base+'/cash/data',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:payload}); if(r.ok){lastPayload=payload;return true} return false;}
    catch(e){return false} finally{saving=false}
  }
  var originalSetItem=localStorage.setItem;
  try{localStorage.setItem=function(k,v){var result=originalSetItem.apply(this,arguments); if(k===REGISTER_KEY||k===SETTINGS_KEY) setTimeout(function(){saveToCloud(false)},250); return result;}}catch(e){}
  var attempts=0,timer=setInterval(function(){attempts++; discoverApiBase(); if(attempts===1||attempts%4===0) loadFromCloud().then(function(){saveToCloud(false)}); else saveToCloud(false); if(attempts>240) clearInterval(timer)},3000);
  setTimeout(function(){loadFromCloud().then(function(){saveToCloud(true)})},1500);
})();
