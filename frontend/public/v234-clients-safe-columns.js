/* V235 - Safe Clients table columns: Catégorie, Créé par. No Date création column. */
(function(){
  if(window.__v235ClientsSafeColumns) return;
  window.__v235ClientsSafeColumns = true;
  var cachedUsers = [];
  var fetching = false;
  function clean(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}
  function findClientsTable(){
    var tables = Array.prototype.slice.call(document.querySelectorAll('table'));
    return tables.find(function(table){
      var h = Array.prototype.slice.call(table.querySelectorAll('thead th')).map(function(th){return clean(th.textContent)});
      return h.indexOf('user') >= 0 && h.indexOf('user name') >= 0 && h.indexOf('abonnement') >= 0 && h.indexOf('pages visibles') >= 0 && h.indexOf('delete') >= 0;
    });
  }
  function token(){return localStorage.getItem('token') || localStorage.token || ''}
  function apiUrls(){
    var urls=[];
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
  function userForRow(row){
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
  function category(user,row){
    var text=clean(row.textContent), role=clean(user&&user.role), parent=clean(user&&user.parent_username);
    if(role==='platform_admin' || text.indexOf(' admin ')>=0 || text.indexOf('admin')===0) return {key:'admin',label:'Admin'};
    if(role==='client_user' || parent || text.replace(/\s/g,'').startsWith('uactive')) return {key:'under',label:'Under user'};
    return {key:'user',label:'User'};
  }
  function creator(user,cat){
    if(user && user.created_by_username) return user.created_by_username;
    if(user && user.parent_username) return user.parent_username;
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
      var user=userForRow(row), cat=category(user,row);
      row.insertBefore(catCell(cat),row.children[2]||null);
      row.insertBefore(textCell('v234CellCreatedBy',creator(user,cat)),row.children[3]||null);
      row.dataset.v234Category=cat.key;
      pack.push({row:row,r:rank(cat),i:i,d:user&&user.created_at?new Date(user.created_at).getTime():0});
    });
    pack.sort(function(a,b){return a.r-b.r || b.d-a.d || a.i-b.i}).forEach(function(x){body.appendChild(x.row)});
    table.dataset.v234Busy='0';
  }
  function tick(){try{decorate();fetchUsers()}catch(e){}}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',tick); else tick();
  var n=0, timer=setInterval(function(){tick(); if(++n>40) clearInterval(timer)},1500);
})();
