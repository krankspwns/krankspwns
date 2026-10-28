const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const dicts={};for(const code of ['zh','zht'])vm.runInNewContext(fs.readFileSync('public/game-i18n-'+code+'.js','utf8'),{window:{GAME_I18N_REGISTER:(c,d)=>dicts[c]=d}});
let count=0;function inspect(value){
 if(typeof value==='string'&&/[A-Z]/.test(value)&&value.length>5){for(const code of ['zh','zht']){const t=dicts[code].exact[value];assert.ok(t,'Missing '+code+': '+value);assert.deepEqual((t.match(/\d+/g)||[]).sort(),(value.match(/\d+/g)||[]).sort(),'Dates/numbers changed: '+value);}count++;}
 else if(Array.isArray(value))value.forEach(inspect);
 else if(value&&typeof value==='object')Object.entries(value).filter(([k])=>!['id','art'].includes(k)).forEach(([,v])=>inspect(v));
}
inspect(require('../lib/grand-con-cases'));inspect(require('../lib/grand-con-extra-cases'));
for(const d of Object.values(dicts))for(const [from,to] of d.patterns){const slots=from.match(/\{N?\d\}|\{#\}/g)||[],keys=slots.filter(s=>s!=='{#}').map(s=>s.replace('N',''));assert.equal(new Set(keys).size,keys.length,'Duplicate slot: '+from);for(const p of to.match(/\{\d\}/g)||[])assert.ok(keys.includes(p),'Unknown slot '+p+' in '+from);}
console.log(count+' case texts translated in both Chinese variants; dates, numbers and template slots verified');
