/* V232 - Platform users table metadata: preload + XHR capture + fallback decoration. */
(function(){
  if(window.__v232PlatformUserMetadata) return;
  window.__v232PlatformUserMetadata = true;

  var cachedUsers = [];
  try{ cachedUsers = JSON.parse(sessionStorage.getItem('v232_platform_users') || '[]') || []; }catch(e){ cachedUsers = []; }

  function clean(v){ return String(v || '').trim().toLowerCase().replace(/\s+/g,' '); }
  function formatDate(value){
    if(!value) return '—';
    var d = new Date(value);
    if(isNaN(d.getTime())) return String(value).slice(0,10) || '—';
    return d.toLocaleDateString('fr-FR',{year:'numeric',month:'2-digit',day:'2-digit'});
  }
  function categoryOf(user,row){
    var role = clean(user && user.role);
    var parent = clean(user && user.parent_username);
    var text = clean(row && row.innerText);
    if(role === 'platform_admin' || text.indexOf(' admin ') >= 0 || text.indexOf('admin') === 0) return {key:'admin', label:'Admin'};
    if(role === 'client_user' || parent) return {key:'under', label:'Under user'};
    return {key:'user', label:'User'};
  }
  function creatorOf(user){
    if(!user) return '—';
    if(user.created_by_username) return user.created_by_username;
    if(user.parent_username) return user.parent_username;
    if(user.role === 'platform_admin') return 'Système';
    return 'admin';
  }
  function rankOf(cat){ return cat.key === 'admin' ? 0 : cat.key === 'user' ? 1 : cat.key === 'under' ? 2 : 3; }
  function scoreRow(row,user){
    var rowText = clean(row && row.innerText);
    var username = clean(user && user.username);
    var name = clean(user && (user.pharmacy_name || user.full_name));
    var score = 0;
    if(username && rowText.indexOf(username) >= 0) score += 80;
    if(name && rowText.indexOf(name) >= 0) score += 50;
    return score;
  }
  function userForRow(row){
    var best = null, bestScore = 0;
    cachedUsers.forEach(function(user){
      var s = scoreRow(row,user);
      if(s > bestScore){ best = user; bestScore = s; }
    });
    return bestScore > 0 ? best : null;
  }
  function findTable(){
    var tables = Array.prototype.slice.call(document.querySelectorAll('table'));
    return tables.find(function(table){
      var heads = Array.prototype.slice.call(table.querySelectorAll('thead th')).map(function(th){return clean(th.innerText);});
      return heads.indexOf('user') >= 0 && heads.indexOf('user name') >= 0 && heads.indexOf('abonnement') >= 0 && heads.indexOf('pages visibles') >= 0;
    });
  }
  function makeHeader(text,cls){ var th=document.createElement('th'); th.textContent=text; th.className=cls; return th; }
  function ensureHeaders(table){
    var tr = table.querySelector('thead tr');
    if(!tr) return;
    var heads = Array.prototype.slice.call(tr.children).map(function(th){return clean(th.innerText);});
    if(heads.indexOf('catégorie') >= 0 || heads.indexOf('categorie') >= 0) return;
    var before = tr.children[2] || null;
    tr.insertBefore(makeHeader('Catégorie','v232UserCategoryHead'), before);
    tr.insertBefore(makeHeader('Créé par','v232UserCreatedByHead'), before);
    tr.insertBefore(makeHeader('Date création','v232UserCreatedAtHead'), before);
  }
  function makeTextCell(cls,txt){ var td=document.createElement('td'); td.className=cls; td.textContent=txt || '—'; return td; }
  function makeCategoryCell(cat){ var td=document.createElement('td'); td.className='v232UserCategoryCell'; var span=document.createElement('span'); span.className='v232UserCategoryChip ' + cat.key; span.textContent=cat.label; td.appendChild(span); return td; }
  function setOrInsert(row,cls,node,index){
    var old = row.querySelector('td.' + cls);
    if(old){ old.replaceWith(node); return; }
    row.insertBefore(node,row.children[index] || null);
  }
  function decorate(){
    var table = findTable();
    if(!table) return;
    if(table.dataset.v232Busy === '1') return;
    table.dataset.v232Busy = '1';
    ensureHeaders(table);
    table.classList.add('v232PlatformUsersTable');
    var body = table.querySelector('tbody');
    if(!body){ table.dataset.v232Busy = '0'; return; }
    var rows = Array.prototype.slice.call(body.querySelectorAll('tr'));
    var pack = rows.map(function(row){
      var user = userForRow(row);
      var cat = categoryOf(user,row);
      setOrInsert(row,'v232UserCategoryCell',makeCategoryCell(cat),2);
      setOrInsert(row,'v232UserCreatedByCell',makeTextCell('v232UserCreatedByCell',creatorOf(user)),3);
      setOrInsert(row,'v232UserCreatedAtCell',makeTextCell('v232UserCreatedAtCell',formatDate(user && user.created_at)),4);
      row.dataset.v232UserCategory = cat.key;
      var created = user && user.created_at ? new Date(user.created_at).getTime() : 0;
      return {row:row, rank:rankOf(cat), created:created};
    });
    pack.sort(function(a,b){ return a.rank - b.rank || b.created - a.created; }).forEach(function(item){ body.appendChild(item.row); });
    table.dataset.v232Busy = '0';
  }
  function captureResponse(text){
    try{
      var data = JSON.parse(text || 'null');
      if(Array.isArray(data) && data.some(function(x){ return x && typeof x === 'object' && 'username' in x && ('subscription_status' in x || 'parent_username' in x || 'created_at' in x); })){
        cachedUsers = data;
        try{ sessionStorage.setItem('v232_platform_users', JSON.stringify(data)); }catch(e){}
        decorate();
      }
    }catch(e){}
  }
  try{
    var XO = XMLHttpRequest.prototype.open;
    var XS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method,url){ this.__v232url = String(url || ''); return XO.apply(this,arguments); };
    XMLHttpRequest.prototype.send = function(){
      try{
        this.addEventListener('loadend',function(){
          if(String(this.__v232url || '').indexOf('/platform/clients') >= 0) captureResponse(this.responseText);
        });
      }catch(e){}
      return XS.apply(this,arguments);
    };
  }catch(e){}
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',decorate); else decorate();
  setInterval(decorate,1000);
  try{ new MutationObserver(decorate).observe(document.documentElement,{subtree:true,childList:true}); }catch(e){}
})();
