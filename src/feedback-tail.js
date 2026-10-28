
;/* ツール意見箱ボタン（全ツール共通） */(function(){
var FB_URL='https://script.google.com/macros/s/AKfycbwl-ZCZ1LyefvSzEGkBEpTFTuFyvW0p-AYye6jBWaLP9t7-bC9_Owfeh4jKScNkFys6Fw/exec';
var FB_TOOL='オリパ作成アシスト';
var MAP={'322':'柏','323':'津田沼','324':'松戸','325':'横浜','326':'中野','327':'町田','328':'千葉中央','390':'本部','409':'お台場'};
function storeId(){var h=document.getElementById('ndk-oripa-host');var s=h&&h.shadowRoot&&h.shadowRoot.querySelector('#store');return s?s.value:'';}
function storeName(){
  var id='';
  try{id=storeId()||'';}catch(e){}
  if(!id){try{performance.getEntriesByType('resource').forEach(function(e){var m=e.name.match(/\/api\/store\/(\d+)\//);if(m)id=m[1];});}catch(e){}}
  if(!id){var m=location.pathname.match(/store\/(\d+)/);if(m)id=m[1];}
  return MAP[String(id)]||'';
}
function isAll(){var h=document.getElementById('ndk-oripa-host');return !!(h&&h.shadowRoot&&h.shadowRoot.querySelector('#allst'));}
function pageStore(){var m=document.body.innerText.match(/店舗：\s*([^\n]+)/);var n=m?m[1]:'';var r='';Object.keys(MAP).forEach(function(k){if(n.indexOf(MAP[k])>=0)r=MAP[k];});return r;}
function go(){var all=isAll();window.open(FB_URL+'?tool='+encodeURIComponent(all?'全店オリパ作成':FB_TOOL)+'&store='+encodeURIComponent(all?pageStore():storeName()),'_blank');}
function makeBtn(){
  var b=document.createElement('button');
  b.type='button';b.className='ndk-fb-btn';b.textContent='意見を送る';
  b.setAttribute('style','all:initial;display:inline-block;cursor:pointer;font:700 12px/1 "Hiragino Sans","Yu Gothic UI",Meiryo,sans-serif;color:#fff;background:#2563eb;border-radius:999px;padding:7px 12px;margin:0 0 0 8px;box-shadow:0 1px 4px rgba(0,0,0,.25)');
  b.onclick=function(ev){ev.preventDefault();ev.stopPropagation();go();};
  return b;
}
/* attach() はツールの画面があれば true、なければ false を返す */
function attach(){var h=document.getElementById('ndk-oripa-host');var sr=h&&h.shadowRoot;if(!sr)return false;
  var hd=sr.querySelector('.hd');if(hd&&!hd.querySelector('.ndk-fb-btn'))hd.appendChild(makeBtn());
  return true;}
var seen=false,t=setInterval(function(){
  var ok=false;try{ok=attach();}catch(e){}
  if(ok)seen=true;else if(seen)clearInterval(t);
},700);
setTimeout(function(){if(!seen)clearInterval(t);},30000);
})();
