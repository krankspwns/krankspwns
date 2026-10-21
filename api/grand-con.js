const crypto = require('node:crypto');
const store = require('../lib/grand-con-store');
const CASES = require('../lib/grand-con-cases');
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
  const extras=[
    ['Look check','The item looks well kept. Nobody checked how old it is.','Someone checked the item and confirmed it is as old as the seller says.','Did they check its age, or only how it looks?'],
    ['Seller’s note','The seller says it is real. Nobody else checked it.','Another person checked this exact item and confirmed the seller is right.','Did anyone check the seller’s story?'],
    ['Delivery note','The item arrived last week. The note does not say who owned it before.','The note lists every owner, from when the item was made until today.','Does a delivery date tell us how old the item is?'],
    ['Display note','The item was shown to visitors. The note says nobody checked whether it is real.','Before showing the item, staff checked it and confirmed it is real.','Did staff check the item, or only put it on display?'],
    ['Sales page','The seller wrote the item’s name and age. The website did not check those details.','The website checked this item’s age before writing its sales page.','Who checked the age: the website or nobody?'],
    ['Price estimate','The high price assumes the seller’s story is true. Nobody checked whether it is real.','Someone checked the item and confirmed it is real before setting the price.','Is a high price proof that the item is real?'],
  ].map(([source,text,replacement,question])=>({source,text,replacement,question}));
  room.documents=[...records,...extras].slice(0,owners.length).map((d,i)=>({...d,ownerId:owners[i].id}));
  const editors=present(room).filter(p=>p.team==='ring');room.forgerId=editors[room.lot%editors.length]?.id||null;
  if(!room.forgerId)deliver(room);
}
function start(room){
  room.players=present(room);need(room.players.length>=4,409,'You need at least 4 players to start.');
  const ringCount=Math.floor(room.players.length/3),teams=shuffle(room.players.map((_,i)=>i<ringCount?'ring':'house'));
  room.players.forEach((p,i)=>p.team=teams[i]);room.lots=shuffle(CASES.map(c=>({caseId:c.id,genuine:!!crypto.randomInt(2)})));
  room.match=(room.match||0)+1;room.lot=0;room.score={house:0,ring:0};room.history=[];room.notice=null;beginLot(room);
}
function deliver(room,targetId){
  const candidates=room.documents.filter(d=>d.replacement);
  const doc=candidates.find(d=>d.ownerId===targetId)||candidates[crypto.randomInt(candidates.length)];
  room.tamper={ownerId:doc.ownerId,source:doc.source,original:doc.text,altered:doc.replacement};
  room.phase='discussion';room.deadline=Date.now()+45000;
}
function settle(room){
  const lot=room.lots[room.lot],c=CASES.find(c=>c.id===lot.caseId);
  const approvals=room.electorate.filter(id=>room.votes[id]==='approve').length,required=Math.floor(room.electorate.length/2)+1,approved=approvals>=required;
  const pointTo=approved===lot.genuine?'house':'ring';room.score[pointTo]++;
  room.history.push({number:room.lot+1,name:c.name,genuine:lot.genuine,explanation:lot.genuine?c.truth:c.fake,approved,approvals,required,electorate:room.electorate.length,pointTo,
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
  return {game:'grand-con',rulesVersion:2,code:room.code,version:room.version,phase:room.phase,match:room.match||0,lotNumber:room.lot+1,deadline:room.deadline,now:Date.now(),hostId:room.hostId,meId:me.id,notice:room.notice||null,
    lot:c?{art:c.art,name:c.name,claim:c.claim}:null,score:room.score||{house:0,ring:0},extended:!!room.extended,
    players:room.players.map(p=>({id:p.id,name:p.name,departed:!!p.departed,voteLocked:!!room.votes?.[p.id],...(finished?{team:p.team}:{})})),
    me:{team:me.team||null,document:document?{source:document.source,text:document.ownerId===room.tamper?.ownerId?room.tamper.altered:document.text,question:document.question}:null,vote:room.votes?.[me.id]||null,recoveryCode:recovery(room,me),
      ...(ring&&c?{ring:{allies:room.players.filter(p=>p.team==='ring').map(p=>p.id),forgerId:room.forgerId,genuine:lot.genuine,explanation:lot.genuine?c.truth:c.fake,tamper:room.tamper||null,
        ...(room.phase==='forging'?{options:room.documents.map(d=>({ownerId:d.ownerId,source:d.source,original:d.text,altered:d.replacement}))}:{})}}:{})},
    history:room.history||[],required:room.phase==='voting'?Math.floor(room.electorate.length/2)+1:null,
    winningTeam:room.score?.house===3?'house':room.score?.ring===3?'ring':null};
}
async function execute(req,body) {
  const action=req.method==='GET'?'state':body.action;
  need(['state','create','join','start','advance','extend','forge','vote','next','leave'].includes(action),400,'Unknown action.');
  if(action==='create'){
    const name=cleanName(body.name);need(name,400,'Enter your name.');
    let code;for(let i=0;i<10;i++){code=Array.from({length:4},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(24)]).join('');if(!await store.load(code))break;code=null;}
    need(code,503,'Please try creating the room again.');
    const {p,tok}=player(name),room={code,version:0,hostId:p.id,rulesVersion:2,phase:'lobby',players:[p],lot:0,history:[]};await store.save(room);return {...view(room,p),tok};
  }
  const code=String(body.code||'').toUpperCase();need(/^[A-Z]{4}$/.test(code),400,'Enter a four-letter room code.');
  const room=await store.load(code);need(room,404,'Room not found.');
  const migrated=migrate(room);
  if(action==='join'){
    const name=cleanName(body.name);need(name,400,'Enter your name.');
    let p=room.players.find(p=>p.name.toLowerCase()===name.toLowerCase());let tok;
    if(p){
      const replay=body.requestId&&body.recoveryCode?crypto.createHmac('sha256',String(body.recoveryCode).trim()).update('gc:'+code+':'+p.id+':'+body.requestId).digest('base64url'):null;
      if(p.recoveryReceipt===body.requestId&&replay&&equal(p.tokenHash,hash(replay)))return {...view(room,p),tok:replay};
      need(body.recoveryCode&&equal(recovery(room,p),String(body.recoveryCode).trim()),409,'That name is already in this room. Enter its rejoin code.');
      tok=replay||secret();p.tokenHash=hash(tok);p.departed=false;p.recoveryReceipt=body.requestId||null;
      if(!room.players.some(q=>q.id===room.hostId&&!q.departed))room.hostId=p.id;
    }else{
      need(room.phase==='lobby',409,'The game has started. You can only rejoin an existing player.');need(room.players.length<12,409,'This room has 12 players.');
      const created=player(name);p=created.p;tok=created.tok;room.players.push(p);
    }
    if(!room.hostId)room.hostId=p.id;
    await store.save(room);return {...view(room,p),tok};
  }
  const me=room.players.find(p=>p.id===body.pid);need(me&&body.tok&&equal(me.tokenHash,hash(body.tok)),401,'We could not load your place. Use your rejoin code to come back.');
  need(!me.departed||action==='state',403,'Use your rejoin code to come back.');
  const fingerprint=hash(JSON.stringify([action,body.match,body.lotNumber,body.targetId,body.choice]));
  const receipt=(room.receipts||[]).find(r=>r.pid===me.id&&r.id===body.requestId);
  if(action!=='state'&&receipt){need(receipt.fingerprint===fingerprint,409,'That request was already used. Please refresh and try again.');return view(room,me);}
  let changed=timed(room)||migrated;
  if(action==='state'){if(changed)await store.save(room);return view(room,me);}
  if(['forge','vote','advance','extend','next'].includes(action))need(body.match===room.match&&body.lotNumber===room.lot+1,409,'The round has changed. Check the new round.');
  const host=()=>need(room.hostId===me.id,403,'Only the host can do that.');
  if(action==='start'){host();need(['lobby','finished'].includes(room.phase),409,'The game has already started.');start(room);}
  if(action==='advance'){host();need(room.phase==='discussion',409,'Talking time has ended.');advance(room);}
  if(action==='extend'){
    need(room.phase==='discussion',409,'Talking time has ended.');need(!room.extended,409,'Extra time was already added this round.');room.deadline+=30000;room.extended=true;
  }
  if(action==='forge'){
    need(room.phase==='forging',409,'The clues are already ready to read.');
    need(me.team==='ring'&&me.id===room.forgerId,403,'Only the Lie Team player chosen this round can change a clue.');
    need(room.documents.some(d=>d.ownerId===body.targetId&&d.replacement),400,'Pick one player’s clue.');
    deliver(room,body.targetId);
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
      const editor=present(room).find(p=>p.team==='ring');if(editor)room.forgerId=editor.id;else deliver(room);
    }
    // A departing voter keeps their sealed vote; an uncast vote stays in the fixed electorate.
  }
  room.receipts=[...(room.receipts||[]),{pid:me.id,id:body.requestId,fingerprint}].slice(-100);
  await store.save(room);return view(room,me);
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
module.exports._rules={start,beginLot,deliver,settle,advance,timed,view,migrate};
