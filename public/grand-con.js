(() => {
  'use strict';
  const root=document.getElementById('gc-app');
  const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
  const store=(key,value)=>{try{value?localStorage.setItem(key,JSON.stringify(value)):localStorage.removeItem(key);}catch{}};
  const invitation=new URLSearchParams(location.search).get('room')?.toUpperCase()||'';
  let seat=read('gc-seat'),state=null,busy=false,error='',connected=true,pollTimer,showPrivate=false,rulesDialog;
  if(seat&&!seat.tok)seat=null;
  if(invitation&&seat?.code!==invitation){seat=null;store('gc-seat',null);}
  if(seat)try{localStorage.setItem('arcade-last-game','grand-con');}catch{}
  let claimDraft='',claimChoice='unsure',auditTarget='';
  let name=read('gc-name')||'',code=invitation,recover='',draftKey='',targetId='',choice='',renderedScene='',renderedPrivate=false,renderedScore=null;
  const teamName=team=>team==='house'?'Truth Team':'Lie Team';
  const voteName=choice=>choice==='approve'?'REAL':choice==='reject'?'FAKE':'NO VOTE';
  function el(tag,props={},...children){const n=document.createElement(tag);for(const[k,v]of Object.entries(props)){if(k==='class')n.className=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else if(k in n&&!k.startsWith('aria'))n[k]=v;else n.setAttribute(k,v);}for(const child of children.flat(Infinity))if(child!==null&&child!==undefined&&child!==false)n.append(child);return n;}
  const button=(text,click,kind='',disabled=false)=>el('button',{type:'button',class:kind,'data-focus':typeof text==='string'?(/^(Open|Hide) my card$/.test(text)?'dossier-toggle':text):'',onclick:click,disabled:busy||disabled},text);
  const text=(tag,cls,value)=>el(tag,{class:cls},value);
  const panel=(...children)=>el('section',{class:'gc-panel'},...children);
  const who=id=>state?.players.find(p=>p.id===id)?.name||'Player';
  function announce(message){document.getElementById('gc-announcer').textContent=message;}
  const iconPaths={
    shield:'<path d="M12 3 3.5 6.5v5c0 5 5 8.2 8.5 10 3.5-1.8 8.5-5 8.5-10v-5Z"/><path d="m8 12 3 3 5-6"/>',
    mask:'<path d="M3 6q9-5 18 0l-1 8q-2 6-8 7-6-1-8-7Z"/><path d="m6 10 4 2-4 1m12-3-4 2 4 1M9 17q3-2 6 0"/>',
    document:'<path d="M6 3h9l4 4v14H6Z"/><path d="M14 3v5h5M9 12h7m-7 4h5"/>',
    chat:'<path d="M21 11a9 8 0 0 1-9 8H8l-5 3 1-6a8 8 0 0 1-1-5 9 8 0 0 1 18 0Z"/><path d="M7 10h10m-10 4h6"/>',
    check:'<path d="m5 12 4 4L20 5"/>',cross:'<path d="m6 6 12 12M18 6 6 18"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    trophy:'<path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a5 5 0 0 0 5 5m9-8h4v3a5 5 0 0 1-5 5M12 14v6m-5 1h10"/>',
    spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
  };
  function icon(name,cls=''){const n=el('span',{class:'gc-icon '+cls,'aria-hidden':'true'});n.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(iconPaths[name]||iconPaths.spark)+'</svg>';return n;}
  const LOT_ART={painting:0,record:1,crown:2,clock:3,mask:4,medal:5,comic:6,ball:7};
  function artwork(art){const i=LOT_ART[art]??2;return el('div',{class:'lot-art art-'+art,'aria-hidden':'true'},el('span',{class:'artifact-image',style:'--art-x:'+((i%4)*100/3)+'%;--art-y:'+(Math.floor(i/4)*100)+'%'}));}
  function avatar(id,cls='') {const p=state?.players.find(p=>p.id===id),i=p?.avatarIndex??Math.max(0,state?.players.indexOf(p)||0);return el('span',{class:'guest-portrait '+cls,style:'--guest-x:'+((i%4)*100/3)+'%;--guest-y:'+(Math.floor(i/4)*50)+'%','aria-hidden':'true'});}
  function fan(){return el('div',{class:'gallery-invitation','aria-hidden':'true'},el('div',{class:'gallery-window'}),artwork('crown'),el('div',{class:'invitation-seal'},icon('mask'),text('span','','A PRIVATE VIEWING')),el('div',{class:'invitation-teams'},text('span','','FIND THE TRUTH'),text('span','','SELL THE LIE')));}
  async function request(action,extra={},owner=seat){
    const payload={action,...owner,...extra,requestId:crypto.randomUUID(),match:state?.match,lotNumber:state?.lotNumber};
    for(let attempt=0;;attempt++){
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
      try{
        const response=await fetch('/api/grand-con',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
        const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Please retry.'),{status:response.status});return data;
      }catch(e){if(attempt>=1||['create','join'].includes(action)||(e.status&&e.status!==503))throw e;}
      finally{clearTimeout(timeout);}
    }
  }
  function adopt(data){data.receivedAt=Date.now();if(!state||data.code!==state.code||data.version>=state.version){const changed=state?.phase!==data.phase;state=data;if(changed&&['voting','reveal','finished'].includes(data.phase))showPrivate=false;if(changed)announce({forging:'Open your card to see your team.',discussion:'Time to talk. Read your clue.',voting:'Vote real or fake.',reveal:'The answer and votes are ready.',finished:'The game has ended.'}[data.phase]||'Room ready.');}}
  function schedulePoll(){clearTimeout(pollTimer);if(seat)pollTimer=setTimeout(poll,1100);}
  async function poll(){
    const owner=seat;if(!owner)return;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch('/api/grand-con?code='+owner.code+'&pid='+owner.pid,{headers:{'x-tok':owner.tok},signal:controller.signal});
      const data=await response.json();if(seat!==owner)return;
      if(!response.ok){if([401,404].includes(response.status)){seat=null;state=null;store('gc-seat',null);}throw Error(data.error);}
      const changed=!state||state.version!==data.version||!connected;adopt(data);connected=true;if(changed)render();else tick();
    }catch(e){if(seat!==owner&&seat)return;connected=false;error=e.name==='AbortError'?'No connection. Trying again…':e.message;render();}
    finally{clearTimeout(timeout);if(seat===owner)schedulePoll();}
  }
  async function enter(action){
    if(busy)return;busy=true;error='';render();
    try{const data=await request(action,{name:name.trim(),code:code.trim().toUpperCase(),recoveryCode:recover.trim()},null);seat={code:data.code,pid:data.meId,tok:data.tok};store('gc-seat',seat);store('gc-name',name.trim());localStorage.setItem('arcade-last-game','grand-con');showPrivate=false;adopt(data);connected=true;schedulePoll();}
    catch(e){error=e.name==='AbortError'?'No reply from the game. Check your internet and try again.':e.message;}
    finally{busy=false;render();}
  }
  async function send(action,extra={}){
    if(busy||!seat)return;const owner=seat;busy=true;error='';render();
    try{const data=await request(action,extra);if(seat!==owner)return;if(action==='leave'){seat=null;state=null;store('gc-seat',null);clearTimeout(pollTimer);}else {adopt(data);if(action==='claim'){claimDraft='';claimChoice='unsure';}}connected=true;}
    catch(e){error=e.name==='AbortError'?'The connection stopped. We are checking whether your choice was saved.':e.message;poll();}
    finally{busy=false;render();}
  }
  function openRules(){
    if(rulesDialog?.isConnected)return;
    rulesDialog=el('dialog',{class:'gc-rules'},text('span','eyebrow','REAL OR FAKE?'),el('h2',{tabIndex:-1},'Read. Talk. Vote.'),
      el('p',{},'Play in the same room. Everyone needs their own phone. Nobody is out during the game.'),
      el('div',{class:'rule-teams'},
        el('div',{class:'rule-team house'},icon('shield'),el('b',{},'Truth Team'),el('p',{},'Help the group pick the correct answer.')),
        el('div',{class:'rule-team ring'},icon('mask'),el('b',{},'Lie Team'),el('p',{},'You know the answer. Make the group pick the wrong one.'))),
      el('ol',{},
        el('li',{},el('b',{},'Read your secret card. '),'It shows your team. Everyone gets a different clue. The Lie Team changes one clue. The other clues are true.'),
        el('li',{},el('b',{},'Talk together. '),'Compare clues. Talk aloud or write a claim for everyone to read. You can lie. Once per game, privately check another player’s original clue.'),
        el('li',{},el('b',{},'Vote REAL or FAKE. '),'Does the item match what the seller says? Pick one answer, then press Confirm.')),
      el('div',{class:'rule-example'},el('b',{},'Example'),el('p',{},'The seller says a painting was made in 1906. Your clue says its paint was first made in 1935.'),el('p',{},'Those dates do not match. Ask other players what their clues say. Your clue might be the one that was changed.')),
      el('p',{class:'rule-win'},'Group answer correct → Truth Team +1. Group answer wrong → Lie Team +1. First team to 3 points wins!'),
      el('details',{},el('summary',{},'More rules, if you need them'),
        el('p',{},'The Lie Team knows who is on its team. The Truth Team does not. Your team stays the same until the game ends.'),
        el('p',{},'Before each round, one Lie Team player has 30 seconds to pick a clue to change. They can pick anyone, including themselves. The game writes the changed clue. If they do not pick, the game chooses one.'),
        el('p',{},'A REAL group answer needs more than half of the players to vote REAL. For example, 4 out of 6. A tie counts as FAKE. A missed vote adds no REAL vote. Leaving does not change how many REAL votes are needed.'),
        el('p',{},'You cannot change a confirmed vote. Votes stay hidden until everyone votes or the 30-second timer ends.'),
        el('p',{},'The host chooses Auto, 60, 90 or 120 seconds to talk. Auto gives larger tables more time. Anyone can add 30 seconds once per round. The host can start voting early.'),
        el('p',{},'After voting, everyone sees the answer, the votes, and the changed clue. Teams stay secret until one team gets 3 points.'),
        el('p',{},'Lie Team has 1 player in a group of 4–5, 2 in a group of 6–8, 3 in a group of 9–11, and 4 in a group of 12. Other players are on the Truth Team. Any round can be real or fake.')),
      button('Let’s play',()=>rulesDialog.close(),'primary'));
    rulesDialog.addEventListener('close',()=>rulesDialog.remove());document.body.append(rulesDialog);rulesDialog.showModal();
    rulesDialog.querySelector('h2').focus({preventScroll:true});rulesDialog.scrollTop=0;
  }
  function showRecovery(){const dialog=el('dialog',{class:'gc-rules'},el('h2',{},'Save your rejoin code'),el('p',{},'Save this code and keep it private. To play on another phone, enter the room code, your same name, and this code. The old phone will be signed out.'),el('input',{readOnly:true,value:state.me.recoveryCode,'aria-label':'Rejoin code',onclick:e=>e.target.select()}),button('Close',()=>dialog.close(),'primary'));dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();}
  async function copyInvite(){try{await navigator.clipboard.writeText(location.origin+'/grand-con.html?room='+state.code);announce('Link copied');document.querySelector('[data-copy]').textContent='Copied!';}catch{error='Copy this link: '+location.origin+'/grand-con.html?room='+state.code;render();}}
  function header(){return el('header',{class:'gc-header'},el('a',{href:'/?games=1',class:'back-link'},'← All games'),el('a',{href:'/grand-con.html',class:'gc-wordmark'},icon('mask'),el('span',{},text('small','','THE GAME ROOM'),text('b','','THE GRAND CON'))),el('div',{class:'header-tools'},button('How to play',openRules,'text-button'),window.GameAudio?.soundMenu?.()||null));}
  function lobby(){return el('div',{class:'gc-landing'},el('section',{class:'gc-intro'},text('span','eyebrow','READ CLUES. TALK TOGETHER. VOTE.'),fan(),el('h1',{},'Real',el('br'),el('em',{},'or fake?')),el('p',{},'Some players know the answer. One clue has been changed. Can the group find the truth?'),el('div',{class:'chips'},text('span','','4–12 players'),text('span','','Secret teams'),text('span','','Nobody is out')),
      el('div',{class:'quick-steps'},...[[ 'document','Read your clue'],['chat','Talk together'],['check','Vote real or fake']].map(([i,t],n)=>el('div',{},icon(i),text('small','',String(n+1).padStart(2,'0')),text('b','',t))))),
      el('section',{class:'gc-panel entrance'},el('div',{class:'entrance-seal','aria-hidden':'true'},icon('lock')),text('span','eyebrow','PLAY WITH FRIENDS'),el('h2',{},'Ready to play?'),el('label',{htmlFor:'gc-name'},'Your name'),el('input',{id:'gc-name',maxLength:12,value:name,autocomplete:'nickname',placeholder:'Your name',oninput:e=>name=e.target.value}),button('Create a room',()=>enter('create'),'primary'),text('div','or','or join your friends'),el('label',{htmlFor:'gc-code'},'Room code'),el('input',{id:'gc-code',maxLength:4,value:code,placeholder:'ABCD',autocomplete:'off',class:'code-input',oninput:e=>code=e.target.value}),button('Join room',()=>enter('join'),'secondary'),el('details',{},el('summary',{},'Rejoin on another phone'),el('p',{},'Use your same name and saved rejoin code.'),el('label',{htmlFor:'gc-recovery'},'Rejoin code'),el('input',{id:'gc-recovery',value:recover,autocomplete:'off',oninput:e=>recover=e.target.value})),el('p',{class:'muted small'},'Best with 6–8 friends. Everyone uses their own phone.')));}
  function roomBar(){return el('div',{class:'room-bar'},el('div',{},text('span','eyebrow','PRIVATE ROOM'),el('b',{class:'room-code'},state.code)),el('div',{class:'room-actions'},el('button',{type:'button','data-copy':'',onclick:copyInvite},'Copy link'),button('Rejoin code',showRecovery,'text-button'),button('Leave',()=>{if(confirm('Leave this room? Save your rejoin code so you can come back.'))send('leave');},'text-button')));}
  function roster(){return el('section',{class:'gc-panel table-roster'},el('div',{class:'panel-heading'},el('h3',{},'Players'),text('span','roster-count',state.phase==='voting'?state.players.filter(p=>p.voteLocked).length+'/'+state.players.length+' VOTED':state.players.filter(p=>!p.departed).length+'/12 PLAYERS')),
    el('div',{class:'roster'},...state.players.map((p,i)=>el('div',{class:'seat'+(p.id===state.meId?' mine':'')+(p.voteLocked&&state.phase==='voting'?' seat-sealed':'')+(p.departed?' seat-away':'')},el('span',{class:'seat-avatar tone-'+i%4,'aria-hidden':'true'},avatar(p.id)),el('div',{class:'seat-name'},el('b',{},p.name+(p.id===state.meId?' · You':'')),text('small','muted',p.departed?'AWAY':p.id===state.hostId?'HOST':state.phase==='voting'?(p.voteLocked?'VOTED':'CHOOSING…'):'READY')),p.voteLocked&&state.phase==='voting'?icon('lock','seat-status'):null))));
  }
  function waitingRoom(){const host=state.meId===state.hostId,n=state.players.filter(p=>!p.departed).length;return el('div',{class:'lobby-grid'},el('section',{class:'gc-panel waiting-card'},el('div',{class:'lobby-gallery','aria-hidden':'true'}),el('div',{class:'waiting-emblem','aria-hidden':'true'},icon('mask')),text('span','eyebrow','WAITING FOR FRIENDS'),el('h1',{},'Who’s ready?'),el('p',{class:'muted'},'Share this room code with your friends. You need at least 4 players.'),el('div',{class:'large-code'},state.code),el('div',{class:'chips'},text('span','','Secret teams'),text('span','','First to 3'),text('span','','Everyone stays in')),host?button('START GAME',()=>send('start'),'host-button start-ticket',n<4):text('p','waiting','Waiting for the host to start…'),text('p','muted small',n<4?`Waiting for ${4-n} more player${4-n===1?'':'s'}.`:(n-Math.floor(n/3))+' on Truth Team · '+Math.floor(n/3)+' on Lie Team. First to 3 points.'),paceSettings(host),button('How to play',openRules,'text-button')),roster());}
  function score(){return el('div',{class:'score-strip','aria-label':'Score'},...['house','ring'].map((t,i)=>el('div',{class:'score-team '+t+(renderedScore&&renderedScore[t]<state.score[t]?' score-gain':'')},icon(t==='house'?'shield':'mask'),el('div',{class:'score-team-info'},text('span','',teamName(t)),el('div',{class:'score-pips','aria-label':state.score[t]+' of 3 points'},...Array.from({length:3},(_,n)=>el('i',{class:n<state.score[t]?'filled':'','aria-hidden':'true'})))),el('b',{class:'score-number'},String(state.score[t])))),el('div',{class:'score-versus'},el('b',{},'VS'),text('small','','FIRST TO 3')));}
  function phaseRail(){const steps=[['forging','mask','Ready'],['discussion','chat','Talk'],['voting','check','Vote'],['reveal','spark','Answer']],index=steps.findIndex(s=>s[0]===state.phase);return el('div',{class:'phase-rail'},el('ol',{'aria-label':'Round progress'},...steps.map(([p,i,label],n)=>el('li',{class:n===index?'current':n<index?'complete':'','aria-current':n===index?'step':'false'},icon(n<index?'check':i),text('span','',label)))),el('div',{class:'rail-clock'},state.deadline?countdown():icon('check')));}
  function forgeryEditor(){const ring=state.me.ring;if(!ring)return null;
    return el('div',{class:'ring-brief'},text('span','eyebrow','THE ANSWER · LIE TEAM ONLY'),el('p',{},ring.explanation),el('p',{class:'muted small'},'Your goal: get the group to vote '+(ring.genuine?'FAKE. This item is REAL.':'REAL. This item is FAKE.')),el('p',{class:'muted small'},'Your team: '+ring.allies.map(who).join(', ')),
      state.phase==='forging'?(ring.tamper?text('p','waiting','Your team’s clue change is sealed. Everyone gets their clue when the timer ends.'):ring.forgerId===state.meId?el('div',{},el('div',{class:'panel-heading'},el('h3',{},'Pick a clue to change'),countdown()),el('p',{class:'muted small'},'Pick a player below. Only their clue will change. You can also pick yourself.'),el('div',{class:'forgery-options'},...ring.options.map(o=>el('button',{type:'button',class:'forgery-option'+(targetId===o.ownerId?' selected':''),'data-focus':'forge-'+o.ownerId,'aria-pressed':targetId===o.ownerId,disabled:busy,onclick:()=>{targetId=o.ownerId;render();}},el('span',{class:'target-avatar','aria-hidden':'true'},avatar(o.ownerId)),el('b',{},who(o.ownerId)),text('span','muted',o.source)))),
      targetId?el('div',{class:'forgery-preview'},...ring.options.filter(o=>o.ownerId===targetId).map(o=>el('div',{},text('span','eyebrow',o.source),el('p',{class:'original-copy'},el('b',{},'Before: '),o.original),el('p',{class:'altered-copy'},el('b',{},'After: '),o.altered)))):text('p','muted small','Pick a name to see the clue before and after the change.'),button('Confirm clue change',()=>send('forge',{targetId}),'primary',!targetId)):text('p','waiting',who(ring.forgerId)+' is picking a clue to change.')):
      ring.tamper?el('div',{class:'tamper-brief'},el('b',{},'Changed: '+who(ring.tamper.ownerId)+' · '+ring.tamper.source),el('p',{},ring.tamper.altered),text('small','muted','They will see this changed clue. The Truth Team does not know which clue was changed.')):null);
  }
  function dossier(){return el('section',{class:'gc-panel dossier'+(showPrivate?' dossier-open':' dossier-closed')+(showPrivate&&!renderedPrivate?' dossier-unseal':'')},el('div',{class:'panel-heading'},el('div',{},text('span','eyebrow','KEEP THIS PRIVATE'),el('h3',{},'Your secret card')),button(showPrivate?'Hide my card':'Open my card',()=>{showPrivate=!showPrivate;render();},'secondary')),
    showPrivate?el('div',{class:'dossier-content'},el('div',{class:'identity-card '+state.me.team},icon(state.me.team==='house'?'shield':'mask'),el('div',{},text('small','','YOUR SECRET TEAM'),text('b','',teamName(state.me.team)),text('span','',state.me.team==='house'?'Help the group pick the correct answer.':'Make the group pick the wrong answer.'))),el('p',{class:'muted small'},state.me.team==='house'?'There are '+(state.players.length-Math.floor(state.players.length/3))+' players on Truth Team and '+Math.floor(state.players.length/3)+' on Lie Team. Other players’ teams are secret.':'You know the real answer. The players listed below are on your team.'),forgeryEditor(),state.me.document?el('div',{class:'clue'},el('div',{class:'document-top'},icon('document'),text('span','','YOUR CLUE'),text('b','','#'+String(state.lotNumber).padStart(2,'0'))),text('span','eyebrow',state.me.document.source),el('p',{},state.me.document.text),el('div',{class:'question-prompt'},el('b',{},'Ask the group'),el('span',{},state.me.document.question)),text('small','document-footer','One clue was changed. The other clues are true. Players can lie.'),privateCheck()):el('div',{class:'document-pending'},icon('lock'),text('p','','Your clue will appear when the shared setup timer ends.'))):el('div',{class:'sealed-envelope','aria-hidden':'true'},el('span',{class:'envelope-flap'}),el('span',{class:'wax-seal'},icon('lock')),text('span','envelope-label','TOP SECRET')),
      !showPrivate?el('p',{class:'sealed-note'},'Open your card to see your team and what to do. Keep your screen private.'):null);
  }
  function lotHero(){return el('section',{class:'lot-hero gc-panel'},el('div',{class:'lot-top'},text('span','deal-badge','ROUND '+String(state.lotNumber).padStart(2,'0')),text('span','lot-seal','THE PRIVATE GALLERY')),
    el('div',{class:'artifact-stage'},artwork(state.lot.art)),el('div',{class:'lot-caption'},text('span','eyebrow','THE SELLER SAYS'),el('h1',{},state.lot.name),el('p',{},state.lot.claim)));}
  function paceSettings(host){return el('fieldset',{class:'pace-settings'},el('legend',{},'Time to talk'),el('div',{class:'pace-options'},...[[0,'Auto'],[60,'60 sec'],[90,'90 sec'],[120,'120 sec']].map(([value,label])=>el('button',{type:'button','aria-pressed':(state.settings?.discussionSeconds||0)===value,class:(state.settings?.discussionSeconds||0)===value?'selected':'',disabled:busy||!host,onclick:()=>send('settings',{discussionSeconds:value})},label))),text('p','muted small','Auto: 60–120 seconds to suit your table. Everyone can add 30 seconds once per round.'));}
  const questionKey=()=>['gc-question',state.code,state.meId,state.match,state.lotNumber].join(':');
  function firstLook(){return el('div',{class:'first-look'},el('label',{htmlFor:'gc-first-look'},'Your private question'),el('textarea',{id:'gc-first-look',rows:2,maxLength:180,value:read(questionKey())||'',placeholder:'What would you ask the seller?',oninput:e=>store(questionKey(),e.target.value)}),text('small','muted','Only you see this. Use it when the clues arrive.'));}
  function claimsBoard(){
    if(!['discussion','voting'].includes(state.phase))return null;
    const own=state.claims?.find(c=>c.id===state.meId);
    return el('section',{class:'gc-panel claims-board'},el('div',{class:'panel-heading'},el('div',{},text('span','eyebrow','ON THE RECORD'),el('h2',{},'What’s your story?')),text('small','muted',(state.claims||[]).length+' claims')),
      text('p','muted small','Talk aloud, or leave a short claim. Claims can be lies. They are not votes.'),read(questionKey())?el('aside',{class:'private-prompt'},text('small','','YOUR PRIVATE QUESTION'),el('p',{},read(questionKey()))):null,
      el('div',{class:'public-claims','aria-label':'Public claims'},...(state.claims||[]).map(c=>el('article',{class:'public-claim'},avatar(c.id),el('div',{},el('b',{},who(c.id)),text('span','claim-position '+c.choice,c.choice==='unsure'?'NOT SURE':voteName(c.choice)),el('p',{},c.text))))),
      state.phase==='discussion'?el('form',{class:'claim-form',onsubmit:e=>{e.preventDefault();if(claimDraft.trim())send('claim',{text:claimDraft,choice:claimChoice});}},
        el('label',{htmlFor:'gc-claim'},own?'Update your claim':'Your public claim'),el('textarea',{id:'gc-claim',rows:3,maxLength:180,value:claimDraft,placeholder:'My clue says…',disabled:busy,oninput:e=>claimDraft=e.target.value}),
        el('div',{class:'claim-compose-bottom'},el('label',{},text('span','sr-only','Your public opinion'),el('select',{'aria-label':'Your public opinion',disabled:busy,value:claimChoice,onchange:e=>claimChoice=e.target.value},...[['unsure','Not sure'],['approve','I think REAL'],['reject','I think FAKE']].map(([value,label])=>el('option',{value,selected:claimChoice===value},label)))),el('button',{type:'submit',class:'primary',disabled:busy},own?'Update claim':'Share claim'))):text('p','muted small','Claims are closed. Read them before sealing your vote.'));
  }
  function privateCheck(){
    const report=state.me.auditReport;
    if(report)return el('section',{class:'audit-report','aria-label':'Your private original-clue check'},text('span','eyebrow','ONLY YOU · ROUND '+report.round),el('h3',{},'The original clue'),el('div',{class:'audit-person'},avatar(report.targetId),el('b',{},who(report.targetId))),text('small','',report.source),el('p',{},report.text),text('small','muted','This is the true wording. It does not tell you their team.'));
    if(state.phase!=='discussion')return el('p',{class:'muted small'},'You have one private original-clue check for the whole game. Use it during discussion.');
    return el('section',{class:'private-check'},el('h3',{},'Check an original clue'),text('p','muted small','Once per game. Choose another player after hearing their story. Only you see the true clue. Their team stays secret.'),
      el('div',{class:'check-targets','aria-label':'Choose a clue to check'},...state.players.filter(p=>!p.departed&&p.id!==state.meId).map(p=>el('button',{type:'button',class:auditTarget===p.id?'selected':'','aria-pressed':auditTarget===p.id,'data-focus':'check-'+p.id,disabled:busy,onclick:()=>{auditTarget=p.id;render();}},avatar(p.id),text('span','',p.name)))),button('Check original',()=>send('audit',{targetId:auditTarget}),'secondary',!auditTarget));
  }
  function countdown(){return text('span','countdown','');}
  function actionPanel(){
    const host=state.hostId===state.meId,phase=state.phase,stage=(...children)=>el('section',{class:'gc-panel action-panel action-'+phase},...children),head=el('div',{class:'panel-heading'},text('span','eyebrow',phase==='forging'?'1 · READ YOUR CARD':phase==='discussion'?'2 · TALK TOGETHER':'3 · VOTE REAL OR FAKE'),countdown());
    if(phase==='forging')return stage(head,el('div',{class:'stage-emblem'},icon('mask')),el('h2',{},'One clue is being changed.'),el('p',{class:'muted'},'Open your secret card. It shows your team and what to do. The Lie Team is changing one clue.'),text('p','waiting','Everyone gets their clue when the 30-second timer ends.'),firstLook(),text('small','muted','Everyone has the same 30 seconds. If no clue is picked, the game picks one.'));
    if(phase==='discussion')return stage(head,el('div',{class:'stage-emblem'},icon('chat')),el('h2',{},'Talk about your clues.'),el('p',{class:'muted'},'Compare your clues. Say what you found, question another player, or write a claim below. One clue was changed, and players can lie.'),el('div',{class:'discussion-prompts'},el('b',{},'Try asking'),el('p',{},'“What does your clue say?”'),el('p',{},'“Does your clue agree with mine?”'),el('p',{},'“Can both of those clues be true?”')),button(state.extended?'Extra time added':'More time · +30 seconds',()=>send('extend'),'secondary',state.extended),host?button('START VOTE',()=>send('advance'),'host-button'):text('p','waiting','Voting starts when the timer ends or the host presses Start vote.'),text('small','muted',(state.discussionSeconds||45)+' seconds to talk. The group can add 30 seconds once.'));
    return stage(head,el('div',{class:'stage-emblem'},icon(state.me.vote?'lock':'check')),el('h2',{},state.me.vote?'You have voted.':'Is this item real or fake?'),state.me.vote?el('div',{},el('div',{class:'locked'},icon('lock'),text('span','','✓ '+voteName(state.me.vote)),text('small','','VOTE SAVED')),text('p','muted','You cannot change your vote. Everyone’s votes will appear together.')):el('div',{},el('p',{class:'muted'},'REAL means the item matches what the seller says. FAKE means it does not. Pick one, then press Confirm.'),el('div',{class:'choice-row vote-choices'},...['approve','reject'].map(v=>el('button',{type:'button',class:(choice===v?'selected ':'')+v,'data-focus':'vote-'+v,'aria-pressed':choice===v,disabled:busy,onclick:()=>{choice=v;render();}},icon(v==='approve'?'check':'cross'),el('b',{},voteName(v)),el('small',{},v==='approve'?'It matches':'It does not match')))),button(choice?'Confirm '+voteName(choice):'Choose your vote',()=>send('vote',{choice}),'primary',!choice)),text('p','muted small',state.required+' players must vote REAL for the group answer to be REAL. Otherwise it is FAKE. A missed vote adds no REAL vote.'));
  }
  function resultDetails(result){return el('div',{class:'result-details '+(result.genuine?'result-genuine':'result-fake')},el('div',{class:'verdict-stamp','aria-hidden':'true'},icon(result.genuine?'check':'cross'),text('b','',result.genuine?'REAL':'FAKE')),el('div',{class:'point-award '+result.pointTo},icon(result.pointTo==='house'?'shield':'mask'),text('b','',teamName(result.pointTo)+' +1')),text('span','eyebrow',result.pointTo==='house'?'THE GROUP WAS RIGHT':'THE GROUP WAS WRONG'),el('h2',{},result.genuine?'It was REAL!':'It was FAKE!'),el('p',{class:'result-summary'},result.explanation),el('p',{class:'outcome'},'Group answer: '+(result.approved?'REAL':'FAKE')+' · '+result.approvals+' of '+result.electorate+' voted REAL'),
    el('div',{class:'vote-ledger grouped-ledger'},...['approve','reject','missed'].filter(choice=>result.votes.some(v=>v.choice===choice)).map(choice=>el('section',{class:'vote-choice-group'},el('h3',{},voteName(choice)+' · '+result.votes.filter(v=>v.choice===choice).length),el('div',{class:'choice-voters'},...result.votes.filter(v=>v.choice===choice).map(v=>el('div',{class:'vote-row'},avatar(v.id),el('b',{},who(v.id)),text('span','vote-chip '+v.choice,voteName(v.choice)))))))),
    el('div',{class:'tamper-reveal'},text('span','eyebrow','THE CHANGED CLUE'),el('h3',{},who(result.tamper.ownerId)+' · '+result.tamper.source),el('p',{},el('b',{},'What they saw: '),result.tamper.altered),el('p',{},el('b',{},'The true clue: '),result.tamper.original),text('small','muted','This player could be on either team. Getting a changed clue does not tell you their team.')),
    el('details',{class:'evidence-audit','data-details':'audit-'+result.number},el('summary',{},'Show all true clues'),...result.documents.map(d=>el('div',{class:'audit-document'},el('b',{},who(d.ownerId)+' · '+d.source),el('p',{},d.original),(result.claims||[]).some(c=>c.id===d.ownerId)?el('div',{class:'claim-comparison'},text('small','','WHAT THEY CLAIMED'),...result.claims.filter(c=>c.id===d.ownerId).map(c=>el('p',{},c.text)),d.received!==d.original?text('small','','They received the changed clue. This does not reveal their team.'):null):null))));
  }
  function reveal(){const result=state.history.at(-1);return el('section',{class:'gc-panel reveal-panel'},resultDetails(result),text('p','muted small',state.winningTeam?'The game has ended. The host can now show everyone’s team.':'Teams are still secret. Who said something that did not match the true clues?'),state.hostId===state.meId?button(state.winningTeam?'SHOW TEAMS':'NEXT ROUND '+(state.lotNumber+1),()=>send('next'),'host-button'):text('p','waiting','Waiting for the host to continue.'));}
  function finale(){return el('div',{class:'finale-scene'},el('section',{class:'gc-panel finale-panel '+state.winningTeam},el('div',{class:'victory-cup','aria-hidden':'true'},el('img',{src:'/grand-con/trophy.webp',alt:'',width:200,height:200})),el('div',{class:'victory-confetti','aria-hidden':'true'},...Array.from({length:16},(_,i)=>el('i',{style:'--i:'+i}))),text('span','eyebrow','GAME OVER'),el('h1',{},teamName(state.winningTeam)+' wins!'),el('p',{class:'muted'},'Now you can see who was on each team.'),score(),el('div',{class:'syndicate-scores'},...['house','ring'].map(team=>el('div',{class:'team-score '+team},el('div',{class:'team-heading'},icon(team==='house'?'shield':'mask'),text('span','team-badge '+team,teamName(team))),...state.players.filter(p=>p.team===team).map(p=>el('div',{class:'team-player'},avatar(p.id),el('b',{},p.name+(p.id===state.meId?' · You':'')),text('small','',p.team==='house'?'Find the truth':'Sell the lie')))))),paceSettings(state.hostId===state.meId),state.hostId===state.meId?button('PLAY AGAIN',()=>send('start'),'host-button start-ticket',state.players.filter(p=>!p.departed).length<4):text('p','waiting','Waiting for the host to start a new game.')),history());}
  function history(){return state.history.length?el('section',{class:'gc-panel history'},el('h3',{},'Past rounds'),...state.history.map(l=>el('details',{'data-details':'deal-'+l.number},el('summary',{},'Round '+l.number+' · '+l.name+' · '+teamName(l.pointTo)+' +1'),resultDetails(l)))):null;}
  function render(){
    const focus=document.activeElement?.id,focusKey=document.activeElement?.dataset.focus,selection=document.activeElement?.selectionStart,selectionEnd=document.activeElement?.selectionEnd,privateScroll=root.querySelector('.dossier-content')?.scrollTop||0;
    const openDetails=[...root.querySelectorAll('details[open][data-details]')].map(n=>n.dataset.details);
    if(state){const key=state.match+':'+state.lotNumber;if(key!==draftKey){draftKey=key;targetId='';choice='';claimDraft='';claimChoice='unsure';auditTarget='';showPrivate=false;}}
    const content=!seat?lobby():!state?panel(el('h2',{},'Loading your game…'),el('p',{class:'muted'},'Getting your room ready.'),button('Try again',poll,'secondary')):state.phase==='lobby'?waitingRoom():state.phase==='finished'?finale():el('div',{class:'match-scene'},score(),phaseRail(),el('div',{class:'match-grid'},el('div',{},lotHero(),claimsBoard()),el('div',{},state.phase==='reveal'?reveal():actionPanel(),roster())),history());
    root.replaceChildren(...[header(),error?el('div',{class:'error-banner',role:'alert'},error,button('Close',()=>{error='';render();},'text-button')):null,seat&&!connected?text('div','connection-banner','Reconnecting… Your place is saved.'):null,state&&seat?roomBar():null,state?.notice?text('p','connection-banner',state.notice):null,content,state&&seat&&!['lobby','finished'].includes(state.phase)?dossier():null,el('footer',{class:'gc-footer'},'The Grand Con · Read clues. Talk together. Vote real or fake.')].filter(Boolean));
    for(const n of root.querySelectorAll('details[data-details]'))if(openDetails.includes(n.dataset.details))n.open=true;
    const restored=focus?document.getElementById(focus):focusKey?[...root.querySelectorAll('[data-focus]')].find(n=>n.dataset.focus===focusKey):null;if(restored){restored.focus({preventScroll:true});if(typeof selection==='number'&&restored.type!=='number')try{restored.setSelectionRange(selection,selectionEnd??selection);}catch{}}
    const scene=[state?.code,state?.match,state?.lotNumber,state?.phase].join(':');
    root.dataset.phase=state?.phase||'home';
    if(scene!==renderedScene){root.querySelector('.match-scene, .finale-scene, .lobby-grid, .gc-landing')?.classList.add('scene-enter');renderedScene=scene;}
    renderedPrivate=showPrivate;renderedScore=state?{...state.score}:null;
    const handle=root.querySelector('[data-focus=dossier-toggle]');if(handle){handle.disabled=false;handle.setAttribute('aria-expanded',String(showPrivate));handle.setAttribute('aria-controls','gc-secret-content');}
    const secret=root.querySelector('.dossier-content');if(secret){secret.id='gc-secret-content';secret.scrollTop=privateScroll;}
    tick();
  }
  function tick(){
    if(!state?.deadline)return;
    const seconds=Math.max(0,Math.ceil((state.deadline-state.now-(Date.now()-(state.receivedAt||Date.now())))/1000));
    const duration=state.phase==='discussion'?((state.discussionSeconds||45)+(state.extended?30:0)):30;
    for(const n of document.querySelectorAll('.countdown')){n.textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');n.classList.toggle('urgent',seconds<=10);n.setAttribute('aria-label',seconds+' seconds remaining');n.style.setProperty('--remaining',Math.min(1,seconds/duration));}
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&showPrivate&&!document.querySelector('dialog[open]')){showPrivate=false;render();root.querySelector('[data-focus=dossier-toggle]')?.focus({preventScroll:true});}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&seat){clearTimeout(pollTimer);poll();}});
  setInterval(tick,1000);render();if(seat)poll();
})();
