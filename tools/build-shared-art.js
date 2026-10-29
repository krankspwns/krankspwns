// Derive the shared renderer from Crown Clash's canonical artwork.
// The source game keeps its existing initialization and interaction code.
const fs = require('node:fs');
const path = require('node:path');
module.exports = function buildSharedArt(root) {
  const read = file => fs.readFileSync(path.join(root,file),'utf8');
  const source = read('src/avatars.js');
  const start = source.indexOf('const eyes ='), end = source.indexOf('const GIFT_ART =');
  const giftStart=source.indexOf('const GIFT_SVG ='),giftEnd=source.indexOf('const giftEl =');
  if(giftStart<0 || giftEnd<=giftStart)throw Error('Missing canonical gift artwork.');
  const fit = source.match(/^const AV_FIT = .*$/m)?.[0];
  const settings = read('src/settings.js');
  const settingsArt = settings.match(/const SET_ICON = ('[^\n]*');/)?.[1];
  const guide = settings.match(/const GUIDE_ICON = ('[^\n]*');/)?.[1];
  const icons = read('src/icons.js').split('const COLOR_ICONS =')[0];
  const lineIcons = ['volume-x','volume-2','music','caret','link','copy','qr','logout','lock'].map(key=>{
    const row=icons.split('\n').find(line=>line.startsWith("  '"+key+"':") || line.startsWith('  '+key+':'));
    if(!row)throw Error('Missing header icon: '+key);
    return JSON.stringify(key)+':'+row.slice(row.indexOf(':')+1).trim().replace(/,$/,'');
  }).join(',');
  const shop = settings.match(/const SHOP_ICON = ('[^\n]*');/)?.[1];
  const gift = settings.match(/GIFT_ICON = ('[^\n]*');/)?.[1];
  const colorIcons=read('src/icons.js').split('const COLOR_ICONS =')[1];
  const soundIcons=['volume-x','volume-2','music'].map(key=>{
    const row=colorIcons.split('\n').find(line=>line.startsWith("  '"+key+"':") || line.startsWith('  '+key+':'));
    if(!row)throw Error('Missing canonical sound icon: '+key);
    return JSON.stringify(key)+':'+row.slice(row.indexOf(':')+1).trim().replace(/,$/,'');
  }).join(',');
  const roomIcons=Object.fromEntries(['link','copy','qr','users'].map(key=>[key,colorIcons.match(new RegExp('  '+key+": ('[^\\n]*'),"))?.[1]]));
  const users = read('src/icons.js').split('const COLOR_ICONS =')[1].match(/  users: ('[^\n]*'),/)?.[1];
  if (start < 0 || end <= start || !fit || !shop || !gift || !users || !guide || !settingsArt || Object.values(roomIcons).some(value=>!value)) throw Error('Shared artwork sources changed; update build-shared-art.js.');
  const out = `// Generated from src/avatars.js, src/icons.js and src/settings.js. Do not edit.\n(() => {\n'use strict';\n${source.slice(start,end)}\n${source.slice(giftStart,giftEnd)}\n${fit}\nconst LINE_ICONS = {${lineIcons}};
const SOUND_ICONS = {${soundIcons}};
const TOOLS = {${Object.entries(roomIcons).map(([key,value])=>JSON.stringify(key)+':'+value).join(',')},settings:${settingsArt},guide:${guide},shop:${shop}, gift:${gift}, players:${users}, profile:'<circle cx="16" cy="10" r="6" fill="#8fd3ff"/><path d="M4 29v-3a12 12 0 0124 0v3z" fill="#6b8cff"/><path d="M11 8q1-3 5-3" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>'};
let uid=0;
function unique(html) {
  const suffix='shared-av-'+(++uid);
  for(const [,id] of [...html.matchAll(/\\bid="([^"]+)"/g)]) html=html.split('id="'+id+'"').join('id="'+id+'-'+suffix+'"').split('url(#'+id+')').join('url(#'+id+'-'+suffix+')').split('href="#'+id+'"').join('href="#'+id+'-'+suffix+'"');
  return html;
}
function svg(body,box=48) {
  const n=document.createElement('span'); n.className='pf-art'; n.setAttribute('aria-hidden','true');
  n.innerHTML=unique('<svg viewBox="0 0 '+box+' '+box+'" width="100%" height="100%" aria-hidden="true">'+body+'</svg>'); return n;
}
function avatar(key,acc='') {
  if(!AVATARS[key]) key='cat';
  const [bg,body]=AVATARS[key], fit=AV_FIT[key];
  const portrait=fit ? '<g transform="translate('+(24-24*fit[0]+fit[1])+' '+(24-24*fit[0]+fit[2])+') scale('+fit[0]+')">'+body+'</g>' : body;
  const badge=LEGEND_KEYS.includes(key)?LEGEND_BADGE:PREMIUM_KEYS.includes(key)?STAR_BADGE:'';
  return svg('<circle cx="24" cy="24" r="24" fill="'+bg+'"/>'+portrait+(ACC[acc]?accFit(key,acc):'')+badge);
}
function icon(key,size=17) {
  const n=SOUND_ICONS[key] ? svg(SOUND_ICONS[key],32) : svg('<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+LINE_ICONS[key]+'</g>',24);
  n.classList.add('pf-line-icon');n.style.width=n.style.height=size+'px';return n;
}
function gift(key,size=40) {
  const n=svg(GIFT_SVG[key]||'');n.classList.add('pf-gift');n.style.width=n.style.height=size+'px';return n;
}
window.AvatarArt={gift,icon,el:avatar,free:AVATAR_KEYS,has:key=>Object.hasOwn(AVATARS,key),keys:Object.keys(AVATARS),tool:key=>svg(TOOLS[key]||TOOLS.profile,32)};
})();\n`;
  fs.writeFileSync(path.join(root,'public/avatar-art.js'),out);
};
