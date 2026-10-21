const {test,expect}=require('@playwright/test');
const {call}=require('../helpers');
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
    await nightTurn(host,'saboteur');const states=await Promise.all(pages.map(read)),bad=states.map((s,i)=>({s,i})).filter(x=>x.s.me.group==='saboteur');
    const wi=states.findIndex(s=>s.me.role==='witness'),mi=states.findIndex(s=>s.me.role==='medic'),ii=states.findIndex(s=>s.me.role==='inspector'),bi=states.findIndex(s=>s.me.role==='brave'),ci=states.findIndex(s=>s.me.role==='careful');
    for(const b of bad){await nightTurn(pages[b.i],'saboteur');await expect(pages[b.i].locator('.cabin-person')).toHaveCount(2);await choose(pages[b.i],'Choose attack or Skip','Player '+bad[0].i);}
    const team=pages[bad[0].i];if(!await team.locator('.team-chat').evaluate(n=>n.open))await team.locator('.team-chat summary').click();await team.getByLabel('Whisper to your team',{exact:true}).fill('Same target, team.');await team.getByRole('button',{name:'Send',exact:true}).click();await expect(pages[bad[1].i].getByRole('log',{name:'Private Saboteur chat'})).toContainText('Same target, team.');
    await team.screenshot({path:info.outputPath('journey-saboteur-cabin-mobile.png'),fullPage:true});
    const witness=pages[wi];await expect(witness.locator('.cabin-person')).toHaveCount(0);await expect(witness.getByLabel('Private Saboteur chat')).toHaveCount(0);await expect(witness.locator('.role-dock')).toBeVisible();expect(await witness.locator('[data-role-art]').evaluateAll(nodes=>nodes.every(n=>n.dataset.roleArt==='witness'))).toBe(true);await expect(witness.locator('.cabin-scene picture source')).toHaveAttribute('srcset','/last-train/cabin-mobile.webp');
    await nightTurn(host,'medic');const medic=pages[mi];await nightTurn(medic,'medic');await expect(medic.getByRole('button',{name:'Heal Player '+bad[0].i,exact:true})).toBeVisible();
    await expect(medic.locator('.patient-heading [data-portrait-set=passengers]')).toHaveCount(1);expect(await medic.locator('[data-role-art]').evaluateAll(nodes=>nodes.every(n=>n.dataset.roleArt==='medic'))).toBe(true);await medic.screenshot({path:info.outputPath('journey-medic-cabin-mobile.png'),fullPage:true});await choose(medic,'Poison someone','Player '+bad[1].i);await expect(medic.locator('.choice-saved')).toContainText('Poison saved');
    await nightTurn(host,'brave');await nightTurn(pages[bi],'brave');await pages[bi].getByRole('button',{name:'Skip · save my power',exact:true}).click();
    await nightTurn(host,'careful');await nightTurn(pages[ci],'careful');await pages[ci].getByRole('button',{name:'Skip · save my power',exact:true}).click();
    await nightTurn(host,'inspector');await nightTurn(pages[ii],'inspector');await choose(pages[ii],'Choose someone to check','Player '+bad[2].i);
    await nightTurn(host,'witness');await nightTurn(witness,'witness');await witness.getByRole('button',{name:'Watch tonight',exact:true}).click();
    await expect(host.locator('.lounge-scene')).toBeVisible({timeout:27000});await expect(host.locator('#lt-app')).toHaveAttribute('data-phase','morning',{timeout:10000});await expect(host.locator('.morning-reveal .revealed-out')).toHaveCount(2);
    await witness.getByRole('button',{name:'Reports (1)',exact:true}).click();await expect(witness.getByRole('dialog')).toContainText('The Saboteurs tried to attack Player '+bad[0].i);await witness.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
    await expect(host.locator('#lt-app')).toHaveAttribute('data-phase','discussion',{timeout:13000});
    const discussion=await read(host),order=discussion.speakingOrder;expect(order.length).toBe(10);expect(order).toEqual(discussion.players.filter(p=>p.alive).map(p=>p.id));
    await host.screenshot({path:info.outputPath('journey-lounge-desktop.png'),fullPage:true});
    const small=pages[wi];await small.setViewportSize({width:320,height:720});expect(await small.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await small.screenshot({path:info.outputPath('journey-lounge-small.png'),fullPage:true});await small.setViewportSize({width:390,height:844});
    for(const id of order){const i=states.findIndex(s=>s.meId===id),p=pages[i];await expect(p.getByRole('heading',{name:'It’s your turn.'})).toBeVisible();await expect(p.locator('.lounge-seat.speaking')).toHaveAttribute('data-player',id);await p.getByRole('button',{name:'I’m done speaking',exact:true}).click();}
    await expect(host.locator('#lt-app')).toHaveAttribute('data-phase','voting');
    for(const id of order){const p=pages[states.findIndex(s=>s.meId===id)];await expect(p.locator('.inline-votes')).toHaveCount(0);await choose(p,'Choose a player or Skip','Player '+bad[2].i);}
    await expect(host.locator('#lt-app')).toHaveAttribute('data-phase','voteResult');await expect(host.locator('.ejection-reveal .alignment-stamp')).toHaveText('BAD · SABOTEUR');await expect(host.locator('.inline-votes .vote-row')).toHaveCount(10);await host.screenshot({path:info.outputPath('journey-vote-reveal.png'),fullPage:true});
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
  let room=await store.load(host.code);room.settings.discussion='chat';rules.start(room);while(room.phase!=='discussion')rules.advance(room);await store.save(room);
  const first=seats.find(s=>s.meId===room.speakingOrder[0]),second=seats.find(s=>s.meId===room.speakingOrder[1]);const contexts=[];
  const post=async(s,action,extra={})=>{const room=await store.load(host.code);return call(handler,{action,code:host.code,pid:s.meId,tok:s.tok,match:room.match,round:room.round,step:room.step,requestId:crypto.randomUUID(),...extra});};
  const expire=async()=>{const room=await store.load(host.code);room.deadline=Date.now()-1;await store.save(room);return call(handler,null,{code:host.code,pid:host.meId},{'x-tok':host.tok});};
  try{
    const pages=[];for(const s of [first,second]){const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});contexts.push(c);await c.addInitScript(seat=>localStorage.setItem('lt-seat',JSON.stringify(seat)),{code:s.code,pid:s.meId,tok:s.tok});await c.route('**/api/last-train**',async route=>{const q=new URL(route.request().url()),req=route.request();const result=await call(handler,req.method()==='POST'?JSON.parse(req.postData()):null,Object.fromEntries(q.searchParams),req.headers());await route.fulfill({status:result.s,contentType:'application/json',body:JSON.stringify(result.j)});});const p=await c.newPage();pages.push(p);await p.goto('/last-train.html');}
    const [a,b]=pages;await expect(a.getByLabel('Your findings',{exact:true})).toBeVisible();await expect(b.getByLabel('Your findings',{exact:true})).toHaveCount(0);
    await a.getByLabel('Your findings',{exact:true}).fill('I am watching seat four.');await a.getByRole('button',{name:'Share findings',exact:true}).click();await expect(b.getByRole('log',{name:'Shared findings'})).toContainText('I am watching seat four.');
    await expire();await expect(b.getByLabel('Your findings',{exact:true})).toBeVisible();await b.getByLabel('Your findings',{exact:true}).fill('This draft survives a pause.');await post(host,'pause');await expect(b.locator('.pause-banner')).toBeVisible();await expect(b.getByLabel('Your findings',{exact:true})).toBeDisabled();await post(host,'resume');await expect(b.getByLabel('Your findings',{exact:true})).toHaveValue('This draft survives a pause.');
    await b.getByLabel('Your findings',{exact:true}).fill('<img src=x onerror=alert(1)> is only a story.');await b.getByRole('button',{name:'Share findings',exact:true}).click();await expect(a.getByRole('log',{name:'Shared findings'})).toContainText('<img src=x onerror=alert(1)>');await expect(a.locator('.public-message img')).toHaveCount(0);await b.screenshot({path:info.outputPath('journey-ordered-chat-mobile.png'),fullPage:true});
    for(let i=0;i<5;i++)await expire();room=await store.load(host.code);expect(room.phase).toBe('voting');
    await expect(a.locator('#lt-app')).toHaveAttribute('data-phase','voting');await a.getByRole('button',{name:'Choose a player or Skip',exact:true}).click();await expect(a.getByRole('dialog')).toBeVisible();
    for(const s of seats)await post(s,'vote',{targetId:null});await expect(a.locator('#lt-app')).toHaveAttribute('data-phase','voteResult');await expect(a.locator('.inline-votes .vote-row')).toHaveCount(6);await expect(a.getByRole('dialog')).toHaveCount(0);await expire();await expect(a.locator('.cabin-scene')).toBeVisible();await expect(a.locator('#lt-app')).toHaveAttribute('data-phase','settling');expect((await store.load(host.code)).round).toBe(2);
    await a.screenshot({path:info.outputPath('journey-return-to-cabin.png'),fullPage:true});
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
test('private recovery rotates the old phone and saved games stay independent',async({page,browser})=>{
  await page.goto('/last-train.html');await page.getByLabel('Your name',{exact:true}).fill('Returnee');await page.getByRole('button',{name:'Create a room',exact:true}).click();await expect(page.locator('.room-code')).toBeVisible();const initial=await read(page);await page.getByRole('button',{name:'Rejoin code',exact:true}).click();await expect(page.getByLabel('Rejoin code',{exact:true})).toHaveValue(initial.me.recoveryCode);await page.keyboard.press('Escape');
  const c=await browser.newContext();try{const p=await c.newPage();await p.goto('/last-train.html?room='+initial.code);await p.getByLabel('Your name',{exact:true}).fill('Returnee');await p.getByText('Rejoin on another phone',{exact:true}).click();await p.getByLabel('Rejoin code',{exact:true}).fill(initial.me.recoveryCode);await p.getByRole('button',{name:'Join room',exact:true}).click();await expect(p.locator('.room-code')).toHaveText(initial.code);await expect(page.getByRole('heading',{name:'Catch the last train.'})).toBeVisible();
    await p.evaluate(async()=>{const make=async(url,name)=>{const v=await(await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',name,requestId:crypto.randomUUID()})})).json();return{code:v.code,pid:v.meId,tok:v.tok};};localStorage.setItem('gc-seat',JSON.stringify(await make('/api/grand-con','Con tester')));localStorage.setItem('sct',JSON.stringify(await make('/api/game','Row tester')));localStorage.setItem('arcade-last-game','last-train');});
    await p.goto('/');await expect(p).toHaveURL(/last-train\.html/);await expect(p.locator('.room-code')).toHaveText(initial.code);await p.getByRole('link',{name:'← All games'}).click();await p.getByRole('link',{name:/The Grand Con/}).click();await expect(p.locator('.room-code')).toBeVisible();await p.goto('/');await expect(p).toHaveURL(/grand-con\.html/);await p.getByRole('link',{name:'← All games'}).click();await p.getByRole('link',{name:/Last Train/}).click();await expect(p.locator('.room-code')).toHaveText(initial.code);
  }finally{await c.close();}
});

test('seated public identities stay private and the role drawer supports drag, keyboard and live updates',async({browser},info)=>{
  const handler=require('../../api/last-train'),rules=require('../../lib/last-train-rules'),store=require('../../lib/last-train-store');
  const make=(action,data)=>call(handler,{action,requestId:crypto.randomUUID(),...data});
  const host=(await make('create',{name:'Sofa host'})).j,seats=[host];
  for(let i=1;i<12;i++)seats.push((await make('join',{code:host.code,name:'Traveller '+i})).j);
  let room=await store.load(host.code);rules.start(room);rules.board(room);rules.beginNight(room);rules.advance(room);await store.save(room);
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
    await expect(p.locator('.sofa-row')).toHaveCount(3);await expect(p.locator('.lounge-seat [data-role-art]')).toHaveCount(0);
    await p.screenshot({path:info.outputPath('seated-lounge-mobile.png'),fullPage:true});
    await p.setViewportSize({width:1240,height:960});await expect(p.locator('.sofa-row')).toHaveCount(2);
    await p.setViewportSize({width:320,height:720});await expect(p.locator('.sofa-row')).toHaveCount(3);
    expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  }finally{await context.close();}
});
