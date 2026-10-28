// Local UI dictionaries. Player text, card codes and room credentials are never translated.
(() => {
  'use strict';
  const LANGS={en:['EN','English','en'],zh:['简体','简体中文','zh-CN'],zht:['繁體','繁體中文','zh-TW']};
  const SKIP='script,style,[contenteditable],[data-no-tr],.card-index,.card-pips,.pf-name,.pf-pname,.claim-copy,.chat-message,.room-code,.large-code';
  const attrs=['placeholder','aria-label','title','alt'];
  const base={},extra={},dicts={},loads={},texts=new WeakMap(),attributes=new WeakMap(),names=new Set();
  let lang='en',host=null;
  try {const saved=localStorage.getItem('sct-lang'),nav=navigator.language.toLowerCase();lang=LANGS[saved]?saved:nav.startsWith('zh')?(/tw|hk|mo|hant/.test(nav)?'zht':'zh'):'en';}catch{}
  const englishTitle=document.title;
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function register(code,part,dict){part[code]=dict;if(base[code]&&extra[code]){
    const exact={...base[code].exact,...extra[code].exact};
    const lower=new Map(Object.entries(exact).map(([a,b])=>[a.toLowerCase(),b]));
    const patterns=[...(extra[code].patterns||[]),...(base[code].patterns||[])].map(([a,b])=>{
      const keys=[];const re=a.split(/(\{N?\d\}|\{#\})/).map(p=>{
        if(p==='{#}'){keys.push('#');return '([\\d.,]+)';}
        if(/^\{N?\d\}$/.test(p)){keys.push(p.slice(1,-1));return p.startsWith('{N')?'([^.!?,:;。]{1,60}?)':'(.+?)';}
        return escape(p);
      }).join('');return {re:new RegExp('^'+re+'$','i'),keys,to:b};
    });dicts[code]={exact,lower,patterns};if(code===lang)refresh();
  }}
  window.LT_I18N_REGISTER=(code,dict)=>register(code,base,dict);
  window.GAME_I18N_REGISTER=(code,dict)=>register(code,extra,dict);
  function load(code){if(code==='en'||dicts[code])return Promise.resolve();return loads[code] ||= Promise.all(['last-train-i18n-','game-i18n-'].map(prefix=>new Promise((ok,bad)=>{const s=document.createElement('script');s.src='/'+prefix+code+'.js';s.onload=ok;s.onerror=bad;document.head.append(s);}))).catch(e=>{delete loads[code];throw e;});}
  function t(text,depth=0){if(lang==='en'||!dicts[lang]||!text||depth>4)return text;
    const m=/^(\s*)([\s\S]*?)(\s*)$/.exec(text),word=m[2],d=dicts[lang];if(names.has(word))return text;
    let out=d.exact[word]??d.lower.get(word.toLowerCase());
    if(out===undefined)for(const p of d.patterns){const hit=p.re.exec(word);if(!hit)continue;const vals={};let num=0;
      p.keys.forEach((k,i)=>{vals[k==='#'?'#'+num++:k.replace('N','')]=k.startsWith('N')?hit[i+1]:t(hit[i+1],depth+1);});let j=0;
      out=p.to.replace(/\{(\d|#)\}/g,(_,k)=>vals[k==='#'?'#'+j++:k]??'');break;}
    if(out===undefined&&word.endsWith(':'))out=t(word.slice(0,-1),depth+1)+'：';
    if(out===undefined&&word.includes('·'))out=word.split(/(\s*·\s*)/).map((p,i)=>i%2?p:t(p,depth+1)).join('');
    return m[1]+(out??word)+m[3];
  }
  function process(node){if(node.nodeType===3){if(node.parentElement?.closest(SKIP+',textarea'))return;const old=texts.get(node),en=old&&old.out===node.data?old.en:node.data,out=t(en);texts.set(node,{en,out});if(node.data!==out)node.data=out;return;}
    if(node.nodeType!==1||node.closest(SKIP))return;
    for(const attr of attrs)if(node.hasAttribute(attr)){let record=attributes.get(node);if(!record)attributes.set(node,record={});const value=node.getAttribute(attr),old=record[attr],en=old&&old.out===value?old.en:value,out=t(en);record[attr]={en,out};if(value!==out)node.setAttribute(attr,out);}
    if(node.tagName==='TEXTAREA')return;
    for(const child of node.childNodes)process(child);
  }
  function refresh(){document.documentElement.lang=LANGS[lang][2];document.title=t(englishTitle);if(document.body)process(document.body);draw();}
  async function set(code){if(!LANGS[code])return;try{await load(code);lang=code;try{localStorage.setItem('sct-lang',code);}catch{}refresh();}catch{window.Platform?.toast('Could not load the language. Please try again.');}}
  function draw(){if(!host)return;const open=host.classList.contains('open');host.replaceChildren();
    const b=document.createElement('button');b.type='button';b.className='pf-ddbtn';b.dataset.focus='language';b.setAttribute('aria-label','Language');b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-expanded',String(open));b.textContent=LANGS[lang][0];b.append(window.AvatarArt.icon('caret',11));
    b.onclick=e=>{e.stopPropagation();document.querySelectorAll('.header-tools .pf-dd.open').forEach(n=>{if(n!==host){n.classList.remove('open');n.querySelector('button')?.setAttribute('aria-expanded','false');}});host.classList.toggle('open');b.setAttribute('aria-expanded',String(host.classList.contains('open')));};
    const menu=document.createElement('div');menu.className='pf-ddmenu';menu.setAttribute('role','menu');
    for(const [code,[short,full]]of Object.entries(LANGS)){const choice=document.createElement('button');choice.type='button';choice.setAttribute('role','menuitemradio');choice.setAttribute('aria-checked',String(code===lang));choice.className=code===lang?'on':'';choice.textContent=short+' · '+full;choice.onclick=e=>{e.stopPropagation();host.classList.remove('open');draw();set(code);host.querySelector('button').focus();};menu.append(choice);}
    host.append(b,menu);
  }
  function menu(){if(!host){host=document.createElement('div');host.className='pf-dd pf-language';host.dataset.noTr='';draw();}return host;}
  document.addEventListener('click',()=>{if(host?.classList.contains('open')){host.classList.remove('open');draw();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&host?.classList.contains('open')){host.classList.remove('open');draw();host.querySelector('button').focus();}});
  window.GameI18n={LANGS,get lang(){return lang;},set,t,menu,protectName:name=>{if(name)names.add(name);return name;}};
  new MutationObserver(list=>{if(lang==='en')return;for(const m of list){if(m.type==='childList')m.addedNodes.forEach(process);else process(m.target);}}).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attrs});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
  load(lang).then(refresh).catch(()=>{});
})();
