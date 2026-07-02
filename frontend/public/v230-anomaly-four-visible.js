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

/* V248 - Strict login privacy: no exposed credentials and no default values. */
(function(){
  if(window.__v248LoginPrivacyStrict) return;
  window.__v248LoginPrivacyStrict = true;

  function safeText(text){
    var value = String(text || "");
    var lower = value.toLowerCase();
    if(lower.indexOf("connexion échouée") >= 0 || lower.indexOf("bad credentials") >= 0){
      return "Connexion échouée. Vérifiez vos identifiants.";
    }
    if(lower.indexOf("api backend inaccessible") >= 0 || lower.indexOf("vite_api_url") >= 0 || lower.indexOf("frontend_origins") >= 0 || lower.indexOf("cors") >= 0){
      return "Service momentanément indisponible. Réessayez plus tard.";
    }
    value = value.replace(/demo\s*\/\s*demo123/gi, "vos identifiants");
    value = value.replace(/admin\s*\/\s*admin123/gi, "vos identifiants");
    value = value.replace(/après\s+redéploiement\s+du\s+backend/gi, "");
    return value;
  }

  function sanitizeText(root){
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
      var nodes=[];
      while(walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function(node){
        var next = safeText(node.nodeValue);
        if(next !== node.nodeValue) node.nodeValue = next;
      });
    }catch(e){}
  }

  function isLoginField(input){
    if(!input || !input.matches) return false;
    var type = String(input.getAttribute("type") || "text").toLowerCase();
    var name = String(input.getAttribute("name") || "").toLowerCase();
    var ac = String(input.getAttribute("autocomplete") || "").toLowerCase();
    var label = "";
    try{ label = String(input.closest("div") && input.closest("div").textContent || "").toLowerCase(); }catch(e){}
    return type === "password" || name === "username" || ac.indexOf("username") >= 0 || ac.indexOf("password") >= 0 || label.indexOf("nom d'utilisateur") >= 0 || label.indexOf("mot de passe") >= 0;
  }

  function setNativeValue(input, value){
    try{
      var proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(input, value);
    }catch(e){ input.value = value; }
  }

  function clearField(input){
    if(!input || !isLoginField(input)) return;
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "none");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("data-lpignore", "true");

    var value = String(input.value || "");
    var shouldClear = /^(demo|admin|demo123|admin123)$/i.test(value);
    if(shouldClear){
      setNativeValue(input, "");
      try{ input.dispatchEvent(new Event("input", {bubbles:true})); }catch(e){}
      try{ input.dispatchEvent(new Event("change", {bubbles:true})); }catch(e){}
    }
  }

  function harden(){
    try{
      document.querySelectorAll("form").forEach(function(form){ form.setAttribute("autocomplete", "off"); });
      document.querySelectorAll("input").forEach(clearField);
    }catch(e){}
  }

  function run(){
    sanitizeText(document.body);
    harden();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();

  try{
    new MutationObserver(function(){ setTimeout(run, 0); }).observe(document.documentElement, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:["value","autocomplete"]});
  }catch(e){}

  setInterval(run, 300);
})();
