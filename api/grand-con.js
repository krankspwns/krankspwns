const crypto = require('node:crypto');
const store = require('../lib/grand-con-store');
const CASES = require('../lib/grand-con-cases');
const P = require('../lib/platform');
const social = require('../lib/table-social');
const need=(ok,status,message)=>{if(!ok)throw Object.assign(Error(message),{status});};
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const secret=()=>crypto.randomBytes(24).toString('base64url');
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const cleanName=name=>Array.from(String(name||'').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g,'').replace(/\s+/g,' ').trim()).slice(0,12).join('');
const recovery=(room,p)=>crypto.createHmac('sha256',p.tokenHash).update('grand-con:'+room.code+':'+p.id).digest('base64url').slice(0,24);
const equal=(a,b)=>{const x=Buffer.from(hash(a)),y=Buffer.from(hash(b));return crypto.timingSafeEqual(x,y);};
const present=room=>room.players.filter(p=>!p.departed);
function player(name){const tok=secret();return {p:{id:crypto.randomUUID(),name,tokenHash:hash(tok)},tok};}
function migrate(room){
  if(room.rulesVersion===2)return false;
  room.rulesVersion=2;room.phase='lobby';room.match=room.match||0;room.lot=0;room.deadline=null;room.history=[];room.receipts=[];
  room.notice='The Grand Con has new rules. Everyone’s place is saved. The host can start a new Truth Team vs Lie Team game.';
  for(const p of room.players){delete p.team;delete p.coins;delete p.portfolio;delete p.used;delete p.hits;delete p.calls;}
  for(const key of ['lots','clues','actions','bids','rumors'])delete room[key];
  return true;
}
function beginLot(room){
  room.phase='forging';room.deadline=Date.now()+30000;room.votes={};room.electorate=[];room.extended=false;room.tamper=null;
  const lot=room.lots[room.lot],c=CASES.find(c=>c.id===lot.caseId),owners=shuffle(room.players.slice());
  const records=c.records.map(r=>({source:r.source,text:lot.genuine?r.genuine:r.forged,replacement:lot.genuine?r.oppositeGenuine:r.oppositeForged,question:r.question}));
  room.documents=records.slice(0,owners.length).map((d,i)=>({...d,ownerId:owners[i].id}));
  room.claims=[];
  const editors=present(room).filter(p=>p.team==='ring');room.forgerId=editors[room.lot%editors.length]?.id||null;
  if(!room.forgerId)sealForgery(room);
}
function start(room){
  room.players=present(room);need(room.players.length>=4,409,'You need at least 4 players to start.');
  const ringCount=Math.floor(room.players.length/3),teams=shuffle(room.players.map((_,i)=>i<ringCount?'ring':'house'));
  room.players.forEach((p,i)=>{p.team=teams[i];p.auditUsed=false;p.auditReport=null;});room.lots=shuffle(CASES.map(c=>({caseId:c.id,genuine:!!crypto.randomInt(2)})));
  room.match=(room.match||0)+1;room.lot=0;room.score={house:0,ring:0};room.history=[];room.notice=null;beginLot(room);
}
function sealForgery(room,targetId){
  const candidates=room.documents.filter(d=>d.replacement);
  const doc=candidates.find(d=>d.ownerId===targetId)||candidates[crypto.randomInt(candidates.length)];
  room.tamper={ownerId:doc.ownerId,source:doc.source,original:doc.text,altered:doc.replacement};
}
function deliver(room,targetId){
  if(!room.tamper)sealForgery(room,targetId);
  room.phase='discussion';room.discussionSeconds=room.settings?.discussionSeconds||Math.max(60,Math.min(120,present(room).length*10));room.deadline=Date.now()+room.discussionSeconds*1000;
}
function settle(room){
  const lot=room.lots[room.lot],c=CASES.find(c=>c.id===lot.caseId);
  const approvals=room.electorate.filter(id=>room.votes[id]==='approve').length,required=Math.floor(room.electorate.length/2)+1,approved=approvals>=required;
  const pointTo=approved===lot.genuine?'house':'ring';room.score[pointTo]++;
  room.history.push({number:room.lot+1,name:c.name,genuine:lot.genuine,explanation:lot.genuine?c.truth:c.fake,approved,approvals,required,electorate:room.electorate.length,pointTo,
    claims:(room.claims||[]).map(c=>({...c})),
    votes:room.electorate.map(id=>({id,choice:room.votes[id]||'missed'})),tamper:room.tamper,
    documents:room.documents.map(d=>({ownerId:d.ownerId,source:d.source,original:d.text,received:d.ownerId===room.tamper.ownerId?room.tamper.altered:d.text}))});
  room.phase='reveal';room.deadline=null;
}
function advance(room){
  if(room.phase==='forging')deliver(room);
  else if(room.phase==='discussion'){room.phase='voting';room.electorate=present(room).map(p=>p.id);room.deadline=Date.now()+30000;}
  else if(room.phase==='voting')settle(room);
}
function timed(room){if(room.deadline&&Date.now()>=room.deadline){advance(room);return true;}return false;}
function view(room,me){
  const finished=room.phase==='finished',lot=room.lots?.[room.lot],c=lot&&CASES.find(c=>c.id===lot.caseId),ring=me.team==='ring';
  const document=room.phase==='forging'?null:room.documents?.find(d=>d.ownerId===me.id);
  return {game:'grand-con',rulesVersion:2,code:room.code,version:room.version,phase:room.phase,match:room.match||0,lotNumber:room.lot+1,deadline:room.deadline,now:Date.now(),hostId:room.hostId,meId:me.id,notice:room.notice||null,settings:room.settings||{discussionSeconds:0},discussionSeconds:room.discussionSeconds||45,claims:room.phase==='forging'?[]:room.claims||[],
    lot:c?{art:c.art,name:c.name,claim:c.claim}:null,score:room.score||{house:0,ring:0},extended:!!room.extended,
    players:room.players.map(p=>({id:p.id,name:p.name,avatarIndex:room.players.indexOf(p),departed:!!p.departed,voteLocked:!!room.votes?.[p.id],...(finished?{team:p.team}:{})})),
    me:{team:me.team||null,auditUsed:!!me.auditUsed,auditReport:me.auditReport||null,document:document?{source:document.source,text:document.ownerId===room.tamper?.ownerId?room.tamper.altered:document.text,question:document.question}:null,vote:room.votes?.[me.id]||null,recoveryCode:recovery(room,me),
      ...(ring&&c?{ring:{allies:room.players.filter(p=>p.team==='ring').map(p=>p.id),forgerId:room.forgerId,genuine:lot.genuine,explanation:lot.genuine?c.truth:c.fake,tamper:room.tamper||null,
        ...(room.phase==='forging'?{options:room.documents.map(d=>({ownerId:d.ownerId,source:d.source,original:d.text,altered:d.replacement}))}:{})}}:{})},
    history:room.history||[],required:room.phase==='voting'?Math.floor(room.electorate.length/2)+1:null,
    winningTeam:room.score?.house===3?'house':room.score?.ring===3?'ring':null};
}
const respond=async(room,me,extra)=>({...view(room,me),...(await social.view(room,me)),...extra});
async function execute(req,body) {
  const action=req.method==='GET'?'state':body.action;
  need(['switchGame','state','create','join','start','advance','extend','forge','vote','next','leave','claim','audit','settings',...social.ACTIONS].includes(action),400,'Unknown action.');
  if(action==='create'){
    const name=cleanName(body.name);need(name,400,'Enter your name.');
    let code;for(let i=0;i<10;i++){code=Array.from({length:4},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(24)]).join('');if(!await store.load(code))break;code=null;}
    need(code,503,'Please try creating the room again.');
    const {p,tok}=player(name),room={code,version:0,hostId:p.id,rulesVersion:2,phase:'lobby',settings:{discussionSeconds:0},players:[p],lot:0,history:[]};await social.link(room,p,await P.identify(req));await store.save(room);return respond(room,p,{tok});
  }
  const code=String(body.code||'').toUpperCase();need(/^[A-Z]{4}$/.test(code),400,'Enter a four-letter room code.');
  const room=await store.load(code);need(room,404,'Room not found.');
  const switched = await require('../lib/room-switch').handle('grand-con', room, req, body); if (switched) return switched;
  const migrated=migrate(room);
  if(action==='join'){
    const name=cleanName(body.name);need(name,400,'Enter your name.');
    const uid=await P.identify(req),owned=uid&&room.players.find(p=>!p.bot&&social.accountOf(room,p.id)===uid);
    let p=owned||room.players.find(p=>p.name.toLowerCase()===name.toLowerCase());let tok;
    if(p){
      const replay=owned?P.seatToken(uid,'gc:'+code,p.id,body.requestId):body.requestId&&body.recoveryCode?crypto.createHmac('sha256',String(body.recoveryCode).trim()).update('gc:'+code+':'+p.id+':'+body.requestId).digest('base64url'):null;
      if(p.recoveryReceipt===body.requestId&&replay&&equal(p.tokenHash,hash(replay)))return respond(room,p,{tok:replay});
      need(owned||body.recoveryCode&&equal(recovery(room,p),String(body.recoveryCode).trim()),409,'That name is already in this room. Enter its rejoin code.');
      tok=replay||secret();p.tokenHash=hash(tok);p.departed=false;p.recoveryReceipt=body.requestId||null;
      if(!room.players.some(q=>q.id===room.hostId&&!q.departed))room.hostId=p.id;
    }else{
      need(room.phase==='lobby',409,'The game has started. You can only rejoin an existing player.');need(room.players.length<12,409,'This room has 12 players.');
      const created=player(name);p=created.p;tok=created.tok;room.players.push(p);
    }
    if(!room.hostId)room.hostId=p.id;
    await social.link(room,p,uid);
    await store.save(room);return respond(room,p,{tok});
  }
  const me=room.players.find(p=>p.id===body.pid);need(me&&body.tok&&equal(me.tokenHash,hash(body.tok)),401,'We could not load your place. Use your rejoin code to come back.');
  need(!me.departed||action==='state',403,'Use your rejoin code to come back.');
  const fingerprint=hash(JSON.stringify([action,body.match,body.lotNumber,body.targetId,body.choice,body.text,body.discussionSeconds]));
  const receipt=(room.receipts||[]).find(r=>r.pid===me.id&&r.id===body.requestId);
  if(action!=='state'&&receipt){need(receipt.fingerprint===fingerprint,409,'That request was already used. Please refresh and try again.');return respond(room,me);}
  let changed=timed(room)||migrated;
  if(action==='state'){if(changed)await store.save(room);return respond(room,me);}
  if(['forge','vote','advance','extend','next','claim','audit'].includes(action))need(body.match===room.match&&body.lotNumber===room.lot+1,409,'The round has changed. Check the new round.');
  const host=()=>need(room.hostId===me.id,403,'Only the host can do that.');
  if(action==='settings'){
    host();need(['lobby','finished'].includes(room.phase),409,'Change the pace before the next game.');
    need([0,60,90,120].includes(body.discussionSeconds),400,'Choose Auto, 60, 90 or 120 seconds.');
    room.settings={discussionSeconds:body.discussionSeconds};
  }
  if(action==='claim'){
    need(room.phase==='discussion',409,'Share your claim during discussion.');
    need(['approve','reject','unsure'].includes(body.choice),400,'Choose REAL, FAKE or Not sure.');
    need(typeof body.text==='string'&&Array.from(body.text).length<=180,400,'Keep your claim within 180 characters.');
    const message=body.text.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g,' ').replace(/\s+/g,' ').trim();
    need(message,400,'Write a short claim first.');
    room.claims||=[];const previous=room.claims.findIndex(c=>c.id===me.id);
    if(previous>=0)need(Date.now()-(room.claims[previous].updatedAt||0)>=2000,429,'Give the group a moment before changing your claim.');
    const claim={id:me.id,text:message,choice:body.choice,updatedAt:Date.now()};
    if(previous<0)room.claims.push(claim);else room.claims[previous]=claim;
  }
  if(action==='audit'){
    need(room.phase==='discussion',409,'Check a clue during discussion.');
    need(!me.auditUsed,409,'You already used your original-clue check this game.');
    const target=present(room).find(p=>p.id===body.targetId&&p.id!==me.id);
    const doc=target&&room.documents.find(d=>d.ownerId===target.id);
    need(doc,400,'Choose another player at the table.');
    me.auditUsed=true;me.auditReport={round:room.lot+1,targetId:target.id,source:doc.source,text:doc.text};
  }
  if(social.ACTIONS.includes(action))await social.act(room,me,body);
  if(action==='start'){host();need(['lobby','finished'].includes(room.phase),409,'The game has already started.');start(room);}
  if(action==='advance'){host();need(room.phase==='discussion',409,'Talking time has ended.');advance(room);}
  if(action==='extend'){
    need(room.phase==='discussion',409,'Talking time has ended.');need(!room.extended,409,'Extra time was already added this round.');room.deadline+=30000;room.extended=true;
  }
  if(action==='forge'){
    need(room.phase==='forging',409,'The clues are already ready to read.');
    need(me.team==='ring'&&me.id===room.forgerId,403,'Only the Lie Team player chosen this round can change a clue.');
    need(!room.tamper,409,'The clue is sealed. Wait for discussion.');
    need(room.documents.some(d=>d.ownerId===body.targetId&&d.replacement),400,'Pick one player’s clue.');
    sealForgery(room,body.targetId);
  }
  if(action==='vote'){
    need(room.phase==='voting',409,'Voting is not open.');need(room.electorate.includes(me.id),403,'You are not voting on this deal.');need(!room.votes[me.id],409,'Your vote is already saved.');
    need(['approve','reject'].includes(body.choice),400,'Pick REAL or FAKE.');room.votes[me.id]=body.choice;
    if(room.electorate.every(id=>room.votes[id]))settle(room);
  }
  if(action==='next'){
    host();need(room.phase==='reveal',409,'This round has not ended yet.');
    if(room.score.house===3||room.score.ring===3){room.phase='finished';room.deadline=null;}else{room.lot++;beginLot(room);}
  }
  if(action==='leave'){
    if(room.phase==='lobby')room.players=room.players.filter(p=>p.id!==me.id);else me.departed=true;
    if(room.hostId===me.id)room.hostId=present(room)[0]?.id||null;
    if(room.phase==='forging'&&room.forgerId===me.id){
      const editor=present(room).find(p=>p.team==='ring');if(editor)room.forgerId=editor.id;else {room.forgerId=null;if(!room.tamper)sealForgery(room);}
    }
    // A departing voter keeps their sealed vote; an uncast vote stays in the fixed electorate.
    social.forget(room,me);
  }
  // the winning team shares the prize once, when the game ends
  if(room.phase==='finished'){const win=room.score?.house===3?'house':room.score?.ring===3?'ring':null;await social.settle(room,'grand-con',room.players.filter(p=>win&&p.team===win).map(p=>({id:p.id,place:1})));}
  room.receipts=[...(room.receipts||[]),{pid:me.id,id:body.requestId,fingerprint}].slice(-100);
  await store.save(room);return respond(room,me);
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    need(['GET','POST'].includes(req.method),405,'Method not allowed.');
    const body=req.method==='GET'?{...req.query,tok:req.headers?.['x-tok']}:typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    if(req.method==='POST'){need(typeof body.requestId==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId),400,'Please refresh and try again.');if(['create','join'].includes(body.action))await store.rateLimit(req.headers?.['x-forwarded-for']||'local');}
    let result;
    for(let i=0;i<8;i++){try{result=await execute(req,body);break;}catch(error){if(!(error instanceof store.Conflict)||i===7)throw error;await new Promise(resolve=>setTimeout(resolve,5+crypto.randomInt(35)+i*12));}}
    res.status(200).json(result);
  }catch(error){const status=error instanceof store.Conflict?503:error instanceof SyntaxError?400:error.status||500;if(status===500)console.error(error);res.status(status).json({error:status===500?'Something went wrong. Please try again.':error.message});}
};
module.exports._rules={start,beginLot,sealForgery,deliver,settle,advance,timed,view,migrate};
