/* V247 - Login security polish: no demo credentials in UI and no prefilled login fields. */
(function(){
  if(window.__v247LoginSecurity) return;
  window.__v247LoginSecurity = true;

  var startedAt = Date.now();
  var sensitivePairs = [
    /demo\s*\/\s*demo123/gi,
    /admin\s*\/\s*admin123/gi,
    /essayez\s+demo\s*\/\s*demo123\s+ou\s+admin\s*\/\s*admin123\s+après\s+redéploiement\s+du\s+backend\.?/gi,
    /connectez-vous\s+avec\s+admin\s*\/\s*admin123\.?/gi
  ];

  function safeMessage(text){
    var value = String(text || "");
    if(!value) return value;
    var lower = value.toLowerCase();
    if(lower.indexOf("connexion échouée") >= 0 || lower.indexOf("bad credentials") >= 0){
      return "Connexion échouée. Vérifiez vos identifiants.";
    }
    if(lower.indexOf("api backend inaccessible") >= 0 || lower.indexOf("cors") >= 0 || lower.indexOf("vite_api_url") >= 0 || lower.indexOf("frontend_origins") >= 0){
      return "Service momentanément indisponible. Réessayez plus tard.";
    }
    sensitivePairs.forEach(function(pattern){
      value = value.replace(pattern, "vos identifiants");
    });
    return value;
  }

  function sanitizeTextNodes(root){
    root = root || document.body;
    if(!root) return;
    try{
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function(node){
          var parent = node.parentElement;
          if(!parent) return NodeFilter.FILTER_REJECT;
          var tag = parent.tagName;
          if(tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var nodes = [];
      while(walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function(node){
        var next = safeMessage(node.nodeValue);
        if(next !== node.nodeValue) node.nodeValue = next;
      });
    }catch(e){}
  }

  function isLoginInput(input){
    if(!input || !input.matches) return false;
    var type = String(input.getAttribute("type") || "text").toLowerCase();
    var name = String(input.getAttribute("name") || "").toLowerCase();
    var label = "";
    try{ label = String(input.closest("div") && input.closest("div").textContent || "").toLowerCase(); }catch(e){}
    return type === "password" || name === "username" || label.indexOf("nom d'utilisateur") >= 0 || label.indexOf("mot de passe") >= 0;
  }

  function clearInput(input, force){
    if(!input) return;
    var type = String(input.getAttribute("type") || "text").toLowerCase();
    var value = String(input.value || "");
    var defaultCredential = /^(demo|admin|demo123|admin123)$/i.test(value);
    var early = Date.now() - startedAt < 5000;
    if(value && (force || defaultCredential || (!input.dataset.v247Touched && early))){
      input.value = "";
      try{ input.dispatchEvent(new Event("input", {bubbles:true})); }catch(e){}
      try{ input.dispatchEvent(new Event("change", {bubbles:true})); }catch(e){}
    }
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "none");
    input.setAttribute("spellcheck", "false");
    if(type === "password") input.setAttribute("data-lpignore", "true");
  }

  function hardenLoginFields(){
    try{
      document.querySelectorAll("form").forEach(function(form){
        form.setAttribute("autocomplete", "off");
      });
      document.querySelectorAll("input").forEach(function(input){
        if(!isLoginInput(input)) return;
        if(!input.dataset.v247Bound){
          input.dataset.v247Bound = "1";
          ["input","keydown","paste","focus"].forEach(function(eventName){
            input.addEventListener(eventName, function(){ input.dataset.v247Touched = "1"; }, {passive:true});
          });
        }
        clearInput(input, false);
      });
    }catch(e){}
  }

  function run(){
    sanitizeTextNodes(document.body);
    hardenLoginFields();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();

  var observer = new MutationObserver(function(mutations){
    var shouldRun = false;
    mutations.forEach(function(m){
      if(m.type === "childList" || m.type === "characterData") shouldRun = true;
    });
    if(shouldRun) setTimeout(run, 0);
  });
  try{ observer.observe(document.documentElement, {childList:true, subtree:true, characterData:true}); }catch(e){}

  var attempts = 0;
  var timer = setInterval(function(){
    attempts++;
    run();
    if(attempts > 20) clearInterval(timer);
  }, 500);
})();
