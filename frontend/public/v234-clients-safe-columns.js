/* V241 - Clients helpers + cash cloud sync. Delete fallback now uses backend API base, not frontend domain. */
(function(){
  if(window.__v238ClientsSafeColumns) return;
  window.__v238ClientsSafeColumns = true;
  var cachedUsers = [];
  var fetching = false;
  var creatorFilterValue = 'all';
  var apiBase='';
  function clean(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}
  function labelKey(v){return clean(v || '—')}
  function findClientsTable(){
    var tables = Array.prototype.slice.call(document.querySelectorAll('table'));
    return tables.find(function(table){
      var h = Array.prototype.slice.call(table.querySelectorAll('thead th')).map(function(th){return clean(th.textContent)});
      return h.indexOf('user') >= 0 && h.indexOf('user name') >= 0 && h.indexOf('abonnement') >= 0 && h.indexOf('pages visibles') >= 0 && h.indexOf('delete') >= 0;
    });
  }
  function token(){return localStorage.getItem('token') || localStorage.token || ''}
  function discoverApiBase(){
    if(apiBase) return apiBase;
    var paths=['/platform/clients','/platform/client-delete/','/me','/dashboard/content','/users/my-users','/cash/data','/platform/'];
    try{
      var entries=performance.getEntriesByType('resource')||[];
      for(var i=0;i<entries.length;i++){
        var name=String(entries[i].name||'');
        for(var p=0;p<paths.length;p++){
          var idx=name.indexOf(paths[p]);
          if(idx>0 && /^https?:\/\//i.test(name)){
            apiBase=name.slice(0,idx).replace(/\/$/,'');
            window.__inventoryConnectApiBase=apiBase;
            return apiBase;
          }
        }
      }
    }catch(e){}
    if(window.__inventoryConnectApiBase) return window.__inventoryConnectApiBase;
    return '';
  }
  function apiUrls(){
    var urls=[];
    var base=discoverApiBase();
    if(base) urls.push(base+'/platform/clients');
    try{
      performance.getEntriesByType('resource').forEach(function(e){
        var n=String(e.name||'');
        if(n.indexOf('/platform/clients')>=0) urls.push(n);
      });
    }catch(e){}
    urls.push('/platform/clients');
    return urls.filter(function(v,i,a){return v && a.indexOf(v)===i});
  }
  function fetchUsers(){
    var t=token();
    if(!t || fetching) return;
    fetching=true;
    var urls=apiUrls();
    var done=false;
    Promise.all(urls.map(function(url){
      return fetch(url,{headers:{Authorization:'Bearer '+t}}).then(function(r){return r.ok?r.json():null}).then(function(data){
        if(!done && Array.isArray(data) && data.length && data[0] && typeof data[0]==='object' && 'username' in data[0]){
          cachedUsers=data; done=true;
        }
      }).catch(function(){});
    })).finally(function(){fetching=false; decorate()});
  }
  function identityUsername(row){
    try{
      var identity=row.querySelector('.platformUserIdentity');
      if(identity){
        var spans=Array.prototype.slice.call(identity.querySelectorAll('span'));
        var last=spans[spans.length-1];
        var txt=String(last && last.textContent || '').trim();
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
    var text=clean(row.textContent);
    var best=null,score=0;
    cachedUsers.forEach(function(u){
      var s=0, username=clean(u.username), name=clean(u.pharmacy_name||u.full_name||'');
      if(username && text.indexOf(username)>=0) s+=80;
      if(name && text.indexOf(name)>=0) s+=50;
      if(s>score){best=u;score=s}
    });
    return score>0?best:null;
  }
  function usernameForRow(row){
    var user=userForRow(row);
    if(user && user.username) return String(user.username).trim();
    return identityUsername(row);
  }
  function category(user,row){
    var text=clean(row.textContent), role=clean(user&&user.role), parent=clean(user&&user.parent_username);
    if(role==='platform_admin' || text.indexOf(' admin ')>=0 || text.indexOf('admin')===0) return {key:'admin',label:'Admin'};
    if(role==='client_user' || parent || text.replace(/\s/g,'').startsWith('uactive')) return {key:'under',label:'Under user'};
    return {key:'user',label:'User'};
  }
  function creator(user,cat){
    if(user && user.created_by_username) return String(user.created_by_username).trim();
    if(user && user.parent_username) return String(user.parent_username).trim();
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
  function clearOld(row){
    Array.prototype.slice.call(row.querySelectorAll('.v234CellCategory,.v234CellCreatedBy,.v234CellCreatedAt,.v235CellCreatedAt')).forEach(function(td){td.remove()});
  }
  function catCell(cat){
    var td=document.createElement('td');td.className='v234CellCategory';
    var s=document.createElement('span');s.className='v234Chip '+cat.key;s.textContent=cat.label;td.appendChild(s);return td;
  }
  function textCell(cls,txt){var td=document.createElement('td');td.className=cls;td.textContent=txt||'—';return td}
  function filterSelect(){return document.querySelector('.v238CreatedByFilter')}
  function ensureCreatorFilter(table){
    var filters=document.querySelector('.platformUsersFilters');
    if(!filters || !table) return;
    var select=filterSelect();
    if(!select){
      select=document.createElement('select');
      select.className='v238CreatedByFilter';
      select.setAttribute('aria-label','Filtrer par Créé par');
      select.style.cssText='min-width:180px;height:44px;border:1px solid #d8e2f0;border-radius:10px;background:#fff;color:#334155;font-weight:800;padding:0 14px;';
      select.addEventListener('change',function(){creatorFilterValue=select.value||'all';applyCreatorFilter(table)});
      var reset=filters.querySelector('.platformResetFilter');
      filters.insertBefore(select,reset||null);
    }
    var current=select.value || creatorFilterValue || 'all';
    var map={};
    Array.prototype.slice.call(table.querySelectorAll('tbody tr')).forEach(function(row){
      var v=row.dataset.v234Creator || '';
      if(v) map[labelKey(v)]=v;
    });
    var values=Object.keys(map).sort(function(a,b){return map[a].localeCompare(map[b],'fr')});
    select.innerHTML='<option value="all">Créé par — Tous</option>' + values.map(function(k){
      var safe=map[k].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
      return '<option value="'+k+'">'+safe+'</option>';
    }).join('');
    select.value=values.indexOf(current)>=0?current:'all';
    creatorFilterValue=select.value;
  }
  function applyCreatorFilter(table){
    var select=filterSelect();
    var selected=select ? select.value : (creatorFilterValue || 'all');
    creatorFilterValue=selected || 'all';
    if(!table) table=findClientsTable();
    if(!table) return;
    Array.prototype.slice.call(table.querySelectorAll('tbody tr')).forEach(function(row){
      if(!row.dataset.v234Category) return;
      var creatorKey=labelKey(row.dataset.v234Creator || '');
      row.style.display=(creatorFilterValue==='all' || creatorKey===creatorFilterValue) ? '' : 'none';
    });
  }
  function decorate(){
    var table=findClientsTable(); if(!table) return;
    if(table.dataset.v234Busy==='1') return;
    table.dataset.v234Busy='1';
    ensureHeaders(table);
    table.classList.add('v234ClientsTable');
    var body=table.querySelector('tbody'); if(!body){table.dataset.v234Busy='0';return}
    var rows=Array.prototype.slice.call(body.querySelectorAll('tr'));
    var pack=[];
    rows.forEach(function(row,i){
      if(row.children.length<4) return;
      clearOld(row);
      var user=userForRow(row), cat=category(user,row), rowUsername=(user&&user.username)||identityUsername(row), creatorLabel=creator(user,cat);
      row.insertBefore(catCell(cat),row.children[2]||null);
      row.insertBefore(textCell('v234CellCreatedBy',creatorLabel),row.children[3]||null);
      row.dataset.v234Category=cat.key;
      row.dataset.v234Creator=creatorLabel;
      if(rowUsername) row.dataset.v234Username=rowUsername;
      pack.push({row:row,r:rank(cat),i:i,d:user&&user.created_at?new Date(user.created_at).getTime():0});
    });
    pack.sort(function(a,b){return a.r-b.r || b.d-a.d || a.i-b.i}).forEach(function(x){body.appendChild(x.row)});
    ensureCreatorFilter(table);
    applyCreatorFilter(table);
    table.dataset.v234Busy='0';
  }
  async function deleteByApi(username,row,button){
    var t=token();
    var base=discoverApiBase();
    if(!username || !t || !base) return false;
    var enc=encodeURIComponent(username);
    var headers={Authorization:'Bearer '+t};
    if(!confirm('Supprimer définitivement le user '+username+' ?')) return true;
    if(button){button.disabled=true;button.textContent='Suppression...'}
    var attempts=[
      {url:base+'/platform/client-delete/'+enc,method:'POST'},
      {url:base+'/platform/delete-client/'+enc,method:'DELETE'},
      {url:base+'/users/delete/'+enc,method:'DELETE'}
    ];
    var ok=false,last='';
    for(var i=0;i<attempts.length;i++){
      try{
        var r=await fetch(attempts[i].url,{method:attempts[i].method,headers:headers});
        if(r.ok){ok=true;break;}
        last=await r.text();
      }catch(e){last=String(e&&e.message||e)}
    }
    if(ok){
      cachedUsers=cachedUsers.filter(function(u){return clean(u.username)!==clean(username)});
      if(row) row.remove();
      var table=findClientsTable();
      if(table){ensureCreatorFilter(table);applyCreatorFilter(table)}
      return true;
    }
    if(button){button.disabled=false;button.textContent='Delete'}
    alert('Erreur suppression utilisateur: '+(last||'réessayez'));
    return true;
  }
  document.addEventListener('click',function(e){
    var reset=e.target&&e.target.closest?e.target.closest('.platformResetFilter'):null;
    if(reset){setTimeout(function(){var s=filterSelect(); if(s){s.value='all'; creatorFilterValue='all'; applyCreatorFilter(findClientsTable())}},0);}
    var btn=e.target&&e.target.closest?e.target.closest('button'):null;
    if(!btn || clean(btn.textContent)!=='delete') return;
    var table=findClientsTable();
    if(!table || !table.contains(btn)) return;
    var row=btn.closest('tr');
    if(!row || row.dataset.v234Category==='admin') return;
    var username=row.dataset.v234Username || usernameForRow(row);
    if(!username || !discoverApiBase()) return;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    deleteByApi(username,row,btn);
  },true);
  function tick(){try{decorate();fetchUsers();discoverApiBase()}catch(e){}}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',tick); else tick();
  var n=0, timer=setInterval(function(){tick(); if(++n>40) clearInterval(timer)},1500);
})();

/* V240 - Sync caisse localStorage to PostgreSQL via backend /cash/data. */
(function(){
  if(window.__v240CashCloudSync) return;
  window.__v240CashCloudSync = true;
  var REGISTER_KEY='smart_inventory_cash_register_v1';
  var SETTINGS_KEY='smart_inventory_cash_settings_v1';
  var lastPayload='';
  var loading=false;
  var saving=false;
  var apiBase='';
  function token(){return localStorage.getItem('token') || localStorage.token || ''}
  function raw(key){return localStorage.getItem(key) || ''}
  function hasUsefulValue(v){
    var s=String(v||'').trim();
    return !!s && s!=='{}' && s!=='[]' && s!=='null' && s!=='undefined';
  }
  function discoverApiBase(){
    if(apiBase) return apiBase;
    if(window.__inventoryConnectApiBase){apiBase=window.__inventoryConnectApiBase;return apiBase;}
    var paths=['/cash/data','/me','/dashboard/content','/platform/clients','/users/my-users','/platform/'];
    try{
      var entries=performance.getEntriesByType('resource')||[];
      for(var i=0;i<entries.length;i++){
        var name=String(entries[i].name||'');
        for(var p=0;p<paths.length;p++){
          var idx=name.indexOf(paths[p]);
          if(idx>0 && /^https?:\/\//i.test(name)){
            apiBase=name.slice(0,idx).replace(/\/$/,'');
            window.__inventoryConnectApiBase=apiBase;
            return apiBase;
          }
        }
      }
    }catch(e){}
    return '';
  }
  function cashPayload(){
    return JSON.stringify({register:raw(REGISTER_KEY),settings:raw(SETTINGS_KEY)});
  }
  async function loadFromCloud(){
    var base=discoverApiBase(), t=token();
    if(!base || !t || loading) return false;
    loading=true;
    try{
      var r=await fetch(base+'/cash/data',{headers:{Authorization:'Bearer '+t}});
      if(!r.ok) return false;
      var data=await r.json();
      var cloudRegister=String(data.register||'');
      var cloudSettings=String(data.settings||'');
      if(!hasUsefulValue(raw(REGISTER_KEY)) && hasUsefulValue(cloudRegister)) localStorage.setItem(REGISTER_KEY,cloudRegister);
      if(!hasUsefulValue(raw(SETTINGS_KEY)) && hasUsefulValue(cloudSettings)) localStorage.setItem(SETTINGS_KEY,cloudSettings);
      lastPayload=cashPayload();
      return true;
    }catch(e){return false;}
    finally{loading=false;}
  }
  async function saveToCloud(force){
    var base=discoverApiBase(), t=token();
    if(!base || !t || saving) return false;
    var payload=cashPayload();
    if(!force && payload===lastPayload) return true;
    saving=true;
    try{
      var body=JSON.parse(payload);
      var r=await fetch(base+'/cash/data',{
        method:'POST',
        headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
      if(r.ok){lastPayload=payload;return true;}
      return false;
    }catch(e){return false;}
    finally{saving=false;}
  }
  var originalSetItem=localStorage.setItem;
  try{
    localStorage.setItem=function(k,v){
      var result=originalSetItem.apply(this,arguments);
      if(k===REGISTER_KEY || k===SETTINGS_KEY) setTimeout(function(){saveToCloud(false)},250);
      return result;
    };
  }catch(e){}
  var attempts=0;
  var timer=setInterval(function(){
    attempts++;
    discoverApiBase();
    if(attempts===1 || attempts%4===0) loadFromCloud().then(function(){saveToCloud(false)});
    else saveToCloud(false);
    if(attempts>240) clearInterval(timer);
  },3000);
  setTimeout(function(){loadFromCloud().then(function(){saveToCloud(true)})},1500);
})();
