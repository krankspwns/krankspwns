const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const r = require('../lib/last-train-rules');
const { call, startRedis } = require('./helpers');
const uuid = () => crypto.randomUUID();
const rejected = (fn, status) => assert.throws(fn, e => e.status === status);
function fixture(roles = r.plan(12), discussion = 'in-person') {
  const room = { code: 'TEST', nightMode: 'legacy', rulesVersion: 2, version: 1, nightOrder: ['saboteur','medic','brave','careful','inspector','witness'], match: 1, round: 0, step: 0, settings: { extra: 'brave', blocker: true, discussion }, medicine: { heal: 1, poison: 1 }, history: [], speeches: [], players: roles.map((role,i) => ({ id: 'p'+i, name: role+i, role, originalRole: role, alive: true, used: {}, reports: [] })) };
  room.hostId = room.players[0].id; room.seatOrder = room.players.map(p => p.id).reverse(); r.beginNight(room); r.advance(room); return room;
}
const person = (room, role) => room.players.find(p => p.role === role && p.alive);
function turn(room, role) { while (room.phase === 'night' && r.nightRole(room) !== role) r.advance(room); assert.equal(r.nightRole(room), role); }
function morning(room) { while(room.phase === 'night')r.advance(room); assert.equal(room.phase,'gathering'); r.advance(room); assert.equal(room.phase,'morning'); }
function attack(room, target) { for(const p of r.alive(room).filter(p=>r.group(p)==='saboteur'))r.nightChoice(room,p,{attackId:target}); }
function sharedNightTests() {
  const shared = () => { const room = fixture(['careful','brave','witness','passenger','inspector','medic','trainee','saboteur','blocker']); room.nightMode = 'shared'; r.phase(room, 'night', 25); return room; };
  for (const blockedRole of [null, 'careful', 'brave', 'medic', 'inspector', 'witness']) {
    const room = shared(), c = person(room,'careful'), b = person(room,'brave'), m = person(room,'medic'), i = person(room,'inspector'), w = person(room,'witness'), bad = person(room,'blocker');
    const patient = person(room,'passenger');
    assert.equal(r.nightRole(room),'moves');
    rejected(()=>r.nightChoice(room,i,{power:'check',targetId:bad.id}),403);
    rejected(()=>r.medicineChoice(room,m,{power:'heal'}),403);
    r.nightChoice(room,c,{power:'lock'}); r.nightChoice(room,b,{power:'cover',targetId:patient.id});
    attack(room,patient.id);
    if (blockedRole) r.nightChoice(room,bad,{power:'block',targetId:person(room,blockedRole).id,attackId:patient.id});
    r.nightChoice(room,bad,{attackId:patient.id}); // Editing attack must not cancel its block.
    for (const p of room.players) {
      const v = r.view(room,p); assert.equal(v.nightPhase,1); assert.equal(v.duration,25); assert.equal('patientId' in v.me,false);
      if (r.group(p)!=='saboteur') assert.equal('teamChoices' in v.me,false);
      assert.ok(v.players.every(q=>!q.role));
    }
    assert.equal(room.phase,'night'); r.advance(room); assert.equal(r.nightRole(room),'responses'); assert.equal(room.duration,25);
    rejected(()=>r.nightChoice(room,bad,{attackId:i.id}),403);
    rejected(()=>r.nightChoice(room,b,{power:'pass'}),403);
    if (blockedRole==='medic') { rejected(()=>r.medicineChoice(room,m,{power:'heal'}),409); assert.equal(room.medicine.heal,1); assert.equal(r.view(room,m).me.patientId,null); }
    else r.medicineChoice(room,m,{power:'heal'});
    r.nightChoice(room,i,{power:'check',targetId:bad.id}); r.nightChoice(room,w,{power:'watch'});
    assert.equal(i.reports[0].type,blockedRole==='inspector'?'check-blocked':'check');
    assert.equal(w.reports[0].type,blockedRole==='witness'?'watch-blocked':'watch');
    if(blockedRole!=='inspector')assert.equal(i.reports[0].alignment,'bad');
    assert.equal(room.phase,'night'); r.advance(room); assert.equal(room.phase,'gathering');
    const out=room.history[0].outs.find(p=>p.id===patient.id);
    if(blockedRole==='brave'||blockedRole==='medic')assert.equal(out,undefined);
    else assert.deepEqual(out.causes,['overdose']);
    for(const p of room.players)assert.ok(r.view(room,p).history[0].outs.every(o=>!o.role&&!o.group));
  }
  // Actual fatal causes, including simultaneous attack and poison, are public without exact roles.
  for(const kind of ['attack','poison','both','overdose']) {
    const room=shared(),target=person(room,'passenger'),med=person(room,'medic');
    if(kind!=='poison')attack(room,target.id);
    if(kind==='overdose')r.nightChoice(room,person(room,'brave'),{power:'cover',targetId:target.id});
    r.advance(room);
    if(kind==='poison'||kind==='both')r.medicineChoice(room,med,{power:'poison',targetId:target.id});
    if(kind==='overdose')r.medicineChoice(room,med,{power:'heal'});
    r.advance(room);const causes=kind==='both'?['attack','poison']:[kind];
    assert.deepEqual(room.history[0].outs[0].causes,causes);
    assert.deepEqual(r.view(room,med).history[0].outs[0].causes,causes);
  }
  // Spent or removed powers do not shorten the two windows; old nights upgrade at a boundary.
  const room=shared();room.players.forEach(p=>p.used={lock:true,cover:true,watch:true,block:true});
  r.advance(room);assert.equal(room.duration,25);r.advance(room);assert.equal(room.phase,'gathering');
  const old=fixture();delete old.nightMode;assert.equal(r.nightRole(old),'saboteur');r.beginNight(old);r.advance(old);assert.equal(r.nightRole(old),'moves');assert.equal(old.duration,25);
}
function socialTests() {
  // Reactions, shop, throws and pins: separate Last Train wallet, never at night, never on the step fence.
  const room=fixture(['careful','brave','witness','passenger','inspector','medic','trainee','saboteur','blocker']);room.nightMode='shared';
  const [a,b,c]=room.players,bad=person(room,'saboteur');
  assert.equal(room.phase,'night');rejected(()=>r.emote(room,a,'laugh',1000),409);rejected(()=>r.throwGift(room,a,'tomato',b.id,1000),409);
  room.phase='gathering';rejected(()=>r.emote(room,a,'ez',1000),400);
  assert.equal(r.emote(room,a,'sus',1000),true);assert.equal(r.emote(room,a,'shh',1500),false);assert.equal(r.emote(room,a,'eyes',2000),true);
  assert.deepEqual(r.view(room,b).emotes.map(x=>x.e),['sus','eyes']);
  a.alive=false;assert.equal(r.emote(room,a,'rip',4000),true);a.alive=true; // ghosts may still react
  assert.equal(r.view(room,a).me.wallet.wp,r.START_WP);
  rejected(()=>r.buy(room,a,'frame','rainbow'),402);rejected(()=>r.buy(room,a,'hat','x'),400);rejected(()=>r.buy(room,a,'gift','ghost'),400);
  r.buy(room,a,'frame','silver');rejected(()=>r.buy(room,a,'frame','silver'),409);
  assert.equal(r.view(room,a).me.wallet.wp,r.START_WP-15);assert.equal(r.view(room,b).players.find(p=>p.id===a.id).frame,'silver');
  r.wear(room,a,'');assert.equal(r.view(room,b).players.find(p=>p.id===a.id).frame,'');rejected(()=>r.wear(room,a,'gold'),403);
  rejected(()=>r.throwGift(room,a,'tomato',b.id,5000),403);
  r.buy(room,a,'gift','tomato');assert.equal(r.view(room,a).me.wallet.gifts.tomato,3);
  rejected(()=>r.throwGift(room,a,'tomato',a.id,5000),400);
  assert.equal(r.throwGift(room,a,'tomato',b.id,5000),true);assert.equal(r.throwGift(room,a,'tomato',b.id,5500),false);
  assert.equal(r.view(room,c).gifts[0].to,b.id);assert.equal(r.view(room,a).me.wallet.gifts.tomato,2);
  // A speaker's first five seconds are protected.
  room.phase='discussion';room.speakingOrder=[b.id];room.speakerIndex=0;room.duration=20;room.deadline=Date.now()+18000;
  rejected(()=>r.throwGift(room,a,'tomato',b.id,Date.now()),409);room.deadline=Date.now()+10000;assert.equal(r.throwGift(room,a,'tomato',b.id,Date.now()),true);
  // Suspect pins are public counts only, and reset each night.
  room.phase='voting';r.suspect(room,a,bad.id);r.suspect(room,b,bad.id);rejected(()=>r.suspect(room,c,c.id),400);
  const pinned=r.view(room,c);assert.equal(pinned.players.find(p=>p.id===bad.id).pins,2);assert.equal(pinned.me.suspect,null);assert.equal(r.view(room,a).me.suspect,bad.id);
  assert.ok(!JSON.stringify(pinned).includes('"suspects"'));
  r.suspect(room,a,null);assert.equal(r.view(room,c).players.find(p=>p.id===bad.id).pins,1);
  r.beginNight(room);assert.deepEqual(room.suspects,{});
  // Vote WP, last words and the longer result screen.
  room.phase='voting';room.electorate=r.alive(room).map(p=>p.id);room.votes={};room.voteAttempt=1;
  for(const p of r.alive(room))room.votes[p.id]={targetId:p.id===bad.id?a.id:bad.id,weight:1};
  const before=r.balance(room,b);r.resolveVote(room);
  assert.equal(room.phase,'voteResult');assert.equal(room.duration,20);assert.equal(r.balance(room,b),before+5);
  rejected(()=>r.lastWords(room,a,'Not me'),403);r.lastWords(room,bad,'  You will regret this  ');rejected(()=>r.lastWords(room,bad,'Again'),409);
  assert.equal(r.view(room,a).history.at(-1).lastWords.text,'You will regret this');
  assert.ok(r.view(room,b).history.at(-1).votes.length>0);
  // Finishing pays the winners, survivors and awards, and keeps a session tally.
  room.winner='good';r.finish(room);assert.equal(room.phase,'finished');
  const v=r.view(room,b);assert.ok(v.me.wallet.earnings.some(e=>e.reason==='Your team won'&&e.n===20));
  assert.ok(v.awards.eye.includes(b.id));assert.equal(v.session[b.id].wins,1);assert.equal(v.session[bad.id].wins,0);
  // Speaking time setting
  room.settings.speakSeconds=45;r.beginDiscussion(room);assert.equal(room.duration,45);
}
function engineTests() {
  const counts = [[3,1,1],[2,2,2],[3,2,2],[4,2,2],[4,3,2],[4,3,3],[5,3,3],[6,3,3]];
  for(let n=5;n<=12;n++){
    const roles=r.plan(n);assert.equal(roles.length,n);assert.ok(roles.includes('witness'));
    assert.deepEqual(['passenger','crew','saboteur'].map(g=>roles.filter(role=>r.ROLES[role].group===g).length),counts[n-5]);
    assert.equal(roles.includes('trainee'),n>=9);assert.equal(roles.includes('blocker'),n===12);
  }
  assert.deepEqual(r.plan(4),[]);assert.deepEqual(r.plan(13),[]);assert.ok(r.plan(12,{extra:'speaker',blocker:false}).includes('speaker'));
  // Starting thresholds and the real deal agree at every supported player count.
  for(let n=5;n<=12;n++){
    const room={players:Array.from({length:n},(_,i)=>({id:'p'+i,name:'Player '+i})),settings:{discussion:'chat'}};
    r.start(room);assert.equal(room.players.length,n);assert.ok(room.players.every(p=>p.role));
    const view=r.view(room,room.players[0]);assert.deepEqual(['passenger','crew','saboteur'].map(g=>view.counts[g]),counts[n-5]);
    assert.equal(view.mix.reduce((total,m)=>total+m.count,0),n);assert.equal(view.me.role,null);
  }
  for(const n of [4,13])rejected(()=>r.start({players:Array.from({length:n},(_,i)=>({id:'p'+i})),settings:{}}),409);
  // An already-dealt six-player game retains its original mix until replay.
  {
    const room=fixture(['careful','witness','passenger','inspector','medic','saboteur']);
    assert.equal(r.view(room,room.players[0]).mix.find(m=>m.role==='saboteur').count,1);
    r.start(room);assert.equal(r.view(room,room.players[0]).mix.find(m=>m.role==='saboteur').count,2);
  }
  // Every new journey asks for fresh shuffle entropy; refreshing the same match preserves the deal.
  {
    const room={players:Array.from({length:6},(_,i)=>({id:'p'+i,name:'Player '+i})),settings:{discussion:'chat'}};
    const original=crypto.randomInt;let calls=0;
    try {
      crypto.randomInt=limit=>{calls++;return limit-1;};r.start(room);const first=room.players.map(p=>p.role);
      assert.equal(calls,10);assert.equal(room.match,1);assert.deepEqual(room.players.map(p=>p.id),['p0','p1','p2','p3','p4','p5']);
      for(const p of room.players)r.view(room,p);assert.equal(calls,10);assert.deepEqual(room.players.map(p=>p.role),first);
      crypto.randomInt=()=>{calls++;return 0;};r.start(room);
      assert.equal(calls,20);assert.equal(room.match,2);assert.notDeepEqual(room.players.map(p=>p.role),first);
      assert.deepEqual(room.players.map(p=>p.role).sort(),first.sort());
    }finally{crypto.randomInt=original;}
  }
  // Custom mixes allow all normal Passengers, one special Saboteur at most, and more Passengers than Crew except the six-player 2/2 split.
  for(let n=5;n<=12;n++){
    const slots=r.teamSlots(n),roles={crew:['medic'],passengers:[],saboteur:n===5?'normal':'blocker'};
    r.validateLoadout(n,roles);const mix=r.plan(n,{roles});assert.equal(mix.length,n);assert.equal(mix.filter(k=>k==='passenger').length,slots.good-1);
    assert.equal(mix.filter(k=>k==='blocker').length,n===5?0:1);
    for(let i=0;i<20;i++){const chosen=r.randomLoadout(n);r.validateLoadout(n,chosen);const mix=r.plan(n,{roles:chosen});assert.equal(mix.length,n);const passengers=mix.filter(k=>r.ROLES[k].group==='passenger').length;assert.ok(n===6?passengers>=chosen.crew.length:passengers>chosen.crew.length);}
  }
  r.validateLoadout(6,{crew:['inspector','medic'],passengers:[],saboteur:'normal'});
  rejected(()=>r.validateLoadout(6,{crew:['inspector','medic','trainee'],passengers:[],saboteur:'normal'}),400);
  rejected(()=>r.validateLoadout(5,{crew:['inspector','medic'],passengers:[],saboteur:'normal'}),400);
  rejected(()=>r.validateLoadout(7,{crew:['trainee'],passengers:[],saboteur:'normal'}),400);
  rejected(()=>r.validateLoadout(7,{crew:['medic','medic'],passengers:[],saboteur:'normal'}),400);
  rejected(()=>r.validateLoadout(5,{crew:['medic'],passengers:[],saboteur:'blocker'}),400);
  // Letters are private to sender and recipient, never public history, and stay in the letterbox once read.
  {
    const room=fixture(),[sender,recipient,other]=room.players;
    r.sendLetter(room,sender,recipient.id,'Meet me near cabin 4.');
    const id=r.view(room,recipient).me.letters[0].id;
    assert.equal(r.view(room,recipient).me.letters[0].text,'Meet me near cabin 4.');
    assert.equal(r.view(room,recipient).me.letters[0].read,false);
    assert.equal(r.view(room,sender).me.letters[0].to,recipient.id);assert.equal(r.view(room,sender).me.letters[0].read,true);
    assert.deepEqual(r.view(room,other).me.letters,[]);assert.ok(!JSON.stringify(r.view(room,other)).includes('Meet me near cabin 4.'));
    r.dismissLetters(room,other,[id]);assert.equal(room.letters[0].read,false);
    r.dismissLetters(room,recipient,[id]);assert.equal(room.letters.length,1);assert.equal(r.view(room,recipient).me.letters[0].read,true);
    r.dismissLetters(room,recipient,[id]);assert.equal(room.letters.length,1);
    rejected(()=>r.sendLetter(room,sender,sender.id,'Self'),400);
    rejected(()=>r.sendLetter(room,sender,'not-here','No'),400);
    rejected(()=>r.sendLetter(room,sender,recipient.id,' '.repeat(20)),400);
    rejected(()=>r.sendLetter(room,sender,recipient.id,'x'.repeat(501)),400);
    rejected(()=>r.dismissLetters(room,recipient,'all'),400);
    sender.alive=false;rejected(()=>r.sendLetter(room,sender,recipient.id,'A clue from beyond'),403);
    rejected(()=>r.sendLetter(room,recipient,sender.id,'A clue'),403);
    other.alive=false;r.sendLetter(room,sender,other.id,'We can watch together.');
    const kept=room.letters.length;room.players.forEach(p=>{p.alive=true;p.departed=false;});r.start(room);assert.equal(room.letters.length,kept);
  }
  {
    const room=fixture(),[sender,recipient]=room.players;
    for(let i=0;i<8;i++)r.sendLetter(room,sender,recipient.id,'Letter '+i);
    rejected(()=>r.sendLetter(room,sender,recipient.id,'Too fast'),429);
  }
  // Closed roles remain private in every public path, including history and group counts.
  {
    const room=fixture(),before=r.view(room,room.players[0]).counts;
    const outs=r.remove(room,[person(room,'medic').id,person(room,'witness').id,person(room,'saboteur').id]);room.history.push({round:1,type:'night',outs});
    for(const p of room.players){const view=r.view(room,p);assert.ok(view.players.filter(q=>!q.alive).every(q=>!('role' in q)&&!('group' in q)&&['good','bad'].includes(q.alignment)));assert.ok(view.history[0].outs.every(q=>!('role' in q)&&!('group' in q)));assert.deepEqual(view.counts,before);}
    room.phase='finished';assert.ok(r.view(room,room.players[0]).players.every(p=>p.role));assert.ok(r.view(room,room.players[0]).history[0].outs.every(p=>p.role));
  }
  // Careful locks first; the full night still resolves together, including a later Blocker.
  for(const blocked of [false,true]){
    const room=fixture();room.nightOrder=[...r.NIGHT];const c=person(room,'careful'),b=person(room,'blocker');assert.equal(r.nightRole(room),'careful');r.nightChoice(room,c,{power:'lock'});r.advance(room);assert.equal(r.nightRole(room),'saboteur');attack(room,c.id);if(blocked)r.nightChoice(room,b,{power:'block',targetId:c.id,attackId:c.id});morning(room);assert.equal(c.alive,!blocked);
  }
  // Opening sequence keeps identities sealed until the cabin. Seats are a separate fixed shuffle.
  {
    const room={players:Array.from({length:12},(_,i)=>({id:'p'+i,name:'Player '+i})),settings:{discussion:'chat'}};
    r.start(room);assert.equal(room.phase,'briefing');assert.equal(room.duration,20);assert.equal(new Set(room.seatOrder).size,12);
    for(const p of room.players){const v=r.view(room,p);assert.equal(v.me.role,null);assert.ok(!('allies' in v.me));assert.ok(v.players.every(q=>!q.role));}
    const seats=[...room.seatOrder];r.advance(room);assert.equal(room.phase,'boarding');assert.equal(r.view(room,room.players[0]).me.role,null);
    r.advance(room);assert.equal(room.phase,'settling');assert.ok(r.view(room,room.players[0]).me.role);r.advance(room);
    for(const role of r.SHARED_NIGHT){assert.equal(r.nightRole(room),role);assert.equal(room.duration,25);r.advance(room);}
    assert.equal(room.phase,'gathering');r.advance(room);r.advance(room);assert.equal(room.phase,'discussion');assert.deepEqual(room.speakingOrder,seats);
    for(const id of seats){assert.equal(r.speakerId(room),id);assert.equal(room.duration,20);r.advance(room);}
    assert.equal(room.phase,'voting');r.resolveVote(room);assert.equal(room.phase,'voteResult');r.advance(room);assert.equal(room.phase,'settling');assert.deepEqual(room.seatOrder,seats);
  }
  // Self and teammate attacks, editable proposals, real stage validation, one shared attack.
  for(const targetIndex of [0,1]){
    const room=fixture(),bad=room.players.filter(p=>r.group(p)==='saboteur'),w=person(room,'witness'),m=person(room,'medic'),target=bad[targetIndex];
    r.nightChoice(room,bad[0],{attackId:w.id});r.nightChoice(room,bad[0],{attackId:target.id});attack(room,target.id);
    rejected(()=>r.nightChoice(room,w,{power:'watch'}),403);assert.equal(room.phase,'night');assert.equal(r.nightRole(room),'saboteur');
    turn(room,'medic');assert.equal(room.night.attackId,target.id);assert.equal(r.view(room,m).me.patientId,target.id);
    r.medicineChoice(room,m,{power:'heal'});assert.equal(r.nightRole(room),'medic');rejected(()=>r.medicineChoice(room,m,{power:'poison',targetId:bad[2].id}),409);
    turn(room,'witness');r.nightChoice(room,w,{power:'watch'});morning(room);assert.equal(target.alive,true);assert.equal(w.reports[0].targetId,target.id);assert.equal(room.medicine.heal,0);
    r.beginNight(room);r.advance(room);attack(room,target.id);turn(room,'medic');rejected(()=>r.medicineChoice(room,m,{power:'heal'}),409);r.medicineChoice(room,m,{power:'poison',targetId:bad[2].id});morning(room);
    assert.equal(target.alive,false);assert.equal(bad[2].alive,false);assert.equal(room.medicine.poison,0);
    r.beginNight(room);r.advance(room);turn(room,'medic');rejected(()=>r.medicineChoice(room,m,{power:'poison',targetId:w.id}),409);
  }
  // Only actual attack targets count. Missing choices and Skip never cancel one.
  {
    const room=fixture(),bad=room.players.filter(p=>r.group(p)==='saboteur');
    r.nightChoice(room,bad[0],{attackId:bad[0].id});r.nightChoice(room,bad[1],{attackId:bad[1].id});
    const original=crypto.randomInt;
    try{for(const [index,expected] of [bad[0].id,bad[1].id].entries()){crypto.randomInt=()=>index;r.settleAttack(room);assert.equal(room.night.attackId,expected);}}finally{crypto.randomInt=original;}
    r.nightChoice(room,bad[2],{attackId:bad[0].id});r.settleAttack(room);assert.equal(room.night.attackId,bad[0].id);
    const skipped=fixture();r.settleAttack(skipped);assert.equal(skipped.night.attackId,null);
    const solo=fixture(r.plan(6)),team=solo.players.filter(p=>r.group(p)==='saboteur'),target=person(solo,'witness');
    r.nightChoice(solo,team[0],{attackId:target.id});r.settleAttack(solo);assert.equal(solo.night.attackId,target.id);
    r.nightChoice(solo,team[1],{attackId:null});r.settleAttack(solo);assert.equal(solo.night.attackId,target.id);
    morning(solo);assert.equal(target.alive,false);
  }
  // Brave now shields, never redirects. Heal + shield kills the original target by overdose.
  for(const healed of [false,true]){
    const room=fixture(),b=person(room,'brave'),w=person(room,'witness'),m=person(room,'medic');attack(room,w.id);
    turn(room,'medic');if(healed)r.medicineChoice(room,m,{power:'heal'});turn(room,'brave');r.nightChoice(room,b,{power:'cover',targetId:w.id});morning(room);
    assert.equal(w.alive,!healed);assert.equal(b.alive,true);assert.equal(b.used.cover,true);
  }
  // Poison bypasses both a door and a shield. A locked door does not prevent overdose.
  {
    const room=fixture(),c=person(room,'careful'),b=person(room,'brave'),m=person(room,'medic');attack(room,c.id);turn(room,'medic');r.medicineChoice(room,m,{power:'poison',targetId:c.id});
    turn(room,'brave');r.nightChoice(room,b,{power:'cover',targetId:c.id});turn(room,'careful');r.nightChoice(room,c,{power:'lock'});morning(room);assert.equal(c.alive,false);assert.equal(b.alive,true);
  }
  {
    const room=fixture(),c=person(room,'careful'),b=person(room,'brave'),m=person(room,'medic');attack(room,c.id);turn(room,'medic');r.medicineChoice(room,m,{power:'heal'});
    turn(room,'brave');r.nightChoice(room,b,{power:'cover',targetId:c.id});turn(room,'careful');r.nightChoice(room,c,{power:'lock'});morning(room);assert.equal(c.alive,false);
  }
  for(const blockedRole of ['medic','brave','careful','inspector','witness']){
    const room=fixture(),block=person(room,'blocker'),p=person(room,blockedRole),victim=person(room,'passenger');
    attack(room,blockedRole==='careful'?p.id:victim.id);
    r.nightChoice(room,block,{power:'block',targetId:p.id,attackId:blockedRole==='careful'?p.id:victim.id});r.nightChoice(room,block,{attackId:blockedRole==='careful'?p.id:victim.id});assert.equal(room.night.blockedId,p.id,'changing attack preserves block');
    turn(room,blockedRole);
    if(blockedRole==='medic'){assert.equal(r.view(room,p).me.patientId,null);rejected(()=>r.medicineChoice(room,p,{power:'heal'}),409);assert.deepEqual(room.medicine,{heal:1,poison:1});}
    else r.nightChoice(room,p,{power:{brave:'cover',careful:'lock',inspector:'check',witness:'watch'}[blockedRole],...(['brave','inspector'].includes(blockedRole)?{targetId:victim.id}:{})});
    morning(room);if(blockedRole==='brave')assert.equal(victim.alive,false);if(blockedRole==='careful')assert.equal(p.alive,false);
    if(['witness','inspector'].includes(blockedRole)){assert.equal(p.reports[0].type,blockedRole==='witness'?'watch-blocked':'check-blocked');assert.ok(!('targetId' in p.reports[0]));}
    r.beginNight(room);r.advance(room);rejected(()=>r.nightChoice(room,block,{power:'block',targetId:victim.id}),409);
  }
  // Medic poison survives their death; Trainee gets remaining supplies, never a refill.
  {
    const room=fixture(),m=person(room,'medic'),t=person(room,'trainee'),bad=person(room,'saboteur');room.medicine.heal=0;attack(room,m.id);turn(room,'medic');r.medicineChoice(room,m,{power:'poison',targetId:bad.id});morning(room);
    assert.equal(m.alive,false);assert.equal(bad.alive,false);assert.equal(t.role,'medic');assert.deepEqual(room.medicine,{heal:0,poison:0});assert.ok(!('medicine' in r.view(room,m).me));
  }
  {
    const room=fixture(),m=person(room,'medic'),ins=person(room,'inspector'),t=person(room,'trainee');r.remove(room,[m.id,ins.id]);assert.equal(t.role,'inspector');assert.equal(t.reports.length,1);
  }
  {
    const room=fixture(['passenger','careful','witness','medic','saboteur']),m=person(room,'medic'),bad=person(room,'saboteur');attack(room,m.id);turn(room,'medic');r.medicineChoice(room,m,{power:'poison',targetId:bad.id});morning(room);assert.equal(room.winner,'good');r.advance(room);assert.equal(room.phase,'finished');
  }
  for(const g of ['passenger','crew']){const room=fixture();r.remove(room,room.players.filter(p=>r.group(p)===g).map(p=>p.id));assert.equal(room.winner,'bad');}
  // Private truthful reports appear before night resolution; no new power in a promotion night.
  for(const dies of [true,false]){
    const room=fixture(),w=person(room,'witness'),ins=person(room,'inspector'),bad=person(room,'saboteur');attack(room,dies?ins.id:bad.id);turn(room,'inspector');r.nightChoice(room,ins,{power:'check',targetId:bad.id});turn(room,'witness');r.nightChoice(room,w,{power:'watch'});morning(room);
    assert.equal(ins.reports.length,1);assert.equal(ins.reports[0].alignment,'bad');assert.equal(w.reports[0].targetId,dies?ins.id:bad.id);
  }
  // Statements enforce seat order and one statement per 20-second turn, even for host.
  {
    const room=fixture(undefined,'chat');morning(room);r.advance(room);const order=[...room.speakingOrder],first=room.players.find(p=>p.id===order[0]),other=room.players.find(p=>p.id!==first.id);
    rejected(()=>r.speak(room,other,'My claim'),403);r.speak(room,first,'  I saw   the target.  ');assert.equal(room.speeches[0].text,'I saw the target.');rejected(()=>r.speak(room,first,'Another message'),409);rejected(()=>r.finishSpeech(room,first),403);
    assert.equal(r.speakerId(room),order[1],'sharing hands the floor to the next player immediately');
    for(const id of order.slice(1)){assert.equal(r.speakerId(room),id);r.speak(room,room.players.find(p=>p.id===id),'My turn is complete.');}assert.equal(room.phase,'voting');assert.deepEqual(room.seatOrder,order);
  }
  // Private team chat rejects outsiders and stops being delivered after the Saboteur turn or death.
  {
    const room=fixture(),bad=person(room,'saboteur'),w=person(room,'witness');r.whisper(room,bad,'Choose seat two.');assert.equal(r.view(room,bad).me.whispers.length,1);assert.ok(!('whispers' in r.view(room,w).me));rejected(()=>r.whisper(room,w,'I can see you'),403);
    turn(room,'medic');assert.ok(!('whispers' in r.view(room,bad).me));rejected(()=>r.whisper(room,bad,'Too late'),403);r.remove(room,[bad.id]);r.beginNight(room);r.advance(room);assert.ok(!('teamChoices' in r.view(room,bad).me));
  }
  for(const kind of ['skip','missing']){
    const room=fixture();r.beginVote(room);
    if(kind==='skip')for(const id of room.electorate)room.votes[id]={targetId:null,weight:1};
    r.resolveVote(room);assert.equal(room.phase,'voteResult');assert.equal(room.history[0].reason,'skip');assert.equal(room.history[0].outs.length,0);
  }
  // One player vote beats every abstention, including when the other ballots time out.
  for(const explicit of [true,false]){
    const room=fixture(r.plan(6));r.beginVote(room);const target=person(room,'saboteur');
    if(explicit)for(const id of room.electorate)room.votes[id]={targetId:null,weight:1};
    room.votes[room.electorate[0]]={targetId:target.id,weight:1};r.resolveVote(room);
    assert.equal(target.alive,false);assert.equal(room.history[0].outs[0].id,target.id);assert.equal(room.voteAttempt,1);
  }
  // A first tie resets every ballot and fences late requests. Only tied players can receive runoff votes.
  for(const outcome of ['decided','tied','all-skip']){
    const room=fixture(),targets=room.players.filter(p=>r.group(p)==='saboteur').slice(0,2);r.beginVote(room);const step=room.step;
    room.electorate.forEach((id,i)=>room.votes[id]={targetId:targets[i%2].id,weight:1});r.resolveVote(room);
    assert.equal(room.phase,'revoteInfo');assert.equal(room.duration,7);assert.equal(room.voteAttempt,2);assert.equal(room.step,step+1);assert.deepEqual(room.votes,{});
    assert.deepEqual(room.voteCandidates,targets.map(p=>p.id));assert.equal(room.history[0].reason,'revote');assert.ok(targets.every(p=>p.alive));
    assert.equal(r.view(room,targets[0]).voteAttempt,2);assert.equal(r.view(room,targets[0]).me.vote,null);
    rejected(()=>r.vote(room,room.players[0],{targetId:targets[0].id}),409);r.advance(room);assert.equal(room.phase,'voting');assert.equal(room.duration,45);
    rejected(()=>r.vote(room,room.players[0],{targetId:person(room,'witness').id}),400);
    room.electorate.forEach((id,i)=>room.votes[id]={targetId:outcome==='all-skip'?null:targets[outcome==='decided'?0:i%2].id,weight:1});
    const original=crypto.randomInt;try{crypto.randomInt=()=>1;r.resolveVote(room);}finally{crypto.randomInt=original;}
    assert.equal(room.phase,'voteResult');assert.equal(room.history.length,2);assert.equal(room.history[1].attempt,2);
    assert.equal(room.history[1].reason,outcome==='decided'?'voted':'random');assert.equal(room.history[1].outs[0].id,targets[outcome==='decided'?0:1].id);
    r.advance(room);assert.equal(room.phase,'settling');assert.equal(room.voteAttempt,1);assert.equal(room.voteCandidates,null);
  }
  {
    const room=fixture(r.plan(12,{extra:'speaker'})),s=person(room,'speaker'),bad=person(room,'saboteur');r.beginVote(room);const others=room.players.filter(p=>p.id!==s.id);others.forEach((p,i)=>room.votes[p.id]={targetId:i<5?bad.id:null,weight:1});r.vote(room,s,{targetId:bad.id,doubled:true});assert.equal(bad.alive,false);assert.equal(s.used.double,true);assert.equal(room.history[0].votes.find(v=>v.id===s.id).weight,2);
    r.beginVote(room);rejected(()=>r.vote(room,s,{targetId:room.players[0].id,doubled:true}),403);
  }
}
(async()=>{
  engineTests();sharedNightTests();socialTests();const redis=process.argv.includes('--redis')?await startRedis():null;
  try{
    if(redis){process.env.UPSTASH_REDIS_REST_URL=redis.url;process.env.UPSTASH_REDIS_REST_TOKEN='test';}
    const handler=require('../api/last-train');assert.equal((await call(handler,'null')).s,400);
    const enter=(action,data)=>call(handler,{action,requestId:uuid(),...data});
    const host=(await enter('create',{name:'Host'})).j,joined=await Promise.all(Array.from({length:11},(_,i)=>enter('join',{code:host.code,name:'Guest '+i})));
    assert.ok(joined.every(v=>v.s===200));const seats=[host,...joined.map(v=>v.j)];
    const get=s=>call(handler,null,{code:s.code,pid:s.meId},{'x-tok':s.tok});
    const post=async(s,action,extra={})=>{const v=(await get(s)).j;return call(handler,{action,requestId:uuid(),code:s.code,pid:s.meId,tok:s.tok,match:v.match,round:v.round,step:v.step,...extra});};
    const raw=async()=>redis?JSON.parse(await redis.client.get('last-train:room:'+host.code)):structuredClone(globalThis.__lastTrainRooms.get(host.code));
    const save=async room=>redis?redis.client.set('last-train:room:'+host.code,JSON.stringify(room)):globalThis.__lastTrainRooms.set(host.code,structuredClone(room));
    const expire=async()=>{const room=await raw();room.deadline=Date.now()-1;await save(room);return (await get(host)).j;};
    const custom={crew:['medic'],passengers:[],saboteur:'normal'};
    // Authenticated, idempotent delivery and recipient-only removal survive ordinary phase changes.
    const mailView=(await get(host)).j,mailReq={action:'letter',code:host.code,pid:host.meId,tok:host.tok,requestId:uuid(),match:mailView.match,round:mailView.round,step:mailView.step,targetId:seats[1].meId,text:'Private API letter.'};
    assert.equal((await call(handler,mailReq)).s,200);assert.equal((await call(handler,mailReq)).s,200);
    const inbox=(await get(seats[1])).j.me.letters;assert.equal(inbox.length,1);assert.equal(inbox[0].text,'Private API letter.');
    assert.equal((await get(host)).j.me.letters[0].to,seats[1].meId);assert.deepEqual((await get(seats[2])).j.me.letters,[]);
    assert.equal((await post(seats[2],'dismissLetters',{letterIds:[inbox[0].id]})).s,200);assert.equal((await get(seats[1])).j.me.letters[0].read,false);
    assert.equal((await post(seats[1],'dismissLetters',{letterIds:[inbox[0].id],round:-1,step:-1})).s,200);assert.equal((await get(seats[1])).j.me.letters[0].read,true);
    assert.equal((await post(host,'letter',{targetId:seats[1].meId,text:'Old journey',match:99})).s,409);
    assert.equal((await call(handler,{...mailReq,requestId:uuid(),tok:'wrong-token'})).s,401);
    // Reactions and the shop are not turn actions: a stale step never rejects them.
    assert.equal((await post(seats[1],'emote',{e:'laugh',step:-5})).s,200);assert.equal((await get(host)).j.emotes.at(-1).e,'laugh');
    assert.equal((await post(seats[1],'emote',{e:'trophy'})).s,400);
    assert.equal((await post(seats[1],'buy',{kind:'frame',key:'gold',step:-5})).s,200);assert.equal((await get(host)).j.players.find(p=>p.id===seats[1].meId).frame,'gold');
    assert.equal((await post(seats[1],'buy',{kind:'frame',key:'rainbow'})).s,402);
    assert.equal((await post(seats[1],'shuffleRoles')).s,403);
    assert.equal((await post(host,'settings',{extra:'brave',blocker:true,discussion:'chat',roles:{crew:['trainee'],passengers:[],saboteur:'normal'}})).s,400);
    assert.equal((await post(host,'settings',{extra:'brave',blocker:true,discussion:'chat',roles:custom})).s,200);
    assert.equal((await get(host)).j.mix.find(m=>m.role==='passenger').count,8);
    const shuffleView=(await get(host)).j,shuffleReq={action:'shuffleRoles',code:host.code,pid:host.meId,tok:host.tok,requestId:uuid(),match:shuffleView.match,round:shuffleView.round,step:shuffleView.step};
    const shuffled=await call(handler,shuffleReq);assert.equal(shuffled.s,200);assert.deepEqual((await call(handler,shuffleReq)).j.settings.roles,shuffled.j.settings.roles);
    assert.equal((await post(host,'settings',{extra:'brave',blocker:true,discussion:'chat',roles:null})).s,200);
    assert.equal((await post(seats[1],'settings',{extra:'brave',blocker:true,discussion:'chat'})).s,403);
    assert.equal((await post(host,'settings',{extra:'brave',blocker:true,discussion:'chat'})).s,200);assert.equal((await post(host,'start')).j.phase,'briefing');
    for(const s of seats){const v=(await get(s)).j;assert.equal(v.me.role,null);assert.ok(v.players.every(p=>!p.role));}
    assert.equal((await enter('join',{code:host.code,name:'Late'})).s,409);
    const ready=await Promise.all(seats.map(s=>post(s,'ready')));assert.ok(ready.every(v=>v.s===200));assert.equal((await get(host)).j.phase,'boarding');await expire();assert.equal((await get(host)).j.phase,'settling');await expire();
    assert.equal((await get(host)).j.nightPhase,1);assert.equal((await get(host)).j.duration,25);
    const views=(await Promise.all(seats.map(get))).map(v=>v.j);assert.equal(new Set(views[0].players.map(p=>p.avatarIndex)).size,12,'neutral human portraits are unique and independent of roles');const bad=views.filter(v=>v.me.group==='saboteur'),w=views.find(v=>v.me.role==='witness'),m=views.find(v=>v.me.role==='medic'),ins=views.find(v=>v.me.role==='inspector');
    const seatFor=v=>seats.find(s=>s.meId===v.meId);
    for(const v of views){assert.ok(v.players.every(p=>!('role' in p)&&!('group' in p)&&!('tokenHash' in p)));assert.equal('allies' in v.me,v.me.group==='saboteur');assert.ok(!('night' in v)&&!('receipts' in v));}
    const fence=(await get(host)).j;await post(host,'pause');assert.equal((await post(seatFor(bad[0]),'night',{attackId:bad[0].meId})).s,409);await post(host,'resume');
    assert.equal((await post(host,'advance')).s,409,'host cannot shorten private turns');assert.equal((await post(seatFor(w),'night',{power:'watch'})).s,403);
    const picks=await Promise.all(bad.map(v=>post(seatFor(v),'night',{attackId:bad[0].meId})));assert.ok(picks.every(v=>v.s===200));assert.equal((await get(host)).j.nightPhase,1);
    const whisperReq={action:'whisper',code:host.code,pid:bad[0].meId,tok:seatFor(bad[0]).tok,requestId:uuid(),match:fence.match,round:fence.round,step:(await get(host)).j.step,text:'Same target, team.'};
    assert.equal((await call(handler,whisperReq)).s,200);assert.equal((await call(handler,whisperReq)).s,200);assert.equal((await get(seatFor(bad[1]))).j.me.whispers.length,1);assert.ok(!('whispers' in (await get(seatFor(w))).j.me));
    await expire();assert.equal((await get(host)).j.nightPhase,2);assert.equal((await get(seatFor(m))).j.me.patientId,bad[0].meId);
    const medView=(await get(host)).j,medReq={action:'medicine',code:host.code,pid:m.meId,tok:seatFor(m).tok,requestId:uuid(),match:medView.match,round:medView.round,step:medView.step,power:'poison',targetId:bad[1].meId};
    assert.equal((await call(handler,medReq)).s,200);assert.equal((await call(handler,medReq)).s,200);assert.equal((await post(seatFor(m),'medicine',{power:'heal'})).s,409);
    await post(seatFor(ins),'night',{power:'check',targetId:bad[2].meId});await post(seatFor(w),'night',{power:'watch'});await expire();await expire();
    const morningView=(await get(host)).j;assert.equal(morningView.phase,'morning');assert.equal(morningView.history[0].outs.length,2);assert.equal((await get(seatFor(w))).j.me.reports[0].targetId,bad[0].meId);
    assert.equal((await get(seatFor(ins))).j.me.reports[0].alignment,'bad');assert.equal((await call(handler,medReq)).s,200,'replay after a phase change remains idempotent');
    await expire();let speaking=(await get(host)).j;assert.equal(speaking.phase,'discussion');assert.equal((await post(host,'advance')).s,409,'cannot cut the ordered speaking round');
    const order=[...speaking.speakingOrder];assert.equal(order.length,10);
    for(const pid of order){
      const s=seats.find(s=>s.meId===pid);assert.equal((await get(s)).j.speakerId,pid);
      assert.equal((await post(s,'speak',{text:'I think the last Saboteur is still hiding.'})).s,200);assert.equal((await post(s,'speak',{text:'Again'})).s,409);
    }
    const voting=(await get(host)).j;assert.equal(voting.phase,'voting');assert.equal(voting.speeches.length,10);
    const living=seats.filter(s=>order.includes(s.meId));const voted=await Promise.all(living.map(s=>post(s,'vote',{targetId:bad[2].meId})));assert.ok(voted.every(v=>v.s===200));
    const result=(await get(host)).j;assert.equal(result.phase,'voteResult');assert.equal(result.history[1].outs[0].alignment,'bad');assert.equal(result.history[1].votes.length,10);assert.ok(result.players.filter(p=>p.alive).every(p=>!p.role));
    const done=await expire();assert.equal(done.phase,'finished');assert.equal(done.winner,'good');assert.ok(done.players.every(p=>p.role));
    const recoverBody={action:'join',code:host.code,name:'Host',recoveryCode:done.me.recoveryCode,requestId:uuid()},back=await call(handler,recoverBody);
    assert.equal(back.s,200);assert.deepEqual(back.j.players.map(p=>p.avatarIndex),done.players.map(p=>p.avatarIndex));assert.equal((await get(host)).s,401);assert.equal((await call(handler,recoverBody)).j.tok,back.j.tok);
    const fresh=back.j;await post(fresh,'start');await expire();await expire();await expire();
    const before=(await get(fresh)).j,left=(await post(fresh,'leave')).j;assert.notEqual(left.hostId,fresh.meId);assert.deepEqual(left.counts,before.counts);assert.equal(left.me.alive,true);
    const returned=await enter('join',{code:host.code,name:'Host',recoveryCode:left.me.recoveryCode});assert.equal(returned.j.me.alive,true);assert.equal(returned.j.me.departed,false);
    // Old local seats survive the journey upgrade, but obsolete simultaneous-night matches reset safely.
    const old=await raw();delete old.rulesVersion;old.phase='quiet';await save(old);const upgrade=(await get(returned.j)).j;assert.equal(upgrade.phase,'lobby');assert.equal(upgrade.me.role,null);assert.ok(upgrade.notice);
    if(redis){assert.ok(await redis.client.ttl('last-train:room:'+host.code)>0);redis.fault.unavailable=true;assert.equal((await get(returned.j)).s,503);redis.fault.unavailable=false;}
    console.log('Last Train '+(redis?'Redis':'memory')+': cinematic phases, sealed introduction, fixed seats, two shared 25-second phases, legacy night compatibility and public death causes, editable self/team attacks, target abstentions, runoff votes, random second ties, overdose, medicine limits, private chat, reports, promotion, ordered speaking, voting, 12-player concurrency, recovery and migration passed');
  }finally{if(redis)await redis.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
