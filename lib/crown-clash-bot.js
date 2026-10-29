// Decisions use only this seat's cards; no access to opponents' hidden boards.
const {pick}=require('./practice-bots');
const rank=c=>c==='JK'?14:({A:14,K:13,Q:12,J:11}[c.slice(0,-1)]||+c.slice(0,-1));
const points=c=>c==='JK'?0:c[0]==='A'?2:/^[JQK]/.test(c)?1:rank(c)*2;
function strength(hand){
  const jokers=hand.filter(c=>c==='JK').length,rs=hand.filter(c=>c!=='JK').map(rank).sort((a,b)=>a-b);
  const flush=hand.filter(c=>c!=='JK').every((c,_,a)=>c.slice(-1)===a[0].slice(-1));
  const counts=rs.map(r=>rs.filter(n=>n===r).length),same=Math.max(0,...counts)+jokers;
  const unique=[...new Set(rs)],straight=unique.length===rs.length&&(unique.at(-1)-unique[0]<=2||unique.includes(14)&&unique.every(r=>[14,2,3].includes(r)));
  return flush&&straight?6:same>=3?4:flush?3:straight?2:same>=2?1:0;
}
function quality(a){
  const total=points(a[2])+points(a[3]),wild=a.slice(2,4).includes('JK');
  const pair=wild?21:total;
  return rank(a[0])/14+(a[1]==='JK'?1:(15-rank(a[1]))/13)+(pair<=21?pair/21:-1)+strength(a.slice(4))/3;
}
function arrange(hand){
  let best=hand.slice(),score=-Infinity;
  for(let n=0;n<100;n++){
    const cards=hand.slice();for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}
    const value=quality(cards)+Math.random()*.35;if(value>score){best=cards;score=value;}
  }
  return best;
}
function calls(players,meId){const others=players.filter(p=>p.id!==meId);return Array.from({length:4},()=>Math.random()<.2?null:pick(others)?.id||null);}
module.exports={arrange,calls,quality};
