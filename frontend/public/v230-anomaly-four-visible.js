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
