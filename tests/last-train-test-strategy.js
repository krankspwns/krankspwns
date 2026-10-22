const assert=require('node:assert/strict');
const {remember,statement}=require('../public/last-train-test-strategy');
function view(role,extra={}) {
  return {match:1,round:1,phase:'discussion',meId:'bot',players:[{id:'bot',name:'Bot Nova',alive:true},{id:'benny',name:'Benny',alive:true},{id:'luna',name:'Luna',alive:true},{id:'ally',name:'Bot Kai',alive:true}],mix:['inspector','medic','witness','brave','careful','speaker','passenger'].map(role=>({role,count:1})),me:{role,group:role==='saboteur'||role==='blocker'?'saboteur':'crew',reports:[],used:{},...extra}};
}
for(const alignment of ['good','bad']) {
  const v=view('inspector',{reports:[{round:1,type:'check',targetId:'benny',alignment}]}),bot={pid:'bot'};remember(bot,v);
  assert.equal(statement(bot,v),"I'm Inspector. I checked Benny last night: "+alignment.toUpperCase()+'.');
}
assert.match(statement({},view('inspector',{reports:[{round:1,type:'check-blocked'}]})),/blocked.*no GOOD or BAD result/);
assert.match(statement({},view('inspector',{reports:[{round:0,type:'check',targetId:'benny',alignment:'bad'}]})),/no check result/);
for(const power of ['heal','poison','pass']) {
  const bot={pid:'bot'},night=view('medic',{medicineChoice:{power,targetId:power==='pass'?null:'benny'}});night.phase='night';night.nightRole='medic';remember(bot,night);
  const day=view('medic',{medicine:{heal:0,poison:0}});remember(bot,day);
  assert.match(statement(bot,day),power==='pass'?/used no medicine/:new RegExp('used my '+power+' on Benny'));
  // The same saved bot memory restores its own action after a host reload.
  assert.equal(statement(JSON.parse(JSON.stringify(bot)),day),statement(bot,day));
  const next={...day,match:2,round:1};remember(bot,next);assert.ok(!statement(bot,next).includes('on Benny'));
}
{
  const bot={},v=view('medic',{blocked:true,medicine:{heal:1,poison:1}});v.phase='night';v.nightRole='medic';remember(bot,v);const day=view('medic');remember(bot,day);assert.match(statement(bot,day),/blocked.*used no medicine/);
}
assert.match(statement({},view('witness',{reports:[{round:1,type:'watch',targetId:'luna'}]})),/targeted Luna.*don't know whether medicine was used/);
assert.match(statement({},view('witness',{reports:[{round:1,type:'watch-blocked'}]})),/blocked.*did not see the target/);
assert.match(statement({},view('witness',{reports:[{round:1,type:'watch',targetId:null}]})),/chose no attack/);
assert.match(statement({},view('brave',{nightChoice:{power:'cover',targetId:'benny'}})),/chose to protect Benny/);
assert.match(statement({},view('careful',{nightChoice:{power:'lock'}})),/used my door lock/);
assert.match(statement({},view('brave',{used:{cover:true},nightChoice:{power:'pass'}})),/protected nobody.*already used/);
assert.match(statement({},view('speaker',{used:{double:true}})),/double vote is already used/);
assert.match(statement({},view('trainee')),/not been promoted/);
assert.match(statement({},view('inspector',{reports:[{round:1,type:'promotion',role:'inspector'}]})),/was Trainee and became Inspector.*no check result/);
assert.match(statement({},view('passenger')),/no night power/);
// Bad bots choose a plausible role from the public mix and never use the host's private role data.
for(const role of ['saboteur','blocker']) {
  const v=view(role,{allies:[{id:'bot'},{id:'ally'}]});
  for(const cover of ['inspector','witness','medic','brave','careful','speaker','passenger']) {
    v.mix=[{role:cover,count:1}];const bot={pid:'bot',memory:{match:1,round:1,attackId:'benny'}};
    const text=statement(bot,v);assert.ok(text.length<=280);assert.ok(!text.startsWith("I'm Saboteur")&&!text.startsWith("I'm Blocker"));assert.ok(!text.includes('Bot Kai'));
    if(cover==='inspector')assert.match(text,/checked (Benny|Luna).*BAD/);
    if(cover==='witness')assert.match(text,/targeted Luna/);
    v.round=2;const second=statement(bot,v);if(['witness','brave','careful','medic'].includes(cover))assert.match(second,/already used/);v.round=1;
  }
}
console.log('Last Train test strategy: real checks, medicine memory, blocked powers, limited powers, promotion and plausible Saboteur lies passed');
