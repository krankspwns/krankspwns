const {test,expect}=require('@playwright/test');
const {call:rawCall}=require('../helpers');
const call=(handler,body,query,headers)=>rawCall(handler,body,query,{...headers,'x-forwarded-for':test.info().testId});
const crypto=require('node:crypto');
const read=p=>p.evaluate(async()=>{const s=JSON.parse(localStorage.getItem('lt-seat'));return(await fetch('/api/last-train?code='+s.code+'&pid='+s.pid,{headers:{'x-tok':s.tok}})).json();});
const choose=async(p,title,name)=>{await p.getByRole('button',{name:title,exact:true}).click();const d=p.getByRole('dialog');await d.locator('.manifest-target').filter({has:p.getByText(new RegExp('^'+name+'(?: · You)?$'))}).click();await d.getByRole('button',{name:/^Confirm:/}).click();};
const nightTurn=async(p,name)=>expect(p.locator('#lt-app')).toHaveAttribute('data-night-role',name,{timeout:27000});
test('journey rules, room settings and the game selector work at 320px',async({page},info)=>{
  await page.setViewportSize({width:320,height:720});await page.goto('/?games=1');await page.getByRole('link',{name:/Last Train/}).click();
  await expect(page.getByRole('heading',{name:'Catch the last train.'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'How to play'}).click();const d=page.getByRole('dialog');await expect(d.getByRole('heading',{name:'One train. Two secret teams.'})).toBeInViewport();expect(await d.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'How to play'})).toBeFocused();
  await page.getByLabel('Your name',{exact:true}).fill('Small host');await page.getByRole('button',{name:'Create a room',exact:true}).click();await expect(page.locator('.room-code')).toBeVisible();
  await page.getByRole('button',{name:'Chat room',exact:true}).click();await expect(page.getByRole('button',{name:'Chat room',exact:true})).toHaveClass(/selected/);expect((await read(page)).settings.discussion).toBe('chat');
  await page.screenshot({path:info.outputPath('journey-settings-mobile.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('twelve phones board, meet their cabins, take sequential night turns, speak in order and reveal the vote',async({browser},info)=>{
  test.setTimeout(300000);const contexts=[],pages=[],errors=[];
  try{
    for(let i=0;i<12;i++){const c=await browser.newContext({viewport:{width:i===0?1240:390,height:i===0?960:844},reducedMotion:'reduce'});contexts.push(c);const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));pages.push(p);await p.goto('/last-train.html');await p.getByLabel('Your name',{exact:true}).fill('Player '+i);}
    const host=pages[0];await host.getByRole('button',{name:'Create a room',exact:true}).click();const code=await host.locator('.room-code').textContent();
    for(const p of pages.slice(1)){await p.getByLabel('Room code',{exact:true}).fill(code);await p.getByRole('button',{name:'Join room',exact:true}).click();}
    await expect(host.locator('.seat')).toHaveCount(12);await host.getByRole('button',{name:'START JOURNEY'}).click();
    await expect(host.getByRole('heading',{name:'Meet the two teams.'})).toBeVisible();await expect(host.locator('.introduced-role')).toHaveCount(9);expect((await read(host)).me.role).toBeNull();
    await host.screenshot({path:info.outputPath('journey-team-introductions.png'),fullPage:true});
    await Promise.all(pages.map(async p=>{await expect(p.getByRole('button',{name:'I’m ready · board the train',exact:true})).toBeVisible();await p.getByRole('button',{name:'I’m ready · board the train',exact:true}).click();}));
    await expect(host.locator('.platform-scene')).toBeVisible();await expect(host.locator('.boarding-person')).toHaveCount(12);await host.screenshot({path:info.outputPath('journey-boarding.png'),fullPage:true});
    await nightTurn(host,'careful');const states=await Promise.all(pages.map(read)),bad=states.map((s,i)=>({s,i})).filter(x=>x.s.me.group==='saboteur');
    const wi=states.findIndex(s=>s.me.role==='witness'),mi=states.findIndex(s=>s.me.role==='medic'),ii=states.findIndex(s=>s.me.role==='inspector'),bi=states.findIndex(s=>s.me.role==='brave'),ci=states.findIndex(s=>s.me.role==='careful');
    await nightTurn(pages[ci],'careful');await pages[ci].getByRole('button',{name:'Skip',exact:true}).click();
    for(const b of bad){await nightTurn(pages[b.i],'saboteur');await expect(pages[b.i].locator('.cabin-person')).toHaveCount(2);await choose(pages[b.i],'Choose Target','Player '+bad[0].i);}
    const team=pages[bad[0].i];if(!await team.locator('.team-chat').evaluate(n=>n.open))await team.locator('.team-chat summary').click();await team.getByLabel('Whisper to your team',{exact:true}).fill('Same target, team.');await team.getByRole('button',{name:'Send',exact:true}).click();const peer=pages[bad[1].i];if(!await peer.locator('.team-chat').evaluate(n=>n.open))await peer.locator('.team-chat summary').click();await expect(peer.getByRole('log',{name:'Private Saboteur chat'})).toContainText('Same target, team.');
    await team.screenshot({path:info.outputPath('journey-saboteur-cabin-mobile.png'),fullPage:true});
    const witness=pages[wi];await expect(witness.locator('.cabin-person')).toHaveCount(0);await expect(witness.getByLabel('Private Saboteur chat')).toHaveCount(0);await expect(witness.locator('.role-dock')).toBeVisible();expect(await witness.locator('[data-role-art]').evaluateAll(nodes=>nodes.every(n=>n.dataset.roleArt==='witness'))).toBe(true);await expect(witness.locator('.cabin-scene picture source')).toHaveAttribute('srcset','/last-train/cabin.webp');
    await nightTurn(host,'medic');const medic=pages[mi];await nightTurn(medic,'medic');await expect(medic.getByRole('button',{name:'Heal Player '+bad[0].i,exact:true})).toBeVisible();
    await expect(medic.locator('.patient-heading [data-portrait-set=passengers]')).toHaveCount(1);expect(await medic.locator('[data-role-art]').evaluateAll(nodes=>nodes.every(n=>n.dataset.roleArt==='medic'))).toBe(true);await medic.screenshot({path:info.outputPath('journey-medic-cabin-mobile.png'),fullPage:true});await choose(medic,'Poison someone','Player '+bad[1].i);await expect(medic.locator('.choice-saved')).toContainText('Poison delivered');
    await nightTurn(host,'brave');await nightTurn(pages[bi],'brave');await pages[bi].getByRole('button',{name:'Skip',exact:true}).click();
    await nightTurn(host,'inspector');await nightTurn(pages[ii],'inspector');await choose(pages[ii],'Choose','Player '+bad[2].i);
    await nightTurn(host,'witness');await nightTurn(witness,'witness');await witness.getByRole('button',{name:'Watch',exact:true}).click();
    await expect(host.locator('.lounge-scene')).toBeVisible({timeout:27000});await expect(host.locator('#lt-app')).toHaveAttribute('data-phase','morning',{timeout:10000});await expect(host.locator('.morning-reveal .revealed-out')).toHaveCount(2);
    if(await witness.getByRole('button',{name:'Show role',exact:true}).isVisible())await witness.getByRole('button',{name:'Show role',exact:true}).click();await witness.getByRole('button',{name:'Reports (1)',exact:true}).click();await expect(witness.getByRole('dialog')).toContainText('The Saboteurs tried to attack Player '+bad[0].i);await witness.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
    await expect(host.locator('#lt-app')).toHaveAttribute('data-phase','discussion',{timeout:13000});
    const discussion=await read(host),order=discussion.speakingOrder;expect(order.length).toBe(10);expect(order).toEqual(discussion.players.filter(p=>p.alive).map(p=>p.id));
    await host.screenshot({path:info.outputPath('journey-lounge-desktop.png'),fullPage:true});
    const small=pages[wi];await small.setViewportSize({width:320,height:720});expect(await small.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await small.screenshot({path:info.outputPath('journey-lounge-small.png'),fullPage:true});await small.setViewportSize({width:390,height:844});
    for(const id of order){const i=states.findIndex(s=>s.meId===id),p=pages[i];await expect(p.getByRole('heading',{name:'It’s your turn.'})).toBeVisible();await expect(p.locator('.lounge-seat.speaking')).toHaveAttribute('data-player',id);await p.getByRole('button',{name:'I’m done speaking',exact:true}).click();}
    await expect(host.locator('#lt-app')).toHaveAttribute('data-phase','voting');
    for(const id of order){const p=pages[states.findIndex(s=>s.meId===id)];await expect(p.locator('.inline-votes')).toHaveCount(0);await choose(p,'Choose a player or Skip','Player '+bad[2].i);}
    await expect(host.locator('#lt-app')).toHaveAttribute('data-phase','voteResult');await expect(host.locator('.ejection-reveal .alignment-stamp')).toHaveText('BAD');await expect(host.locator('.inline-votes .vote-row')).toHaveCount(10);await host.screenshot({path:info.outputPath('journey-vote-reveal.png'),fullPage:true});
    await expect(host.getByRole('heading',{name:'The good team wins!'})).toBeVisible({timeout:18000});await expect(host.locator('.final-role')).toHaveCount(12);
    await host.getByRole('button',{name:'See the final vote',exact:true}).click();await expect(host.getByRole('dialog').locator('.vote-row')).toHaveCount(10);await host.keyboard.press('Escape');
    await host.getByRole('button',{name:'PLAY AGAIN',exact:true}).click();await expect(host.getByRole('heading',{name:'Meet the two teams.'})).toBeVisible();expect((await read(host)).me.role).toBeNull();expect(errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
test('ordered chat preserves drafts through pause, shows findings safely and returns everyone to cabins',async({browser},info)=>{
  // Seed a real post-night room in this worker and route browser requests through the real API handler.
  // The separate 12-phone test exercises every real 20-second night window over HTTP.
  const handler=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');
  const enter=(action,data)=>call(handler,{action,requestId:crypto.randomUUID(),...data});
  const host=(await enter('create',{name:'Chat host'})).j,seats=[host];for(let i=1;i<6;i++)seats.push((await enter('join',{code:host.code,name:'Chat '+i})).j);
  let room=await store.load(host.code);room.settings.discussion='chat';rules.start(room);room.nightMode='legacy';while(room.phase!=='discussion')rules.advance(room);await store.save(room);
  const first=seats.find(s=>s.meId===room.speakingOrder[0]),second=seats.find(s=>s.meId===room.speakingOrder[1]);const contexts=[];
  const post=async(s,action,extra={})=>{const room=await store.load(host.code);return call(handler,{action,code:host.code,pid:s.meId,tok:s.tok,match:room.match,round:room.round,step:room.step,requestId:crypto.randomUUID(),...extra});};
  const expire=async()=>{const room=await store.load(host.code);room.deadline=Date.now()-1;await store.save(room);return call(handler,null,{code:host.code,pid:host.meId},{'x-tok':host.tok});};
  try{
    const pages=[];for(const s of [first,second]){const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});contexts.push(c);await c.addInitScript(seat=>localStorage.setItem('lt-seat',JSON.stringify(seat)),{code:s.code,pid:s.meId,tok:s.tok});await c.route('**/api/last-train**',async route=>{const q=new URL(route.request().url()),req=route.request();const result=await call(handler,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(q.searchParams),req.headers());await route.fulfill({status:result.s,contentType:'application/json',body:JSON.stringify(result.j)});});const p=await c.newPage();pages.push(p);await p.goto('/last-train.html');}
    const [a,b]=pages;await expect(a.getByLabel('Your findings',{exact:true})).toBeVisible();await expect(b.getByLabel('Your findings',{exact:true})).toHaveCount(0);
    await a.getByLabel('Your findings',{exact:true}).fill('I am watching seat four.');await a.getByRole('button',{name:'Share findings',exact:true}).click();await expect(b.getByRole('log',{name:/Shared findings/})).toContainText('I am watching seat four.');
    await expect(b.getByLabel('Your findings',{exact:true})).toBeVisible();await b.getByLabel('Your findings',{exact:true}).fill('This draft survives a pause.');await post(host,'pause');await expect(b.locator('.pause-banner')).toBeVisible();await expect(b.getByLabel('Your findings',{exact:true})).toBeDisabled();await post(host,'resume');await expect(b.getByLabel('Your findings',{exact:true})).toHaveValue('This draft survives a pause.');
    await b.getByLabel('Your findings',{exact:true}).fill('<img src=x onerror=alert(1)> is only a story.');await b.getByRole('button',{name:'Share findings',exact:true}).click();await expect(a.getByRole('log',{name:/Shared findings/})).toContainText('<img src=x onerror=alert(1)>');await expect(a.locator('.public-message img')).toHaveCount(0);await b.screenshot({path:info.outputPath('journey-ordered-chat-mobile.png'),fullPage:true});
    for(let i=0;i<4;i++)await expire();room=await store.load(host.code);expect(room.phase).toBe('voting');
    await expect(a.locator('#lt-app')).toHaveAttribute('data-phase','voting');await a.getByRole('button',{name:'Choose a player or Skip',exact:true}).click();await expect(a.getByRole('dialog')).toBeVisible();
    for(const s of seats)await post(s,'vote',{targetId:null});await expect(a.locator('#lt-app')).toHaveAttribute('data-phase','voteResult');await expect(a.locator('.inline-votes .vote-row')).toHaveCount(6);await expect(a.getByRole('dialog')).toHaveCount(0);await expire();await expect(a.locator('.cabin-scene')).toBeVisible();await expect(a.locator('#lt-app')).toHaveAttribute('data-phase','settling');expect((await store.load(host.code)).round).toBe(2);
    await a.screenshot({path:info.outputPath('journey-return-to-cabin.png'),fullPage:true});
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
test('private recovery rotates the old phone and saved games stay independent',async({page,browser})=>{
  await page.goto('/last-train.html');await page.getByLabel('Your name',{exact:true}).fill('Returnee');await page.getByRole('button',{name:'Create a room',exact:true}).click();await expect(page.locator('.room-code')).toBeVisible();const initial=await read(page);await page.getByRole('button',{name:'Invite ▾',exact:true}).click();await page.getByRole('menuitem',{name:'My Rejoin Code'}).click();await expect(page.getByLabel('Rejoin code',{exact:true})).toHaveValue(initial.me.recoveryCode);await page.keyboard.press('Escape');
  const c=await browser.newContext();try{const p=await c.newPage();await p.goto('/last-train.html?room='+initial.code);await p.getByLabel('Your name',{exact:true}).fill('Returnee');await p.getByText('Rejoin on another phone',{exact:true}).click();await p.getByLabel('Rejoin code',{exact:true}).fill(initial.me.recoveryCode);await p.getByRole('button',{name:'Join room',exact:true}).click();await expect(p.locator('.room-code')).toHaveText(initial.code);await expect(page.getByRole('heading',{name:'Catch the last train.'})).toBeVisible();
    await p.evaluate(async()=>{const make=async(url,name)=>{const v=await(await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',name,requestId:crypto.randomUUID()})})).json();return{code:v.code,pid:v.meId,tok:v.tok};};localStorage.setItem('gc-seat',JSON.stringify(await make('/api/grand-con','Con tester')));localStorage.setItem('sct',JSON.stringify(await make('/api/game','Row tester')));localStorage.setItem('arcade-last-game','last-train');});
    await p.goto('/');await expect(p).toHaveURL(/last-train\.html/);await expect(p.locator('.room-code')).toHaveText(initial.code);await p.getByRole('link',{name:'All games',exact:true}).click();await p.getByRole('link',{name:/The Grand Con/}).click();await expect(p.locator('.room-code')).toBeVisible();await p.goto('/');await expect(p).toHaveURL(/grand-con\.html/);await p.getByRole('link',{name:'← All games'}).click();await p.getByRole('link',{name:/Last Train/}).click();await expect(p.locator('.room-code')).toHaveText(initial.code);
  }finally{await c.close();}
});

test('seated public identities stay private and the role drawer supports drag, keyboard and live updates',async({browser},info)=>{
  const handler=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');
  const make=(action,data)=>call(handler,{action,requestId:crypto.randomUUID(),...data});
  const host=(await make('create',{name:'Sofa host'})).j,seats=[host];
  for(let i=1;i<12;i++)seats.push((await make('join',{code:host.code,name:'Traveller '+i})).j);
  let room=await store.load(host.code);rules.start(room);room.nightMode='legacy';rules.board(room);rules.beginNight(room);rules.advance(room);while(rules.nightRole(room)!=='saboteur')rules.advance(room);await store.save(room);
  const bad=room.players.filter(p=>rules.group(p)==='saboteur'),owner=seats.find(s=>s.meId===bad[0].id);
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  try{
    await context.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:owner.code,pid:owner.meId,tok:owner.tok});
    await context.route('**/api/last-train**',async route=>{const q=new URL(route.request().url()),req=route.request();const r=await call(handler,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(q.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});
    const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('/last-train.html');
    await expect(p.locator('.cabin-person')).toHaveCount(2);
    const expected=bad.filter(a=>a.id!==owner.meId).map(a=>({id:a.id,avatar:a.avatarIndex}));
    expect(await p.locator('.cabin-person').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.player,avatar:Number(n.querySelector('[data-avatar-index]').dataset.avatarIndex)})))).toEqual(expected);
    expect(new Set(expected.map(p=>p.avatar)).size).toBe(2);
    await expect(p.locator('.cabin-person [data-role-art]')).toHaveCount(0);
    const handle=p.locator('.drawer-handle'),content=p.locator('.drawer-content');
    const opened=()=>expect.poll(()=>p.locator('.role-dock').evaluate(n=>Math.abs(n.getBoundingClientRect().bottom-innerHeight))).toBeLessThan(2);
    const closed=()=>expect.poll(()=>handle.evaluate(n=>innerHeight-n.getBoundingClientRect().top)).toBeLessThan(51);
    await expect(handle).toHaveAttribute('aria-expanded','false');await expect(content).toHaveAttribute('aria-hidden','true');
    expect(await handle.evaluate(n=>innerHeight-n.getBoundingClientRect().top)).toBeLessThan(51);
    await handle.click();await expect(handle).toHaveAttribute('aria-expanded','true');await expect(content).toBeVisible();
    await handle.focus();await p.keyboard.press('ArrowDown');await expect(handle).toHaveAttribute('aria-expanded','false');await p.keyboard.press('ArrowUp');await expect(handle).toHaveAttribute('aria-expanded','true');await opened();
    // A real pointer drag survives the host's room update while held.
    let box=await handle.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+20);await p.mouse.down();await p.mouse.move(box.x+box.width/2,box.y+95,{steps:8});
    await p.evaluate(()=>{window.savedRoleDrawer=document.querySelector('.role-dock');});
    room=await store.load(host.code);room.notice='Still aboard.';await store.save(room);await expect(p.locator('.waiting')).toContainText('Still aboard.');
    expect(await p.evaluate(()=>window.savedRoleDrawer===document.querySelector('.role-dock'))).toBe(true);
    await p.mouse.up();await expect(handle).toHaveAttribute('aria-expanded','false');await closed();
    // Real touch input pulls the collapsed handle up.
    box=await handle.boundingBox();const cdp=await context.newCDPSession(p),x=box.x+box.width/2,y=box.y+22;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-100}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect(handle).toHaveAttribute('aria-expanded','true');await opened();await handle.focus();await p.keyboard.press('Escape');await expect(handle).toBeFocused();await expect(handle).toHaveAttribute('aria-expanded','false');await p.keyboard.press('Enter');await expect(handle).toHaveAttribute('aria-expanded','true');await p.keyboard.press('Enter');await expect(handle).toHaveAttribute('aria-expanded','false');
    room=await store.load(host.code);while(room.phase!=='discussion')rules.advance(room);await store.save(room);await expect(p.locator('.lounge-seat')).toHaveCount(12);
    expect(await p.locator('.lounge-seat').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.player,avatar:Number(n.querySelector('[data-avatar-index]').dataset.avatarIndex)})))).toEqual(room.seatOrder.map(id=>({id,avatar:room.players.find(p=>p.id===id).avatarIndex})));
    const captionsContained=async()=>expect(await p.locator('.lounge-room').evaluate(room=>{const b=room.getBoundingClientRect();return [...room.querySelectorAll('.seat-caption')].filter(n=>{const r=n.getBoundingClientRect();return r.top<b.top-1||r.bottom>b.bottom+1||r.left<b.left-1||r.right>b.right+1;}).map(n=>n.textContent);})).toEqual([]);
    await expect(p.locator('.sofa-row')).toHaveCount(3);await expect(p.locator('.lounge-seat [data-role-art]')).toHaveCount(0);await captionsContained();
    await p.screenshot({path:info.outputPath('seated-lounge-mobile.png'),fullPage:true});
    await p.setViewportSize({width:1240,height:960});await expect(p.locator('.sofa-row')).toHaveCount(2);await captionsContained();
    await p.setViewportSize({width:320,height:720});await expect(p.locator('.sofa-row')).toHaveCount(3);await captionsContained();
    expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('cabin controls keep patient identity private and vote cinema pauses without replay or a drifting drawer',async({browser},info)=>{
  const handler=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');
  const make=(action,data)=>call(handler,{action,requestId:crypto.randomUUID(),...data});
  const host=(await make('create',{name:'HUD host'})).j,seats=[host];for(let i=1;i<12;i++)seats.push((await make('join',{code:host.code,name:'Cabin '+i})).j);
  let room=await store.load(host.code);rules.start(room);room.nightMode='legacy';rules.board(room);rules.beginNight(room);rules.advance(room);while(rules.nightRole(room)!=='saboteur')rules.advance(room);await store.save(room);
  const bad=room.players.filter(p=>rules.group(p)==='saboteur'),medic=room.players.find(p=>p.role==='medic'),patient=room.players.find(p=>rules.group(p)==='passenger');
  const seat=p=>seats.find(s=>s.meId===p.id),contexts=[];
  const open=async(s)=>{const c=await browser.newContext({viewport:{width:390,height:844}});contexts.push(c);await c.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:s.code,pid:s.meId,tok:s.tok});await c.route('**/api/last-train**',async route=>{const q=new URL(route.request().url()),req=route.request(),r=await call(handler,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(q.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});const p=await c.newPage();await p.goto('/last-train.html');return p;};
  const post=async(action)=>{const r=await store.load(host.code);return call(handler,{action,code:host.code,pid:host.meId,tok:host.tok,match:r.match,round:r.round,step:r.step,requestId:crypto.randomUUID()});};
  try{
    const a=await open(seat(bad[0]));await expect(a.locator('.team-proposal')).toHaveCount(3);await expect(a.locator('.team-proposal[data-target=pending]')).toHaveCount(3);
    await a.getByRole('button',{name:'Choose Target',exact:true}).click();await a.getByRole('dialog').getByRole('button',{name:'Skip · nobody',exact:true}).click();await a.getByRole('dialog').getByRole('button',{name:'Confirm: Skip',exact:true}).click();
    await expect(a.locator('.team-proposal[data-voter="'+bad[0].id+'"]')).toHaveAttribute('data-target','skip');await expect(a.getByRole('button',{name:'Choose Target',exact:true})).toBeVisible();
    room=await store.load(host.code);for(const b of bad)rules.nightChoice(room,room.players.find(p=>p.id===b.id),{attackId:patient.id});rules.advance(room);await store.save(room);
    const m=await open(seat(medic));await expect(m.locator('.patient-scene')).toHaveAttribute('data-patient',patient.id);await expect(m.locator('.patient-body')).toHaveAttribute('data-avatar-index',String(patient.avatarIndex));await expect(a.locator('.patient-scene')).toHaveCount(0);
    await expect(m.getByRole('button',{name:'Heal '+patient.name,exact:true})).toBeInViewport();await expect(m.locator('.cabin-scene > .medic-console')).toBeVisible();expect(await m.locator('.medic-console').evaluate(n=>n.getBoundingClientRect().top>=document.querySelector('.cabin-view').getBoundingClientRect().bottom)).toBe(true);
    await m.setViewportSize({width:320,height:720});await expect(m.getByRole('button',{name:'Heal '+patient.name,exact:true})).toBeInViewport();expect(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await m.setViewportSize({width:390,height:844});
    room=await store.load(host.code);room.night.blockedId=medic.id;await store.save(room);await expect(m.locator('.patient-scene')).toHaveCount(0);expect((await read(m)).me.patientId).toBeNull();await expect(m.getByRole('heading',{name:'Your medicine is blocked.'})).toBeVisible();
    room=await store.load(host.code);room.night.blockedId=null;while(room.phase!=='voting')rules.advance(room);for(const p of rules.alive(room))rules.vote(room,p,{targetId:bad[0].id});await store.save(room);
    await expect(m.locator('.elimination-cinema')).toBeVisible();await expect(m.locator('.cinema-alignment')).toHaveText('BAD');
    await expect(m.locator('.drawer-handle')).toHaveAttribute('aria-expanded','false');
    await post('pause');await expect(m.locator('.elimination-cinema')).toHaveAttribute('data-paused','true');
    // The pause lasts longer than the cinematic, so a wall-clock timeout would fail.
    await m.waitForTimeout(5000);await expect(m.locator('.elimination-cinema')).toBeVisible();await post('resume');await expect(m.locator('.elimination-cinema')).toHaveCount(0,{timeout:7000});
    const dead=m.locator('.lounge-seat[data-player="'+bad[0].id+'"]');await expect(dead).toHaveClass(/alignment-bad/);await expect(dead.locator('.out-cross')).toBeVisible();await expect(dead.locator('.seated-traveller')).toHaveCount(1);await expect(m.locator('.lounge-seat[data-player="'+patient.id+'"]')).toHaveClass(/alignment-good/);
    await expect(m.locator('.inline-votes .vote-row')).toHaveCount(11);await expect(m.locator('.inline-votes .vote-person .portrait')).toHaveCount(12);expect(await m.locator('.inline-votes .vote-ledger').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length)).toBe(2);
    room=await store.load(host.code);room.notice='Votes are available below.';await store.save(room);await expect(m.locator('.waiting')).toContainText('Votes are available');await expect(m.locator('.elimination-cinema')).toHaveCount(0);
    await m.evaluate(()=>scrollTo(0,document.body.scrollHeight));expect(await m.locator('.drawer-handle').evaluate(n=>Math.abs(innerHeight-n.getBoundingClientRect().bottom))).toBeLessThan(2);
    await m.getByRole('button',{name:'Show role',exact:true}).click();await expect.poll(()=>m.locator('.role-dock').evaluate(n=>Math.abs(innerHeight-n.getBoundingClientRect().bottom))).toBeLessThan(2);await m.getByRole('button',{name:'Hide role',exact:true}).click();
    await m.screenshot({path:info.outputPath('vote-record-and-drawer-mobile.png')});
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});

test('private notebook preserves text and handwriting through polling, reload and turns without sharing notes',async({browser},info)=>{
  const handler=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');
  const make=(action,data)=>call(handler,{action,requestId:crypto.randomUUID(),...data});
  const host=(await make('create',{name:'Note host'})).j,seats=[host];for(let i=1;i<6;i++)seats.push((await make('join',{code:host.code,name:'Note '+i})).j);
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),payloads=[],errors=[];
  const connect=async(owner)=>{
    await context.addInitScript(s=>{if(!sessionStorage.getItem('notebook-seeded')){localStorage.setItem('lt-seat',JSON.stringify(s));sessionStorage.setItem('notebook-seeded','1');}},{code:owner.code,pid:owner.meId,tok:owner.tok});
    await context.route('**/api/last-train**',async route=>{const q=new URL(route.request().url()),req=route.request(),body=req.method()==='POST'?JSON.parse(req.postData()):null;if(body)payloads.push(body);const r=await call(handler,body,Object.fromEntries(q.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});
  };
  try{
    await connect(host);const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('/last-train.html');await p.getByRole('button',{name:'Open private notebook'}).click();
    const book=p.getByRole('dialog',{name:'My notebook'}),text=p.getByLabel('Your notes',{exact:true});await book.getByRole('button',{name:'Type',exact:true}).click();await text.fill('PRIVATE: cabin 4 changed their story.');await expect(book.getByRole('status')).toHaveText('Saved on this device');
    // A lobby note follows the player into their first journey without being reset.
    let room=await store.load(host.code);rules.start(room);room.nightMode='legacy';await store.save(room);await expect(p.locator('#lt-app')).toHaveAttribute('data-phase','briefing');await expect(text).toHaveValue('PRIVATE: cabin 4 changed their story.');await expect(book).toBeVisible();
    await book.getByRole('button',{name:'Draw',exact:true}).click();const canvas=book.locator('canvas'),box=await canvas.boundingBox();
    // Real touch events exercise pointer capture and touch-action, including a second finger.
    const cdp=await context.newCDPSession(p);const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id])=>({x,y,id,radiusX:3,radiusY:3,force:1}))});
    await touch('touchStart',[[box.x+30,box.y+50,1]]);await touch('touchMove',[[box.x+70,box.y+85,1]]);await touch('touchMove',[[box.x+110,box.y+45,1]]);await touch('touchStart',[[box.x+110,box.y+45,1],[box.x+160,box.y+100,2]]);await touch('touchEnd',[[box.x+110,box.y+45,1]]);await touch('touchEnd',[]);
    const notebookData=()=>p.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('lt-notebook:')))));
    expect((await notebookData()).strokes).toHaveLength(1);expect((await notebookData()).strokes[0].points.length).toBeGreaterThan(2);
    const ink=()=>canvas.evaluate(c=>{const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return pixels.some((n,i)=>i%4===3&&n>0);});expect(await ink()).toBe(true);
    await book.getByRole('button',{name:'Clear drawing',exact:true}).click();expect(await ink()).toBe(false);await book.getByRole('button',{name:'Undo',exact:true}).click();expect(await ink()).toBe(true);
    // Erasing is an undoable stroke, rather than deleting the whole notebook.
    await book.getByRole('button',{name:'Eraser',exact:true}).click();await p.mouse.move(box.x+70,box.y+85);await p.mouse.down();await p.mouse.move(box.x+100,box.y+75,{steps:4});await p.mouse.up();expect((await notebookData()).strokes.at(-1).tool).toBe('eraser');await book.getByRole('button',{name:'Undo',exact:true}).click();expect((await notebookData()).strokes).toHaveLength(1);
    await p.screenshot({path:info.outputPath('notebook-draw-mobile.png')});await p.reload();await p.getByRole('button',{name:'Open private notebook'}).click();await expect(p.getByLabel('Your notes',{exact:true})).toHaveValue('PRIVATE: cabin 4 changed their story.');await p.getByRole('dialog',{name:'My notebook'}).getByRole('button',{name:'Draw',exact:true}).click();expect(await ink()).toBe(true);
    await p.setViewportSize({width:320,height:720});expect(await ink()).toBe(true);expect(await p.getByRole('dialog',{name:'My notebook'}).evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
    await p.keyboard.press('Escape');await expect(p.getByRole('button',{name:'Open private notebook'})).toBeFocused();
    await p.evaluate(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:host.code,pid:seats[1].meId,tok:seats[1].tok});await p.goto('/last-train.html');await expect.poll(async()=>p.locator('#lt-app').getAttribute('data-phase')).toBe('briefing');await p.getByRole('button',{name:'Open private notebook'}).click();await expect(p.getByLabel('Your notes',{exact:true})).toHaveValue('');
    expect(JSON.stringify(payloads)).not.toContain('PRIVATE:');expect(JSON.stringify((await call(handler,null,{code:host.code,pid:host.meId},{'x-tok':host.tok})).j)).not.toContain('PRIVATE:');expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('host test mode adds five independent players, readies them and plays through night, discussion and voting',async({browser},info)=>{
  test.setTimeout(90000);
  const handler=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');
  const host=(await call(handler,{action:'create',name:'Human host',requestId:crypto.randomUUID()})).j;
  const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
  try{
    await context.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:host.code,pid:host.meId,tok:host.tok});
    await context.route('**/api/last-train**',async route=>{const req=route.request(),q=new URL(req.url());const r=await call(handler,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(q.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('/last-train.html?room='+host.code+'&test=1');
    const controls=p.getByRole('region',{name:'Test players'});await controls.getByRole('button',{name:'Add 5 test players'}).click();await expect(p.locator('.seat')).toHaveCount(6);await expect(controls.getByRole('status')).toContainText('5 test players');
    const pool=await p.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('lt-test-players:')))));expect(pool).toHaveLength(5);expect(new Set(pool.map(b=>b.pid)).size).toBe(5);expect(pool.every(b=>b.pid!==host.meId&&b.tok)).toBe(true);
    await p.reload();await expect(p.locator('.seat')).toHaveCount(6);await expect(controls.getByRole('status')).toContainText('Playing automatically');
    await p.screenshot({path:info.outputPath('test-players-lobby-mobile.png'),fullPage:true});
    await controls.getByRole('button',{name:'Stop autoplay'}).click();await expect(controls.getByRole('status')).toContainText('Stopped');await controls.getByRole('button',{name:'Resume autoplay'}).click();
    await p.getByRole('button',{name:'START JOURNEY'}).click();await expect.poll(async()=>Object.keys((await store.load(host.code)).ready||{}).length).toBe(5);
    await p.getByRole('button',{name:'I’m ready · board the train'}).click();await expect(p.locator('#lt-app')).toHaveAttribute('data-phase','boarding');
    let room=await store.load(host.code);rules.beginNight(room);rules.advance(room);await store.save(room);
    const botIds=new Set(pool.map(b=>b.pid));
    while(room.phase==='night'){
      const active=rules.nightRole(room);
      const acting=room.players.filter(a=>a.alive&&botIds.has(a.id)&&(active==='saboteur'?rules.group(a)==='saboteur':a.role===active));
      await expect.poll(async()=>{const r=await store.load(host.code);return acting.every(a=>active==='medic'?!!r.night.medicine:!!r.night.choices[a.id]);}).toBe(true);
      room=await store.load(host.code);rules.advance(room);await store.save(room);
    }
    while(room.phase!=='discussion'){rules.advance(room);}await store.save(room);
    let checkedSpeech=false;
    while(room.phase==='discussion'){
      const speaker=rules.speakerId(room);
      if(botIds.has(speaker)){
        checkedSpeech=true;const previousStep=room.step;
        await expect.poll(async()=>(await store.load(host.code)).step,{timeout:12000}).not.toBe(previousStep);
        room=await store.load(host.code);
      }else{rules.nextSpeaker(room);await store.save(room);}
    }
    expect(checkedSpeech).toBe(true);expect(room.phase).toBe('voting');await expect.poll(async()=>{const r=await store.load(host.code);return r.players.filter(a=>a.alive&&botIds.has(a.id)).every(a=>!!r.votes[a.id]);}).toBe(true);
    await p.goto('/last-train.html');await expect(p.getByRole('region',{name:'Test players'})).toHaveCount(0);
    // A guest never receives test controls even if they copy the test-mode URL.
    await p.evaluate(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:host.code,pid:pool[0].pid,tok:pool[0].tok});await context.clearCookies();
    const guest=await browser.newContext({viewport:{width:320,height:720}});await guest.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:host.code,pid:pool[0].pid,tok:pool[0].tok});await guest.route('**/api/last-train**',async route=>{const req=route.request(),q=new URL(req.url());const r=await call(handler,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(q.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});const gp=await guest.newPage();await gp.goto('/last-train.html?test=1');await expect(gp.locator('.room-code')).toHaveText(host.code);await expect(gp.getByRole('region',{name:'Test players'})).toHaveCount(0);await guest.close();
    expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('four-bot host links leave a friend seat, reuse saved bots and resize only owned bots',async({browser})=>{
  const api=require('../../api/last-train'),store=require('../../lib/last-train-store');
  const host=(await call(api,{action:'create',name:'Host with friend',requestId:crypto.randomUUID()})).j;
  const contexts=[];
  const open=async(seat)=>{
    const c=await browser.newContext({viewport:{width:390,height:844}});contexts.push(c);
    if(seat)await c.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:seat.code,pid:seat.meId,tok:seat.tok});
    await c.route('**/api/last-train**',async route=>{const req=route.request(),q=new URL(req.url());const r=await call(api,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(q.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});
    return c.newPage();
  };
  try{
    const p=await open(host),url='/last-train.html?room='+host.code+'&test=1&bots=4&autobots=1';await p.goto(url);const controls=p.getByRole('region',{name:'Test players'});
    await expect(p.locator('.seat')).toHaveCount(5);await expect(controls.getByRole('status')).toContainText('4 test players');
    const botIds=(await store.load(host.code)).players.filter(p=>p.name.startsWith('Bot ')).map(p=>p.id);
    await p.reload();await expect(p.locator('.seat')).toHaveCount(5);expect((await store.load(host.code)).players.filter(p=>p.name.startsWith('Bot ')).map(p=>p.id)).toEqual(botIds);
    const friend=await open();await friend.goto(url);await friend.getByLabel('Your name',{exact:true}).fill('My friend');await friend.getByRole('button',{name:'Join room',exact:true}).click();await expect(friend.locator('.seat')).toHaveCount(6);await expect(friend.getByRole('region',{name:'Test players'})).toHaveCount(0);
    const friendId=(await read(friend)).meId;await expect(p.locator('.seat')).toHaveCount(6);
    // A former five-bot setup is reduced to four without removing either human.
    await p.goto(url.replace('bots=4','bots=5'));await expect(p.locator('.seat')).toHaveCount(7);await expect(controls.getByRole('status')).toContainText('5 test players');
    await p.goto(url);await expect(p.locator('.seat')).toHaveCount(6);await expect(controls.getByRole('status')).toContainText('4 test players');
    const room=await store.load(host.code);expect(room.players.filter(p=>p.name.startsWith('Bot ')).map(p=>p.id)).toEqual(botIds);expect(room.players.some(p=>p.id===friendId)).toBe(true);expect(room.players.some(p=>p.id===host.meId)).toBe(true);
    await p.getByRole('button',{name:'START JOURNEY',exact:true}).click();await expect(p.getByRole('heading',{name:'Meet the two teams.'})).toBeVisible();expect((await read(p)).counts.saboteur).toBe(2);
    await expect.poll(async()=>{const r=await store.load(host.code);return botIds.every(id=>r.ready[id]);}).toBe(true);
    await p.goto(url.replace('bots=4','bots=1'));await expect(p.getByRole('heading',{name:'Meet the two teams.'})).toBeVisible();expect((await store.load(host.code)).players).toHaveLength(6);
    expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});

test('test mode chats once per turn and removes only its five seats from the lobby',async({browser})=>{
  const handler=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');
  const host=(await call(handler,{action:'create',name:'Chat host',requestId:crypto.randomUUID()})).j;
  const context=await browser.newContext({viewport:{width:320,height:720}});
  try{
    await context.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:host.code,pid:host.meId,tok:host.tok});
    await context.route('**/api/last-train**',async route=>{const req=route.request(),q=new URL(req.url());const r=await call(handler,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(q.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});
    const p=await context.newPage();await p.goto('/last-train.html?test=1');const controls=p.getByRole('region',{name:'Test players'});await controls.getByRole('button',{name:'Add 5 test players'}).click();await expect(p.locator('.seat')).toHaveCount(6);
    expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await controls.getByRole('button',{name:'Remove test players'}).click();await expect(p.locator('.seat')).toHaveCount(1);expect((await store.load(host.code)).players.map(p=>p.id)).toEqual([host.meId]);
    await controls.getByRole('button',{name:'Add 5 test players'}).click();await expect(p.locator('.seat')).toHaveCount(6);
    let room=await store.load(host.code);room.settings.discussion='chat';rules.start(room);room.nightMode='legacy';rules.beginDiscussion(room);room.speakingOrder=[...room.players.filter(p=>p.id!==host.meId).map(p=>p.id),host.meId];await store.save(room);
    await expect.poll(async()=>(await store.load(host.code)).speeches.length).toBe(1);room=await store.load(host.code);const first=room.speeches[0];expect(first.text).toMatch(/I'm (?:Inspector|Medic|Witness|Careful Passenger|Brave Passenger|Speaker|Trainee|a Passenger)/);expect(first.id).not.toBe(host.meId);
    // A new speaker gets a distinct single statement; the first is never duplicated.
    await expect.poll(async()=>(await store.load(host.code)).speeches.length).toBe(2);room=await store.load(host.code);expect(new Set(room.speeches.map(s=>s.id)).size).toBe(2);
    await expect(controls.getByRole('button',{name:'Remove test players'})).toBeDisabled();
  }finally{await context.close();}
});

for(const count of [5,6])test(count+' players can start and replay with the correct team counts',async({browser})=>{
  const handler=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');
  const enter=(action,data)=>call(handler,{action,requestId:crypto.randomUUID(),...data});
  const host=(await enter('create',{name:'Small host'})).j;
  for(let i=1;i<4;i++)await enter('join',{code:host.code,name:'Guest '+i});
  const context=await browser.newContext({viewport:{width:320,height:720}});
  try{
    await context.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:host.code,pid:host.meId,tok:host.tok});
    await context.route('**/api/last-train**',async route=>{const req=route.request(),q=new URL(req.url());const r=await call(handler,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(q.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});
    const p=await context.newPage();await p.goto('/last-train.html');await expect(p.getByRole('button',{name:'START JOURNEY'})).toBeDisabled();await expect(p.getByText('1 more needed to start.',{exact:true})).toBeVisible();
    const early=await enter('start',{code:host.code,pid:host.meId,tok:host.tok,match:0,round:0,step:0});expect(early.s).toBe(409);expect(early.j.error).toContain('5–12');
    for(let i=4;i<count;i++)await enter('join',{code:host.code,name:'Guest '+i});await expect(p.locator('.seat')).toHaveCount(count);await expect(p.getByRole('button',{name:'START JOURNEY'})).toBeEnabled();
    const badCount=count===5?1:2;await expect(p.locator('.role-mix > span').filter({hasText:'Saboteur'})).toContainText(badCount+'×');
    if(count===6){await p.getByRole('button',{name:'Choose roles',exact:true}).click();const d=p.getByRole('dialog');await expect(d.locator('.role-budget')).toHaveText('2 Passengers2 Crew2 Saboteurs');await expect(d.locator('.role-option').filter({has:p.getByText('Medic',{exact:true})}).getByRole('checkbox')).toBeChecked();await d.getByRole('button',{name:'Use these roles'}).click();}
    await p.getByRole('button',{name:'START JOURNEY'}).click();await expect(p.getByRole('heading',{name:'Meet the two teams.'})).toBeVisible();const view=await read(p);expect(view.counts).toEqual(count===6?{passenger:2,crew:2,saboteur:2}:{passenger:3,crew:1,saboteur:1});expect(view.me.role).toBeNull();expect(view.players.every(a=>!a.role)).toBe(true);
    // Replay at the new minimum uses the same rules as the initial deal.
    const room=await store.load(host.code);room.phase='finished';room.winner='good';room.winReason='Test game finished.';room.deadline=null;await store.save(room);await expect(p.getByRole('button',{name:'PLAY AGAIN'})).toBeEnabled();await p.getByRole('button',{name:'PLAY AGAIN'}).click();await expect(p.getByRole('heading',{name:'Meet the two teams.'})).toBeVisible();expect((await read(p)).counts).toEqual(view.counts);expect((await read(p)).match).toBe(2);
    expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{await context.close();}
});

test('host picks normal Passengers and Crew, then edits the next mix without changing the completed game',async({browser},info)=>{
  const api=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');
  const make=(action,data)=>call(api,{action,requestId:crypto.randomUUID(),...data});const host=(await make('create',{name:'Role host'})).j;
  for(let i=1;i<12;i++)await make('join',{code:host.code,name:'Cast '+i});
  const c=await browser.newContext({viewport:{width:390,height:844}});
  try{
    await c.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:host.code,pid:host.meId,tok:host.tok});await c.route('**/api/last-train**',async route=>{const req=route.request(),u=new URL(req.url());const r=await call(api,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(u.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});const p=await c.newPage();await p.goto('/last-train.html');
    await p.getByRole('button',{name:'Choose roles',exact:true}).click();const d=p.getByRole('dialog');await d.getByRole('button',{name:'All normal',exact:true}).click();
    for(const name of ['Trainee','Inspector'])await d.locator('.role-option').filter({has:p.getByText(name,{exact:true})}).getByRole('checkbox').uncheck();
    await d.locator('.bad-picker .role-option').filter({hasText:'Normal Saboteurs only.'}).getByRole('radio').check();await d.getByRole('button',{name:'Use these roles',exact:true}).click();
    await expect(p.locator('.role-mix')).toContainText('8×Passenger');const settings=(await read(p)).settings.roles;expect(settings).toEqual({crew:['medic'],passengers:[],saboteur:'normal'});
    await p.getByRole('button',{name:'START JOURNEY'}).click();await expect(p.locator('.introduced-role')).toHaveCount(3);let room=await store.load(host.code);rules.board(room);rules.beginNight(room);rules.advance(room);await store.save(room);await expect(p.locator('#lt-app')).toHaveAttribute('data-night-role','saboteur');
    rules.remove(room,room.players.filter(a=>rules.group(a)==='crew').map(a=>a.id));room.phase='finished';room.deadline=null;await store.save(room);await expect(p.locator('.winner-person')).toHaveCount(3);await expect(p.locator('.standing-traveller')).toHaveCount(3);await expect(p.locator('.role-dock')).toHaveCount(0);await expect(p.getByRole('button',{name:'PLAY AGAIN'})).toBeEnabled();
    const before=room.players.map(a=>({id:a.id,role:a.role}));await p.getByRole('button',{name:'Choose roles',exact:true}).click();await p.getByRole('dialog').locator('.role-option').filter({has:p.getByText('Inspector',{exact:true})}).getByRole('checkbox').check();await p.getByRole('dialog').getByRole('button',{name:'Use these roles'}).click();await expect.poll(async()=>((await read(p)).settings.roles.crew.length)).toBe(2);expect((await store.load(host.code)).players.map(a=>({id:a.id,role:a.role}))).toEqual(before);
    await p.getByRole('button',{name:'PLAY AGAIN'}).click();await expect(p.getByRole('heading',{name:'Meet the two teams.'})).toBeVisible();expect((await read(p)).counts).toEqual({passenger:7,crew:2,saboteur:3});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{await c.close();}
});

test('a five-player host can choose Medic in the single Crew slot and never choose Blocker',async({browser})=>{
  const api=require('../../api/last-train');const make=(action,data)=>call(api,{action,requestId:crypto.randomUUID(),...data});const host=(await make('create',{name:'Five host'})).j;for(let i=1;i<5;i++)await make('join',{code:host.code,name:'Five '+i});
  const c=await browser.newContext({viewport:{width:320,height:720}});
  try{
    await c.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:host.code,pid:host.meId,tok:host.tok});await c.route('**/api/last-train**',async route=>{const req=route.request(),u=new URL(req.url());const r=await call(api,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(u.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});const p=await c.newPage();await p.goto('/last-train.html');await p.getByRole('button',{name:'Choose roles',exact:true}).click();const d=p.getByRole('dialog');await d.locator('.role-option').filter({has:p.getByText('Medic',{exact:true})}).getByRole('radio').check();await expect(d.locator('.bad-picker .role-option')).toHaveCount(1);await d.getByRole('button',{name:'All normal'}).click();await d.getByRole('button',{name:'Use these roles'}).click();await expect.poll(async()=>(await read(p)).settings.roles.crew).toEqual(['medic']);await expect(p.locator('.role-mix')).toContainText('3×Passenger');expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{await c.close();}
});

test('night accordions retain their state and the larger colored notebook prevents page selection',async({browser},info)=>{
  const api=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');const make=(action,data)=>call(api,{action,requestId:crypto.randomUUID(),...data});const host=(await make('create',{name:'Archive host'})).j;for(let i=1;i<12;i++)await make('join',{code:host.code,name:'Reader '+i});
  let room=await store.load(host.code);room.settings.discussion='chat';rules.start(room);room.nightMode='legacy';rules.beginNight(room);const good=room.players.find(p=>p.role==='medic'),bad=room.players.find(p=>p.role==='saboteur');const out1=rules.remove(room,[good.id]),out2=rules.remove(room,[bad.id]);room.round=2;rules.beginDiscussion(room);room.deadline=Date.now()+120000;room.history=[{round:1,type:'night',outs:out1},{round:1,type:'vote',outs:out2,votes:[],reason:'voted'},{round:2,type:'night',outs:[]}];room.speeches=[{round:1,id:host.meId,text:'Yesterday’s conversation.'},{round:2,id:host.meId,text:'Today’s conversation.'}];await store.save(room);
  const c=await browser.newContext({viewport:{width:390,height:844}});
  try{
    await c.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:host.code,pid:host.meId,tok:host.tok});await c.route('**/api/last-train**',async route=>{const req=route.request(),u=new URL(req.url());const r=await call(api,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(u.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});const p=await c.newPage();await p.goto('/last-train.html');const old=p.locator('[data-details=chat-night-1]'),now=p.locator('[data-details=chat-night-2]');await expect(old).toHaveJSProperty('open',false);await expect(now).toHaveJSProperty('open',true);await old.locator('summary').click();await now.locator('summary').click();room=await store.load(host.code);room.notice='Archive update';await store.save(room);await expect(p.locator('.waiting')).toContainText('Archive update');await expect(old).toHaveJSProperty('open',true);await expect(now).toHaveJSProperty('open',false);await expect(p.locator('.journey-log .night-accordion')).toHaveCount(2);
    const view=await read(p);expect(view.players.filter(p=>!p.alive).every(p=>!p.role&&!p.group)).toBe(true);expect(view.history.flatMap(e=>e.outs).every(p=>!p.role&&!p.group)).toBe(true);expect(view.counts).toEqual({passenger:6,crew:3,saboteur:3});
    await p.getByRole('button',{name:'Open private notebook'}).click();const book=p.getByRole('dialog',{name:'My notebook'});await book.getByRole('button',{name:'Draw',exact:true}).click();await book.getByRole('button',{name:'Ruby ink',exact:true}).click();const canvas=book.locator('canvas'),bounds=await canvas.boundingBox();expect(bounds.height).toBeGreaterThan(400);await p.mouse.move(bounds.x+35,bounds.y+60);await p.mouse.down();await p.mouse.move(bounds.x+130,bounds.y+110,{steps:10});await p.mouse.up();await expect(book.getByRole('status')).toHaveText('Saved on this device');expect(await p.evaluate(()=>getSelection().toString())).toBe('');
    const note=await p.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('lt-notebook:')))));expect(note.strokes[0].color).toBe('#a22d46');expect(await canvas.evaluate(c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=0;i<a.length;i+=4)if(a[i]>a[i+1]+30&&a[i+3]>100)return true;return false;})).toBe(true);await book.getByRole('button',{name:'Eraser',exact:true}).click();await book.getByRole('button',{name:'Blue ink',exact:true}).click();await expect(book.locator('[data-note-tool=pen]')).toHaveAttribute('aria-pressed','true');await p.screenshot({path:info.outputPath('notebook-large-colors.png')});await p.keyboard.press('Escape');await p.reload();await p.getByRole('button',{name:'Open private notebook'}).click();await p.getByRole('dialog',{name:'My notebook'}).getByRole('button',{name:'Draw',exact:true}).click();expect(await canvas.evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((n,i)=>i%4===3&&n>0))).toBe(true);
  }finally{await c.close();}
});

