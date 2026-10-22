/* Optional host test clients. Every bot uses its own seat and ordinary game API. */
(() => {
  'use strict';
  window.createTrainTestPlayers = root => {
    const params = new URLSearchParams(location.search), requested = Number(params.get('bots'));
    const targetCount = Number.isInteger(requested) && requested >= 1 && requested <= 5 ? requested : 5;
    const autoSetup = params.get('autobots') === '1';
    let state, owner, key = '', bots = [], running = false, working = false, message = '', timer, epoch = 0, autoAttemptedKey = '';
    const panel = document.createElement('section'); panel.className = 'panel test-players'; panel.setAttribute('aria-label', 'Test players');
    const title = document.createElement('h3'); title.textContent = 'Playtest with bots';
    const hint = document.createElement('p'); hint.className = 'muted small'; hint.textContent = targetCount + ' simulated players can ready up, use powers, share role claims and vote. Saboteurs make false claims. Friends can join with the normal room link. Keep this test-mode page open while playing.';
    const status = document.createElement('p'); status.className = 'test-player-status'; status.setAttribute('role', 'status');
    const actions = document.createElement('div'); actions.className = 'test-player-actions';
    const add = document.createElement('button'); add.type = 'button'; add.className = 'secondary';
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'secondary';
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Remove test players';
    actions.append(add, toggle, remove); panel.append(title, hint, status, actions);
    const save = () => { try { localStorage.setItem(key, JSON.stringify(bots.map(({ code, pid, tok, name, memory }) => ({ code, pid, tok, name, memory })))); } catch {} };
    function update() {
      const count = bots.length;
      status.textContent = message || (count ? count + ' test players · ' + (running ? 'Playing automatically' : 'Stopped') : 'No test players added.');
      add.textContent = (count > targetCount ? 'Use ' : count ? 'Complete ' : 'Add ') + targetCount + ' test players';
      add.hidden = count === targetCount; add.disabled = working || state?.phase !== 'lobby' || (state?.players.length || 0) + Math.max(0, targetCount - count) > 12;
      toggle.hidden = !count; toggle.textContent = running ? 'Stop autoplay' : 'Resume autoplay'; toggle.disabled = working;
      remove.hidden = !count; remove.disabled = working || state?.phase !== 'lobby';
    }
    async function request(bot, action, view, extra = {}) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = action ? await fetch('/api/last-train', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, code: bot.code, pid: bot.pid, tok: bot.tok, requestId: crypto.randomUUID(), match: view?.match || 0, round: view?.round || 0, step: view?.step || 0, ...extra }), signal: controller.signal }) : await fetch('/api/last-train?code=' + bot.code + '&pid=' + bot.pid, { headers: { 'x-tok': bot.tok }, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw Object.assign(Error(data.error || 'The test player could not connect.'), { status: response.status });
        return data;
      } finally { clearTimeout(timeout); }
    }
    async function act(bot, view) {
      const me = view.me, phase = view.phase;
      if (window.trainTestStrategy.remember(bot, view)) save();
      if (view.paused || !me.alive || me.departed) return;
      const others = view.players.filter(p => p.alive && p.id !== view.meId);
      const choose = players => { const tests = players.filter(p => p.name.startsWith('Bot ')); const list = tests.length ? tests : players; return list[Math.floor(Math.random() * list.length)]; };
      if (phase === 'briefing' && !me.ready) await request(bot, 'ready', view);
      if (phase === 'night' && !me.nightChoice) {
        const active = view.nightRole;
        if (active === 'saboteur' && me.group === 'saboteur') {
          const allies = new Set(me.allies.map(p => p.id)), targets = others.filter(p => !allies.has(p.id));
          const proposed = me.teamChoices?.find(p => p.selected);
          const tests = targets.filter(p => p.name.startsWith('Bot '));
          await request(bot, 'night', view, { attackId: proposed ? proposed.attackId : (tests.length ? tests : targets)[0]?.id || null });
        } else if (active === me.role) {
          if (active === 'medic') {
            if (!me.blocked && !me.medicineChoice) {
              const power = me.patientId && me.medicine.heal ? 'heal' : 'pass';
              const result = await request(bot, 'medicine', view, { power });
              if (window.trainTestStrategy.remember(bot, result)) save();
            }
          } else if (['brave', 'careful', 'inspector', 'witness'].includes(active)) {
            let power = { brave: 'cover', careful: 'lock', inspector: 'check', witness: 'watch' }[active];
            if (me.used[power] || (['cover', 'check'].includes(power) && !others.length)) power = 'pass';
            await request(bot, 'night', view, { power, ...(['cover', 'check'].includes(power) ? { targetId: choose(others).id } : {}) });
          }
        }
      }
      if (phase === 'discussion' && view.speakerId === view.meId) {
        if (!view.speeches.some(s => s.round === view.round && s.id === view.meId)) {
          await request(bot, 'speak', view, { text: window.trainTestStrategy.statement(bot, view) });
          return; // Sharing has already handed the floor to the next player.
        }
        if (view.settings.discussion !== 'chat') {
          if (bot.speechStep !== view.step) { bot.speechStep = view.step; bot.speechAt = Date.now() + 4000; }
          if (Date.now() >= bot.speechAt) await request(bot, 'finishSpeech', view);
        }
      }
      if (phase === 'voting' && !me.vote) {
        const pool = view.voteCandidates ? view.players.filter(p => p.alive && view.voteCandidates.includes(p.id) && p.id !== view.meId) : others;
        // Mostly vote bots, but about 40% of the time pick any player so real players get voted for too.
        const real = pool.filter(p => !p.name.startsWith('Bot '));
        const target = real.length && Math.random() < .4 ? real[Math.floor(Math.random() * real.length)] : choose(pool);
        await request(bot, 'vote', view, { targetId: target?.id || null });
      }
    }
    function schedule() {
      clearTimeout(timer);
      if (running && bots.length) timer = setTimeout(poll, 1800);
    }
    async function poll() {
      const version = epoch;
      await Promise.allSettled(bots.map(async bot => {
        try { const view = await request(bot); if (running && version === epoch) await act(bot, view); }
        catch (error) {
          if (version !== epoch) return;
          if (error.status === 409) return; // A human or timer advanced the phase; the next poll reads it.
          message = bot.name + ': ' + (error.name === 'AbortError' ? 'Reconnecting…' : error.message); update();
        }
      }));
      if (version === epoch) schedule();
    }
    add.addEventListener('click', async () => {
      if (working || state?.phase !== 'lobby' || state?.hostId !== owner?.pid) return;
      running = false; epoch++; clearTimeout(timer);
      working = true; message = 'Adding test players…'; update(); const version = epoch, code = state.code;
      try {
        const names = ['Nova', 'Kai', 'Luna', 'Milo', 'Ash'];
        // Only this host browser's saved bot seats can be removed when a link requests fewer bots.
        while (bots.length > targetCount && version === epoch) {
          await request(bots[bots.length - 1], 'leave');
          if (version !== epoch) return;
          bots.pop(); save();
        }
        while (bots.length < targetCount && version === epoch) {
          const name = 'Bot ' + names[bots.length] + ' ' + crypto.randomUUID().slice(0, 3);
          const result = await request({ code }, 'join', null, { name });
          if (version !== epoch) { await request({ code, pid: result.meId, tok: result.tok }, 'leave'); return; }
          bots.push({ code, pid: result.meId, tok: result.tok, name }); save();
        }
        running = true; message = ''; schedule();
      } catch (error) { message = 'Added ' + bots.length + '/' + targetCount + '. ' + (error.name === 'AbortError' ? 'Connection stopped. Check the room before retrying.' : error.message); }
      finally { working = false; update(); }
    });
    toggle.addEventListener('click', () => { running = !running; epoch++; message = ''; update(); schedule(); });
    remove.addEventListener('click', async () => {
      if (working || state?.phase !== 'lobby') return;
      running = false; epoch++; clearTimeout(timer); working = true; message = 'Removing test players…'; update();
      try {
        for (const bot of [...bots]) { await request(bot, 'leave'); bots = bots.filter(b => b.pid !== bot.pid); save(); }
        message = '';
      } catch (error) { message = error.message; }
      finally { working = false; update(); }
    });
    return { sync(next, seat) {
      state = next; owner = seat;
      const nextKey = next && seat && next.hostId === seat.pid ? 'lt-test-players:' + next.code + ':' + seat.pid : '';
      if (key !== nextKey) {
        epoch++; clearTimeout(timer); key = nextKey; bots = []; running = false; working = false; message = '';
        if (key) try { const saved = JSON.parse(localStorage.getItem(key)); if (Array.isArray(saved)) bots = saved.filter(b => b.code === next.code && b.pid && b.tok && b.name); } catch {}
        running = !!bots.length; schedule();
      }
      if (!key) { panel.remove(); return; }
      root.querySelector('.lt-header')?.after(panel); update();
      if (autoSetup && autoAttemptedKey !== key && next.phase === 'lobby') {
        autoAttemptedKey = key;
        if (bots.length !== targetCount) {
          if (add.disabled) { message = 'Not enough room for ' + targetCount + ' test players. Free a seat, then use the button below.'; update(); }
          else queueMicrotask(() => { if (state?.code === next.code && key === nextKey && !working) add.click(); });
        }
      }
    }};
  };
})();
