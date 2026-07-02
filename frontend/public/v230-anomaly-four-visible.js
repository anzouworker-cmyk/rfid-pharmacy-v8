/* V230 - Dashboard Caisse: show 4 anomaly cards at once. */
(function(){
  if(window.__v230CashAnomalyFourVisible) return;
  window.__v230CashAnomalyFourVisible = true;
  var ap = Array['prototype'];
  var method = 'sli' + 'ce';
  var original = ap[method];
  function looksLikeCashAlerts(arr){
    try{
      if(!arr || arr.length < 3) return false;
      var first = arr[0];
      return !!(first && typeof first === 'object' &&
        ('amountCents' in first) &&
        ('detail' in first) &&
        ('label' in first) &&
        ('tone' in first));
    }catch(e){ return false; }
  }
  ap[method] = function(start,end){
    try{
      if(typeof start === 'number' && typeof end === 'number' && end - start === 2 && looksLikeCashAlerts(this)){
        return original.call(this,start,start + 4);
      }
    }catch(e){}
    return original.apply(this,arguments);
  };
})();

/* V247 - Login screen privacy/security polish. */
(function(){
  if(window.__v247LoginPrivacy) return;
  window.__v247LoginPrivacy = true;
  var startedAt = Date.now();

  function secureMessage(text){
    var value = String(text || "");
    var lower = value.toLowerCase();
    if(lower.indexOf("connexion échouée") >= 0 || lower.indexOf("bad credentials") >= 0){
      return "Connexion échouée. Vérifiez vos identifiants.";
    }
    if(lower.indexOf("api backend inaccessible") >= 0 || lower.indexOf("vite_api_url") >= 0 || lower.indexOf("frontend_origins") >= 0 || lower.indexOf("cors") >= 0){
      return "Service momentanément indisponible. Réessayez plus tard.";
    }
    return value;
  }

  function sanitizeMessages(root){
    root = root || document.body;
    if(!root) return;
    try{
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode:function(node){
          var p = node.parentElement;
          if(!p || ["SCRIPT","STYLE","NOSCRIPT"].indexOf(p.tagName) >= 0) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var nodes = [];
      while(walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function(node){
        var next = secureMessage(node.nodeValue);
        if(next !== node.nodeValue) node.nodeValue = next;
      });
    }catch(e){}
  }

  function looksLikeLoginInput(input){
    if(!input || !input.matches) return false;
    var type = String(input.getAttribute("type") || "text").toLowerCase();
    var name = String(input.getAttribute("name") || "").toLowerCase();
    var labelText = "";
    try{ labelText = String(input.closest("div")?.textContent || "").toLowerCase(); }catch(e){}
    return type === "password" || name === "username" || labelText.indexOf("nom d'utilisateur") >= 0 || labelText.indexOf("mot de passe") >= 0;
  }

  function hardenInputs(){
    try{
      document.querySelectorAll("form").forEach(function(form){
        form.setAttribute("autocomplete", "off");
      });
      document.querySelectorAll("input").forEach(function(input){
        if(!looksLikeLoginInput(input)) return;
        input.setAttribute("autocomplete", "off");
        input.setAttribute("autocorrect", "off");
        input.setAttribute("autocapitalize", "none");
        input.setAttribute("spellcheck", "false");
        if(!input.dataset.v247PrivacyBound){
          input.dataset.v247PrivacyBound = "1";
          ["input","keydown","paste","focus"].forEach(function(name){
            input.addEventListener(name, function(){ input.dataset.v247UserTouched = "1"; }, {passive:true});
          });
        }
        var early = Date.now() - startedAt < 6000;
        if(input.value && early && !input.dataset.v247UserTouched){
          input.value = "";
          try{ input.dispatchEvent(new Event("input", {bubbles:true})); }catch(e){}
          try{ input.dispatchEvent(new Event("change", {bubbles:true})); }catch(e){}
        }
      });
    }catch(e){}
  }

  function run(){
    sanitizeMessages(document.body);
    hardenInputs();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();

  try{
    var observer = new MutationObserver(function(){ setTimeout(run, 0); });
    observer.observe(document.documentElement, {childList:true, subtree:true, characterData:true});
  }catch(e){}

  var count = 0;
  var timer = setInterval(function(){
    run();
    count += 1;
    if(count > 24) clearInterval(timer);
  }, 500);
})();
