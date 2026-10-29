const {test,expect}=require('@playwright/test');
const games=[{page:'reckoning',key:'sct',min:2,start:/deal.*cards/i},{page:'last-train',key:'lt-seat',min:5,start:'Start Journey'},{page:'grand-con',key:'gc-seat',min:4,start:'START GAME'}];
for(const game of games)for(const width of [320,390,1100])test(game.page+': host practice controls at '+width,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'+game.page+'.html');await expect(page.locator('.pf-bot-controls')).toHaveCount(0);
  await page.getByLabel('Your name',{exact:true}).fill('Host');await page.getByRole('button',{name:/^Create (a new room|A Room|a Room|a room)$/}).click();
  const controls=page.locator('.pf-bot-controls');await expect(controls).toBeVisible();
  const read=()=>page.evaluate(async({game,key})=>{const s=JSON.parse(localStorage.getItem(key));const r=await fetch('/api/'+(game==='reckoning'?'game':game)+'?code='+s.code+'&pid='+s.pid,{headers:{'x-tok':s.tok}});return r.json();},{game:game.page,key:game.key});
  await controls.getByRole('button',{name:'Add a bot',exact:true}).click();
  await expect.poll(async()=>(await read()).players.filter(p=>p.bot).length).toBe(1);
  await expect(controls.getByRole('button',{name:'Remove a bot',exact:true})).toBeVisible();
  await controls.getByRole('button',{name:'Remove a bot',exact:true}).click();
  await expect.poll(async()=>(await read()).players.filter(p=>p.bot).length).toBe(0);
  for(let i=1;i<game.min;i++){
    await controls.getByRole('button',{name:'Add a bot',exact:true}).click();
    await expect.poll(async()=>(await read()).players.filter(p=>p.bot).length).toBe(i);
  }
  await page.reload();await expect(controls).toBeVisible();
  expect((await read()).players.filter(p=>p.bot)).toHaveLength(game.min-1);
  const bounds=await controls.getByRole('button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};}));
  for(const r of bounds){expect(r.left).toBeGreaterThanOrEqual(0);expect(r.right).toBeLessThanOrEqual(width);expect(r.height).toBeGreaterThanOrEqual(44);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await controls.evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));await page.screenshot({path:testInfo.outputPath('practice-controls.png')});
  if(width===390){
    await page.evaluate(()=>localStorage.setItem('sct-lang','zh'));await page.reload();
    await expect(controls.getByRole('button',{name:'添加电脑玩家',exact:true})).toBeVisible();
    await expect(controls.getByRole('button',{name:'移除电脑玩家',exact:true})).toBeVisible();
    await page.evaluate(()=>localStorage.setItem('sct-lang','en'));await page.reload();
  }
  await page.evaluate(async({game,key})=>{const s=JSON.parse(localStorage.getItem(key));const url='/api/'+(game==='reckoning'?'game':game);const st=await(await fetch(url+'?code='+s.code+'&pid='+s.pid,{headers:{'x-tok':s.tok}})).json();await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-tok':s.tok},body:JSON.stringify({...s,action:game==='reckoning'?'deal':'start',requestId:crypto.randomUUID(),match:st.match||0,round:st.round||0,step:st.step||0})});},{game:game.page,key:game.key});
  await expect(controls).toHaveCount(0,{timeout:10000});
  expect(errors).toEqual([]);
});
