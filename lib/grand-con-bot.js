// Evidence knowledge is authored text, never the room's hidden answer. Truth bots
// see their own clue, public claims and their own one-use original-clue check.
const CASES=require('./grand-con-cases'),B=require('./practice-bots');
const evidence=new Map(),opposite=new Map();
for(const c of CASES)for(const r of c.records){
  opposite.set(r.genuine,r.oppositeGenuine);opposite.set(r.forged,r.oppositeForged);
  if(r.genuine!==r.forged){evidence.set(r.genuine,1);evidence.set(r.forged,-1);}
  if(r.oppositeGenuine!==r.oppositeForged){evidence.set(r.oppositeGenuine,-1);evidence.set(r.oppositeForged,1);}
}
const signal=text=>evidence.get(text)||0;
function verdict(view){
  if(view.me.team==='ring')return view.me.ring.genuine?'reject':'approve';
  let score=signal(view.me.document?.text)*2;
  const audit=view.me.auditReport;if(audit?.round===view.lotNumber)score+=signal(audit.text)*3;
  for(const claim of view.claims||[]){
    if(claim.id===view.meId)continue;
    const quoted=[...evidence].find(([text])=>claim.text.includes(text));
    score+=quoted?quoted[1]:(claim.choice==='approve'?.3:claim.choice==='reject'?-.3:0);
  }
  return score?score>0?'approve':'reject':Math.random()<.5?'approve':'reject';
}
function decide(view){
  if(view.phase==='forging'&&view.me.ring?.forgerId===view.meId&&!view.me.ring.tamper){
    const others=view.me.ring.options.filter(d=>!view.me.ring.allies.includes(d.ownerId));
    return {action:'forge',targetId:B.pick(others.length?others:view.me.ring.options)?.ownerId};
  }
  if(view.phase==='discussion'&&!view.claims.some(c=>c.id===view.meId)){
    const choice=verdict(view),clue=view.me.document;
    const received=clue?.text||'',bluff=view.me.team==='ring'&&signal(received)!==(choice==='approve'?1:-1)?opposite.get(received)||received:received;
    return {action:'claim',choice,text:Array.from((clue?clue.source+': '+bluff+' ':'')+'I think '+(choice==='approve'?'REAL.':'FAKE.')).slice(0,180).join('')};
  }
  if(view.phase==='voting'&&!view.me.vote)return {action:'vote',choice:verdict(view)};
  return null;
}
function tick(room,actions){
  if(['lobby','finished','reveal'].includes(room.phase))return false;
  let changed=false;
  for(const bot of B.present(room).filter(p=>p.bot)){
    const wait=B.due(bot,[room.match,room.lot,room.phase].join(':'));changed=wait.changed||changed;if(!wait.act)continue;
    let view=actions.view(room,bot);
    // An occasional private audit resolves a disagreement; it does not inspect
    // another private hand or reveal the answer to the bot's teammates.
    if(view.phase==='discussion'&&bot.team==='house'&&!bot.auditUsed&&view.claims.some(c=>c.id!==bot.id&&c.choice!==verdict(view))&&Math.random()<.35){
      const target=B.pick(view.players.filter(p=>p.id!==bot.id&&!p.departed));
      const doc=target&&room.documents.find(d=>d.ownerId===target.id);
      if(doc){bot.auditUsed=true;bot.auditReport={round:room.lot+1,targetId:target.id,source:doc.source,text:doc.text};changed=true;view=actions.view(room,bot);}
    }
    const move=decide(view);if(!move)continue;
    if(move.action==='forge')actions.seal(room,move.targetId);
    if(move.action==='claim')room.claims.push({id:bot.id,text:move.text,choice:move.choice,updatedAt:Date.now()});
    if(move.action==='vote'){
      if(!room.electorate.includes(bot.id))continue;
      room.votes[bot.id]=move.choice;if(room.electorate.every(id=>room.votes[id]))actions.settle(room);
    }
    changed=true;
  }
  return changed;
}
module.exports={tick,decide,verdict,signal};
