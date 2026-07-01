/* V231 - Platform users table: category, creator and creation date columns. */
(function(){
  if(window.__v231PlatformUserMetadata) return;
  window.__v231PlatformUserMetadata = true;

  var API = '';
  try{
    var scripts = document.querySelectorAll('script[src]');
    for(var i=0;i<scripts.length;i++){
      var src = scripts[i].getAttribute('src') || '';
      if(src.indexOf('/src/main.jsx') >= 0){ API = location.origin; }
    }
  }catch(e){}

  function token(){ return localStorage.getItem('token') || localStorage.token || ''; }
  function normalize(v){ return String(v || '').trim().toLowerCase(); }
  function cleanCell(v){ return normalize(v).replace(/\s+/g,' '); }
  function formatDate(value){
    if(!value) return '—';
    var d = new Date(value);
    if(isNaN(d.getTime())) return String(value).slice(0,10) || '—';
    return d.toLocaleDateString('fr-FR',{year:'numeric',month:'2-digit',day:'2-digit'});
  }
  function categoryOf(user){
    if(!user) return {key:'unknown', label:'User'};
    if(user.role === 'platform_admin') return {key:'admin', label:'Admin'};
    if(user.role === 'client_user' || user.parent_username) return {key:'under', label:'Under user'};
    return {key:'user', label:'User'};
  }
  function creatorOf(user){
    if(!user) return '—';
    if(user.created_by_username) return user.created_by_username;
    if(user.parent_username) return user.parent_username;
    if(user.role === 'platform_admin') return 'Système';
    return 'admin';
  }
  function scoreUser(rowText, usernameText, user){
    var score = 0;
    var username = cleanCell(user.username);
    var full = cleanCell(user.pharmacy_name || user.full_name || '');
    if(username && usernameText === username) score += 100;
    if(username && rowText.indexOf(username) >= 0) score += 50;
    if(full && usernameText === full) score += 40;
    if(full && rowText.indexOf(full) >= 0) score += 25;
    return score;
  }
  function findUserForRow(row, users){
    var cells = Array.prototype.slice.call(row.children);
    var rowText = cleanCell(row.innerText || '');
    var usernameText = cleanCell(cells[0] ? cells[0].innerText : '');
    var best = null, bestScore = 0;
    users.forEach(function(user){
      var s = scoreUser(rowText, usernameText, user);
      if(s > bestScore){ best = user; bestScore = s; }
    });
    return best;
  }
  function findPlatformUsersTable(){
    var tables = Array.prototype.slice.call(document.querySelectorAll('table'));
    return tables.find(function(table){
      var headers = Array.prototype.slice.call(table.querySelectorAll('thead th')).map(function(th){return cleanCell(th.innerText);});
      return headers.indexOf('user') >= 0 && headers.indexOf('user name') >= 0 && headers.indexOf('abonnement') >= 0 && headers.indexOf('pages visibles') >= 0;
    });
  }
  function ensureHeader(table){
    var headRow = table.querySelector('thead tr');
    if(!headRow) return;
    var existing = Array.prototype.slice.call(headRow.children).map(function(th){return cleanCell(th.innerText);});
    if(existing.indexOf('categorie') < 0 && existing.indexOf('catégorie') < 0){
      var thCat = document.createElement('th'); thCat.textContent = 'Catégorie'; thCat.className = 'v231UserCategoryHead';
      var thBy = document.createElement('th'); thBy.textContent = 'Créé par'; thBy.className = 'v231UserCreatedByHead';
      var thDate = document.createElement('th'); thDate.textContent = 'Date création'; thDate.className = 'v231UserCreatedAtHead';
      var insertAfter = 2;
      headRow.insertBefore(thDate, headRow.children[insertAfter+1] || null);
      headRow.insertBefore(thBy, thDate);
      headRow.insertBefore(thCat, thBy);
    }
  }
  function ensureCell(row, className, contentNode, index){
    var existing = row.querySelector('td.' + className);
    if(existing){ existing.innerHTML = ''; existing.appendChild(contentNode); return existing; }
    var td = document.createElement('td'); td.className = className; td.appendChild(contentNode);
    row.insertBefore(td, row.children[index] || null);
    return td;
  }
  function textNode(txt){ var span = document.createElement('span'); span.textContent = txt || '—'; return span; }
  function chip(label, key){ var span = document.createElement('span'); span.className = 'v231UserCategoryChip ' + key; span.textContent = label; return span; }
  function categoryRank(user){ var c = categoryOf(user).key; return c === 'admin' ? 0 : c === 'user' ? 1 : c === 'under' ? 2 : 3; }
  function decorate(users){
    var table = findPlatformUsersTable();
    if(!table || !Array.isArray(users) || !users.length) return;
    if(table.dataset.v231Decorating === '1') return;
    table.dataset.v231Decorating = '1';
    ensureHeader(table);
    var tbody = table.querySelector('tbody');
    if(!tbody){ table.dataset.v231Decorating = '0'; return; }
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
    var decorated = rows.map(function(row){
      var user = findUserForRow(row, users);
      var cat = categoryOf(user);
      ensureCell(row, 'v231UserCategoryCell', chip(cat.label, cat.key), 3);
      ensureCell(row, 'v231UserCreatedByCell', textNode(creatorOf(user)), 4);
      ensureCell(row, 'v231UserCreatedAtCell', textNode(formatDate(user && user.created_at)), 5);
      row.dataset.v231UserCategory = cat.key;
      return {row:row, rank:categoryRank(user), created:user && user.created_at ? new Date(user.created_at).getTime() : 0};
    });
    decorated.sort(function(a,b){ return a.rank - b.rank || b.created - a.created; }).forEach(function(item){ tbody.appendChild(item.row); });
    table.classList.add('v231PlatformUsersTable');
    table.dataset.v231Decorating = '0';
  }
  var cache = null;
  var fetching = false;
  function fetchUsers(){
    var t = token();
    if(!t || fetching) return;
    fetching = true;
    fetch('/platform/clients',{headers:{Authorization:'Bearer ' + t}})
      .then(function(r){ return r.ok ? r.json() : []; })
      .then(function(data){ cache = Array.isArray(data) ? data : []; decorate(cache); })
      .catch(function(){})
      .finally(function(){ fetching = false; });
  }
  function tick(){
    if(cache) decorate(cache);
    else fetchUsers();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick); else tick();
  setInterval(tick, 1500);
  try{ new MutationObserver(function(){ tick(); }).observe(document.documentElement,{subtree:true,childList:true}); }catch(e){}
})();
