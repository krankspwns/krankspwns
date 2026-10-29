// Every decision is made from the same private view that a human seat receives.
const R=require('./last-train-rules'),B=require('./practice-bots');
const dialogue=require('../public/last-train-test-strategy');
function suspect(view){
  const allies=new Set((view.me.allies||[]).map(p=>p.id));
  const others=view.players.filter(p=>p.alive&&p.id!==view.meId&&!allies.has(p.id)&&!p.departed);
  const reports=view.me.reports||[],bad=reports.filter(r=>r.type==='check'&&r.alignment==='bad').map(r=>r.targetId);
  const good=new Set(reports.filter(r=>r.type==='check'&&r.alignment==='good').map(r=>r.targetId));
  const accused=others.find(p=>!good.has(p.id)&&(view.speeches||[]).some(s=>s.round>=view.round-1&&s.text?.includes(p.name)&&/checked[^.]*\bbad\b/i.test(s.text)));
  return others.find(p=>bad.includes(p.id))||accused||B.pick(others.filter(p=>!good.has(p.id)))||B.pick(others);
}
function decide(view,memory){
  const me=view.me,others=view.players.filter(p=>p.alive&&p.id!==view.meId&&!p.departed),target=suspect(view);
  if(view.paused||!me.alive||me.departed)return null;
  if(view.phase==='briefing'&&!me.ready)return {action:'ready'};
  if(view.phase==='discussion'&&view.speakerId===view.meId)return {action:'speak',text:dialogue.statement(memory,view)};
  if(view.phase==='voting'&&!me.vote){
    const pool=others.filter(p=>!view.voteCandidates||view.voteCandidates.includes(p.id));
    const choice=pool.find(p=>p.id===target?.id)||B.pick(pool);
    return {action:'vote',targetId:choice?.id||null,doubled:me.role==='speaker'&&!me.used.double&&!!choice};
  }
  if(view.phase!=='night')return null;
  const role=view.nightRole;
  if(role==='saboteur'){
    if(me.group!=='saboteur')return null;
    const proposals=(me.teamChoices||[]).filter(p=>p.id!==view.meId&&p.selected);
    const proposal=proposals.find(p=>!view.players.find(q=>q.id===p.id)?.bot)||proposals[0];
    const previous=me.nightChoice,attackId=proposal?proposal.attackId:previous?.attackId||target?.id||null;
    if(previous&&previous.attackId===attackId)return null;
    const power=me.role==='blocker'&&!me.used.block&&target?'block':'pass';
    return {action:'night',attackId,power,...(power==='block'?{targetId:target.id}:{})};
  }
  if(role==='medic'){
    if(me.role!=='medic')return null;
    if(me.blocked||me.medicineChoice)return null;
    const knownBad=(me.reports||[]).find(r=>r.type==='check'&&r.alignment==='bad'&&others.some(p=>p.id===r.targetId));
    if(me.patientId&&me.medicine.heal)return {action:'medicine',power:'heal'};
    const claim=target&&(view.speeches||[]).some(s=>s.round>=view.round-1&&s.text?.includes(target.name)&&/checked[^.]*\bbad\b/i.test(s.text));
    if(me.medicine.poison&&(knownBad||claim&&Math.random()<.65))return {action:'medicine',power:'poison',targetId:knownBad?.targetId||target.id};
    return {action:'medicine',power:'pass'};
  }
  if(me.nightChoice||role!==me.role)return null;
  const powers={careful:'lock',brave:'cover',inspector:'check',witness:'watch',conductor:'manifest',porter:'post',guard:'guard',steward:'pill',signalman:'signal'};
  let power=powers[role];if(!power)return null;
  let pool=others.filter(p=>!(me.used.last?.round===view.round-1&&me.used.last.targetId===p.id));
  const safe=(me.reports||[]).filter(r=>r.type==='check'&&r.alignment==='good').map(r=>r.targetId);
  if(['lock','cover','signal'].includes(power)&&(me.used[power]||Math.random()<.45))power='pass';
  if(power==='watch')power=!me.sightsLeft?'pass':Math.random()<.4?'glimpse':'watch';
  if(['check','watch','glimpse','manifest'].includes(power)&&view.event?.key==='power-cut')power='pass';
  const targeted=['cover','check','manifest','post','guard','pill'].includes(power);
  const chosen=targeted?(power==='check'?B.pick(pool.filter(p=>!(me.reports||[]).some(r=>r.type==='check'&&r.targetId===p.id)))||B.pick(pool):['cover','guard'].includes(power)?B.pick(pool.filter(p=>safe.includes(p.id)))||B.pick(pool):B.pick(pool)):null;
  if(targeted&&!chosen)power='pass';
  return {action:'night',power,...(power!=='pass'&&chosen?{targetId:chosen.id}:{})};
}
function tick(room){
  if(room.paused||['lobby','finished'].includes(room.phase))return false;
  let changed=false;
  for(const bot of B.present(room).filter(p=>p.bot&&p.alive!==false)){
    const memory=bot.botMemory||={pid:bot.id};
    let view=R.view(room,bot);if(dialogue.remember(memory,view))changed=true;
    const wait=B.due(bot,[room.match,room.round,room.step].join(':'));changed=wait.changed||changed;
    if(!wait.act)continue;
    const move=decide(view,memory);if(!move)continue;
    try{
      if(move.action==='ready'){room.ready[bot.id]=true;if(R.alive(room).every(p=>room.ready[p.id]))R.board(room);}
      if(move.action==='night'){
        R.nightChoice(room,bot,move);
        // Special bad-team powers share the normal attack window and keep its target.
        view=R.view(room,bot);const special={forger:'disguise',framer:'frame',silencer:'gag',smuggler:'smuggle'}[view.me.role];
        if(special&&!view.me.used[special]){
          const target=special==='disguise'?bot.id:suspect(view)?.id;
          if(special==='smuggle'||target)R.nightChoice(room,bot,{power:special,...(special!=='smuggle'?{targetId:target}:{})});
        }
      }
      if(move.action==='medicine')R.medicineChoice(room,bot,move);
      if(move.action==='speak')R.speak(room,bot,move.text);
      if(move.action==='vote')R.vote(room,bot,move);
      dialogue.remember(memory,R.view(room,bot));changed=true;
    }catch(e){if(![400,403,409].includes(e.status))throw e;}
  }
  return changed;
}
module.exports={tick,decide,suspect};
