const crypto = require('node:crypto');
const store = require('../lib/grand-con-store');
const LOTS = [
  ['crown','The Ash Crown','A coronation piece, offered without a royal seal.'],
  ['painting','The Ninth Muse','A vanished portrait, discovered behind a false wall.'],
  ['record','The Velvet Recording','One acetate. One voice. A very expensive secret.'],
  ['mask','The Last Masquerade','A ceremonial mask with two competing histories.'],
  ['clock','The Thirteenth Hour','A private commission from a watchmaker who never existed.'],
  ['crown','The Regent’s Promise','A jeweled heirloom with a conveniently missing receipt.'],
  ['painting','Rain over Arcadia','An unsigned canvas from a supposedly destroyed collection.'],
  ['record','The Silent Encore','The only surviving recording of an impossible performance.'],
];
const POWERS=['investigate','insure','leverage','plant'];
const need=(ok,status,message)=>{if(!ok)throw Object.assign(Error(message),{status});};
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const secret=()=>crypto.randomBytes(24).toString('base64url');
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const cleanName=name=>Array.from(String(name||'').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g,'').replace(/\s+/g,' ').trim()).slice(0,12).join('');
const recovery=(room,p)=>crypto.createHmac('sha256',p.tokenHash).update('grand-con:'+room.code+':'+p.id).digest('base64url').slice(0,24);
const equal=(a,b)=>{const x=Buffer.from(hash(a)),y=Buffer.from(hash(b));return crypto.timingSafeEqual(x,y);};
const present=room=>room.players.filter(p=>!p.departed);
function player(name) {const tok=secret();return {p:{id:crypto.randomUUID(),name,tokenHash:hash(tok),coins:40,portfolio:0,used:[],hits:0,calls:0},tok};}
function beginLot(room) {
  room.phase='discussion';room.deadline=Date.now()+90000;room.actions={};room.bids={};room.rumors=[];
  const lot=room.lots[room.lot];
  room.clues=Object.fromEntries(room.players.map((p,i)=>{
    const supports = crypto.randomInt(100)<70 ? lot.genuine : !lot.genuine;
    const sources=['Pigment analysis','Shipping manifest','Workshop records','Material sample','Archive photograph','Collector’s ledger'];
    return [p.id,{source:sources[i%sources.length],text:supports?'The details are consistent with an original.':'There are inconsistencies suggesting a reproduction.',lean:supports}];
  }));
}
function start(room) {
  room.players=present(room);need(room.players.length>=4,409,'Gather at least 4 players to begin.');
  const teams=shuffle(room.players.map((_,i)=>i%2?'onyx':'gilt'));
  room.players.forEach((p,i)=>Object.assign(p,{team:teams[i],coins:40,portfolio:0,used:[],hits:0,calls:0}));
  const authenticity=shuffle([true,true,true,false,false]);
  room.lots=shuffle(LOTS.map(v=>v.slice())).slice(0,5).map(([art,name,story],i)=>({art,name,story,genuine:authenticity[i],value:authenticity[i]?crypto.randomInt(14,29):crypto.randomInt(0,6)}));
  room.match=(room.match||0)+1;room.lot=0;room.history=[];beginLot(room);
}
function settle(room) {
  const lot=room.lots[room.lot], order=room.players.map((p,i)=>room.players[(i+room.lot)%room.players.length]);
  const bids=order.map(p=>({p,...(room.bids[p.id]||{amount:0,verdict:'pass'})}));
  const ranked=bids.filter(b=>b.amount>0).sort((a,b)=>(b.amount+(room.actions[b.p.id]?.power==='leverage'?3:0))-(a.amount+(room.actions[a.p.id]?.power==='leverage'?3:0)));
  const winner=ranked[0];
  let refund=0;
  if(winner){winner.p.coins-=winner.amount;winner.p.portfolio+=lot.value;if(!lot.genuine&&room.actions[winner.p.id]?.power==='insure'){refund=Math.min(8,winner.amount);winner.p.coins+=refund;}}
  for(const b of bids)if(b.verdict!=='pass'){b.p.calls++;const right=(b.verdict==='genuine')===lot.genuine;b.p.hits+=right?1:0;b.p.coins+=right?2:-Math.min(1,b.p.coins);}
  room.history.push({...lot,number:room.lot+1,winnerId:winner?.p.id||null,paid:winner?.amount||0,refund,bids:bids.map(b=>({id:b.p.id,amount:b.amount,verdict:b.verdict,power:room.actions[b.p.id]?.power||'pass'}))});
  room.phase='reveal';room.deadline=null;
}
function advance(room) {
  if(room.phase==='discussion'){room.phase='actions';room.deadline=Date.now()+45000;}
  else if(room.phase==='actions'){room.phase='bidding';room.deadline=Date.now()+45000;}
  else if(room.phase==='bidding')settle(room);
}
function timed(room) {if(room.deadline&&Date.now()>=room.deadline){advance(room);return true;}return false;}
function view(room,me) {
  const finished=room.phase==='finished', lot=room.lots?.[room.lot];
  const totals=['gilt','onyx'].map(team=>{const people=room.players.filter(p=>p.team===team);return {team,total:people.reduce((n,p)=>n+p.coins+p.portfolio,0),players:people.length};});
  let winningTeam=null;
  if(finished){const [a,b]=totals;winningTeam=a.total*b.players===b.total*a.players?'tie':a.total*b.players>b.total*a.players?a.team:b.team;}
  return {game:'grand-con',code:room.code,version:room.version,phase:room.phase,match:room.match||0,lotNumber:room.lot+1,deadline:room.deadline,now:Date.now(),hostId:room.hostId,meId:me.id,
    lot:lot?{art:lot.art,name:lot.name,story:lot.story}:null,
    players:room.players.map(p=>({id:p.id,name:p.name,coins:p.coins,portfolio:p.portfolio,departed:!!p.departed,actionLocked:!!room.actions?.[p.id],bidLocked:!!room.bids?.[p.id],hits:p.hits,calls:p.calls,...(finished?{team:p.team}:{})})),
    me:{team:me.team||null,coins:me.coins,used:me.used,clue:room.clues?.[me.id]||null,action:room.actions?.[me.id]||null,bid:room.bids?.[me.id]||null,recoveryCode:recovery(room,me)},
    rumors:room.rumors||[],history:room.history||[],...(finished?{totals,winningTeam}:{}),priorityId:room.players[room.lot%room.players.length]?.id};
}
async function execute(req,body) {
  const action=req.method==='GET'?'state':body.action;
  need(['state','create','join','start','advance','power','bid','next','leave'].includes(action),400,'Unknown action.');
  if(action==='create'){
    const name=cleanName(body.name);need(name,400,'Enter your name.');
    let code;for(let i=0;i<10;i++){code=Array.from({length:4},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(24)]).join('');if(!await store.load(code))break;code=null;}
    need(code,503,'Please try creating the room again.');
    const {p,tok}=player(name),room={code,version:0,hostId:p.id,phase:'lobby',players:[p],lot:0,history:[]};await store.save(room);return {...view(room,p),tok};
  }
  const code=String(body.code||'').toUpperCase();need(/^[A-Z]{4}$/.test(code),400,'Enter a four-letter room code.');
  const room=await store.load(code);need(room,404,'Room not found.');
  if(action==='join'){
    const name=cleanName(body.name);need(name,400,'Enter your name.');
    let p=room.players.find(p=>p.name.toLowerCase()===name.toLowerCase());let tok;
    if(p){
      const replay=body.requestId&&body.recoveryCode?crypto.createHmac('sha256',String(body.recoveryCode).trim()).update('gc:'+code+':'+p.id+':'+body.requestId).digest('base64url'):null;
      if(p.recoveryReceipt===body.requestId&&replay&&equal(p.tokenHash,hash(replay)))return {...view(room,p),tok:replay};
      need(body.recoveryCode&&equal(recovery(room,p),String(body.recoveryCode).trim()),409,'That seat exists. Enter its private recovery code.');
      tok=replay||secret();p.tokenHash=hash(tok);p.departed=false;p.recoveryReceipt=body.requestId||null;
      if(!room.players.some(q=>q.id===room.hostId&&!q.departed))room.hostId=p.id;
    }else{
      need(room.phase==='lobby',409,'A match is in progress. You can recover an existing seat.');need(room.players.length<12,409,'This room has 12 players.');
      const created=player(name);p=created.p;tok=created.tok;room.players.push(p);
    }
    if(!room.hostId)room.hostId=p.id;
    await store.save(room);return {...view(room,p),tok};
  }
  const me=room.players.find(p=>p.id===body.pid);need(me&&body.tok&&equal(me.tokenHash,hash(body.tok)),401,'Your seat could not be verified. Rejoin with your recovery code.');
  need(!me.departed||action==='state',403,'Recover your seat to return.');
  const fingerprint=hash(JSON.stringify([action,body.match,body.lotNumber,body.power,body.rumor,body.amount,body.verdict]));
  const receipt=(room.receipts||[]).find(r=>r.pid===me.id&&r.id===body.requestId);
  if(action!=='state'&&receipt){need(receipt.fingerprint===fingerprint,409,'That request was already used.');return view(room,me);}
  let changed=timed(room);
  if(action==='state'){if(changed)await store.save(room);return view(room,me);}
  if(['power','bid','advance','next'].includes(action))need(body.match===room.match&&body.lotNumber===room.lot+1,409,'The auction moved on. Review the current lot.');
  const host=()=>need(room.hostId===me.id,403,'Only the host can do that.');
  if(action==='start'){host();need(['lobby','finished'].includes(room.phase),409,'A match is already running.');start(room);}
  if(action==='advance'){host();need(room.phase==='discussion',409,'Wait for everyone to submit or for the timer.');advance(room);}
  if(action==='power'){
    need(room.phase==='actions',409,'Secret actions have closed.');need(!room.actions[me.id],409,'Your action is locked.');
    need(['pass',...POWERS].includes(body.power),400,'Choose a valid action.');
    if(body.power!=='pass'){need(!me.used.includes(body.power),409,'You already used that favor.');need(me.coins>=2,409,'A favor costs 2 credits.');need(body.power!=='plant'||['genuine','forged'].includes(body.rumor),400,'Choose a rumor.');me.coins-=2;me.used.push(body.power);}
    room.actions[me.id]={power:body.power};
    if(body.power==='investigate')room.actions[me.id].report={genuine:room.lots[room.lot].genuine,value:room.lots[room.lot].value};
    if(body.power==='plant')room.rumors.push({claim:body.rumor});
    if(present(room).every(p=>room.actions[p.id]))advance(room);
  }
  if(action==='bid'){
    need(room.phase==='bidding',409,'Bidding has closed.');need(!room.bids[me.id],409,'Your bid is locked.');
    need(Number.isInteger(body.amount)&&body.amount>=0&&body.amount<=me.coins,400,'Bid within your available credits.');need(['genuine','forged','pass'].includes(body.verdict),400,'Choose your appraisal.');
    room.bids[me.id]={amount:body.amount,verdict:body.verdict};if(present(room).every(p=>room.bids[p.id]))settle(room);
  }
  if(action==='next'){host();need(room.phase==='reveal',409,'The lot has not been revealed.');if(room.lot===4){room.phase='finished';room.deadline=null;}else{room.lot++;beginLot(room);}}
  if(action==='leave'){
    if(room.phase==='lobby')room.players=room.players.filter(p=>p.id!==me.id);else me.departed=true;
    if(room.hostId===me.id)room.hostId=present(room)[0]?.id||null;
    if(present(room).length&&room.phase==='actions'&&present(room).every(p=>room.actions[p.id]))advance(room);
    if(present(room).length&&room.phase==='bidding'&&present(room).every(p=>room.bids[p.id]))settle(room);
  }
  room.receipts=[...(room.receipts||[]),{pid:me.id,id:body.requestId,fingerprint}].slice(-100);
  await store.save(room);return view(room,me);
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    need(['GET','POST'].includes(req.method),405,'Method not allowed.');
    const body=req.method==='GET'?{...req.query,tok:req.headers?.['x-tok']}:typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    if(req.method==='POST'){need(typeof body.requestId==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId),400,'A request identifier is required.');if(['create','join'].includes(body.action))await store.rateLimit(req.headers?.['x-forwarded-for']||'local');}
    let result;
    for(let i=0;i<8;i++){try{result=await execute(req,body);break;}catch(error){if(!(error instanceof store.Conflict)||i===7)throw error;await new Promise(resolve=>setTimeout(resolve,5+crypto.randomInt(35)+i*12));}}
    res.status(200).json(result);
  }catch(error){const status=error instanceof store.Conflict?503:error instanceof SyntaxError?400:error.status||500;if(status===500)console.error(error);res.status(status).json({error:status===500?'Something went wrong. Please retry.':error.message});}
};
module.exports._rules={start,beginLot,settle,advance,view};