test('bot discussion reports an actual check, remembered heal and door lock while Saboteurs claim good roles',async({browser})=>{
  const handler=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');
  const host=(await call(handler,{action:'create',name:'Benny',requestId:crypto.randomUUID()})).j;
  const c=await browser.newContext({viewport:{width:390,height:844}});
  try{
    await c.addInitScript(s=>localStorage.setItem('lt-seat',JSON.stringify(s)),{code:host.code,pid:host.meId,tok:host.tok});
    await c.route('**/api/last-train**',async route=>{const req=route.request(),q=new URL(req.url());const r=await call(handler,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(q.searchParams),req.headers());await route.fulfill({status:r.s,contentType:'application/json',body:JSON.stringify(r.j)});});
    const p=await c.newPage();await p.goto('/last-train.html?test=1');const controls=p.getByRole('region',{name:'Test players'});await controls.getByRole('button',{name:'Add 5 test players'}).click();await expect(p.locator('.seat')).toHaveCount(6);
    await controls.getByRole('button',{name:'Stop autoplay',exact:true}).click();
    let room=await store.load(host.code);room.settings.discussion='chat';rules.start(room);room.nightMode='legacy';
    const [human,inspector,medic,careful,bad,ally]=room.players;
    for(const [i,role] of ['witness','inspector','medic','careful','saboteur','saboteur'].entries())Object.assign(room.players[i],{role,originalRole:role});
    rules.beginNight(room);rules.advance(room);rules.nightChoice(room,careful,{power:'lock'});rules.advance(room);
    for(const b of [bad,ally])rules.nightChoice(room,b,{attackId:human.id});rules.advance(room);await store.save(room);
    await expect(p.locator('#lt-app')).toHaveAttribute('data-night-role','medic');await controls.getByRole('button',{name:'Resume autoplay',exact:true}).click();
    await expect.poll(async()=>(await store.load(host.code)).night.medicine?.power).toBe('heal');
    room=await store.load(host.code);rules.advance(room);rules.nightChoice(room,room.players.find(a=>a.id===inspector.id),{power:'check',targetId:bad.id});
    while(room.phase==='night')rules.advance(room);room.deadline=Date.now()+120000;await store.save(room);
    // The Medic's private action survives a host refresh without publishing medicine in normal room state.
    await expect.poll(()=>p.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('lt-test-players:'));return JSON.parse(localStorage.getItem(k)||'[]').find(b=>b.memory?.medicine?.power==='heal')?.memory.medicine.targetId;})).toBe(human.id);
    await p.reload();await expect(p.locator('#lt-app')).toHaveAttribute('data-phase','gathering');
    room=await store.load(host.code);rules.beginDiscussion(room);room.speakingOrder=[inspector.id,medic.id,careful.id,bad.id,ally.id,human.id];await store.save(room);
    const speech=async id=>(await store.load(host.code)).speeches.find(s=>s.id===id)?.text;
    await expect.poll(()=>speech(inspector.id)).toBe("I'm Inspector. I checked "+bad.name+' last night: BAD.');
    await expect.poll(()=>speech(medic.id)).toBe("I'm Medic. I used my heal on Benny last night.");
    await expect.poll(()=>speech(careful.id)).toBe("I'm Careful Passenger. I used my door lock last night.");
    await expect.poll(()=>speech(bad.id)).toMatch(/^I'm (?:Inspector|Medic|Witness|Careful Passenger|Brave Passenger|Speaker|a Passenger)/);
    expect(await speech(bad.id)).not.toContain(ally.name);room=await store.load(host.code);expect(room.speeches.length).toBeGreaterThanOrEqual(4);expect(new Set(room.speeches.map(s=>s.id)).size).toBe(room.speeches.length);
  }finally{await c.close();}
});
