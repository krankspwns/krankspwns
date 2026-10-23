/* Private device-only notes. No notebook content is sent to the game API. */
(() => {
  'use strict';
  window.createTrainNotebook = host => {
    let key = '', marksKey = '', data = { text: '', strokes: [] }, launcher, book, canvas, ctx, status, phaseLabel, people = [], meId = '', peopleBox, reportsKey = '', reportCount = 0, buildReports = null, reportsBox;
    const inks = [['Midnight', '#293248'], ['Ruby', '#a22d46'], ['Emerald', '#22745b'], ['Blue', '#275fbc'], ['Violet', '#7747a8'], ['Amber', '#976313']];
    let ink = inks[0][1];
    let current = null, activePointer = null, mode = 'people', tool = 'pen', dirty = false, saveTimer, observer, cleared = null;
    const node = (tag, cls, text) => {
      const n = document.createElement(tag); n.className = cls || ''; if (text) n.textContent = text; return n;
    };
    const button = (text, click, cls = '') => {
      const n = node('button', cls, text); n.type = 'button'; n.addEventListener('click', click); return n;
    };
    const icon = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false"><defs><linearGradient id="lt-notes-cover" x1="5" y1="2" x2="25" y2="27" gradientUnits="userSpaceOnUse"><stop stop-color="#64d7c1"/><stop offset=".5" stop-color="#249e9d"/><stop offset="1" stop-color="#155a76"/></linearGradient></defs><ellipse cx="16" cy="29.5" rx="12" ry="1.8" fill="#081723" fill-opacity=".45"/><g transform="rotate(-7 15 16)"><rect x="5" y="3" width="20" height="26" rx="3" fill="#145466" stroke="#b9e4d5" stroke-width=".7"/><path d="M8 25h16v3H8a1.5 1.5 0 0 1 0-3" fill="#fff0d1"/><path d="M9 26.4h13" stroke="#b9a17d" stroke-width=".7"/><path d="M8 2h15a2 2 0 0 1 2 2v21H8a3 3 0 0 0-3 2V5a3 3 0 0 1 3-3" fill="url(#lt-notes-cover)" stroke="#97dfcb" stroke-width=".7"/><path d="M10 3v21" stroke="#f4ce79" stroke-width="1.3"/><path d="M20 2v10l-2-1.7-2 1.7V2z" fill="#d65789"/><rect x="12.5" y="14" width="9" height="5" rx="1" fill="#f3db9f"/><path d="M14.5 16.5h5" stroke="#946035" stroke-width=".9" stroke-linecap="round"/><path d="M4 9h3M4 18h3" stroke="#ffe2a1" stroke-width="1.8" stroke-linecap="round"/></g><path d="m27 9-8 15-.8 4.2 3-2.8 8-15z" fill="#edc47a" stroke="#174560" stroke-width=".6"/><path d="m27 9-8 15 2.2 1.4 8-15z" fill="#86c8f5"/><path d="m28 6.8 1.1.6a1.5 1.5 0 0 1 .6 2L29 11l-3-1.7.7-1.4a1 1 0 0 1 1.3-1.1" fill="#e993b2"/><path d="m18.2 28.2.6-2.2 1.1.7z" fill="#393452"/></svg>';
    // Trust marks are shared with the night notebook in the cabin: same device, same game.
    const MARKS = [['trust', 'Trust', '✓'], ['unsure', 'Unsure', '?'], ['suspect', 'Suspect', '✕']];
    const readMarks = () => { try { const v = JSON.parse(localStorage.getItem(marksKey) || 'null'); return v && typeof v === 'object' ? { marks: {}, stories: {}, people: {}, tags: {}, ...v } : { marks: {}, stories: {}, people: {}, tags: {} }; } catch { return { marks: {}, stories: {}, people: {} }; } };
    const writeMarks = change => { try { localStorage.setItem(marksKey, JSON.stringify({ ...readMarks(), ...change })); if (status) status.textContent = 'Saved on this device'; } catch {} };
    function renderPeople() {
      if (!peopleBox) return;
      const notes = readMarks(); peopleBox.replaceChildren();
      const others = people.filter(p => p.id !== meId && !p.departed);
      if (!others.length) { peopleBox.append(node('p', 'notebook-tip', 'Your fellow travellers will appear here.')); return; }
      for (const p of others) {
        const row = node('div', 'people-row' + (p.alive === false ? ' out' : '')), mark = notes.marks[p.id] || 'unsure';
        const face = node('span', 'portrait portrait-passengers people-face'); const i = p.avatarIndex || 0;
        face.style.setProperty('--px', (i % 4 * 100 / 3) + '%'); face.style.setProperty('--py', (Math.floor(i / 4) * 50) + '%'); face.setAttribute('aria-hidden', 'true');
        const name = node('div', 'people-name'); name.append(node('b', '', p.name), node('small', '', p.alive === false ? 'Out' : p.seat ? 'Seat ' + p.seat : 'In the room'));
        const chips = node('div', 'trust-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Your view of ' + p.name);
        for (const [value, label] of MARKS) {
          const chip = button('', () => { writeMarks({ marks: { ...readMarks().marks, [p.id]: value } }); renderPeople(); }, 'trust-chip ' + value);
          chip.setAttribute('aria-pressed', String(mark === value)); const ic = node('span', 'trust-icon'); ic.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' + (window.TRAIN_ART?.trustLines?.[value] || '') + '</svg>'; chip.append(ic, node('small', '', label)); chips.append(chip);
        }
        const note = node('input', 'people-note'); note.maxLength = 80; note.placeholder = 'Claims, clues…'; note.value = notes.people[p.id] || ''; note.setAttribute('aria-label', 'Note about ' + p.name);
        note.addEventListener('input', () => writeMarks({ people: { ...readMarks().people, [p.id]: note.value } }));
        const tags = node('div', 'note-tags'); tags.setAttribute('role', 'group'); tags.setAttribute('aria-label', 'Tags for ' + p.name);
        for (const [value, label, art] of window.TRAIN_ART?.noteTags || []) {
          const on = (notes.tags[p.id] || []).includes(value);
          const tag = button('', () => { const cur = readMarks().tags[p.id] || []; writeMarks({ tags: { ...readMarks().tags, [p.id]: cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value] } }); renderPeople(); }, 'note-tag ' + value);
          tag.setAttribute('aria-pressed', String(on)); const ic = node('span', 'note-tag-icon'); ic.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + art + '</svg>'; tag.append(ic, node('small', '', label)); tags.append(tag);
        }
        row.append(face, name, chips, tags, note); peopleBox.append(row);
      }
    }
    // Private night results (Inspector checks, Witness sightings, promotions), newest first.
    function renderReports() {
      if (!reportsBox) return;
      reportsBox.replaceChildren(buildReports ? buildReports() : node('p', 'reports-empty', 'Private results from your night power will appear here.'));
    }
    function persist() {
      clearTimeout(saveTimer);
      if (!key || !dirty) return;
      try { localStorage.setItem(key, JSON.stringify(data)); dirty = false; if (status) status.textContent = 'Saved on this device'; }
      catch { if (status) status.textContent = 'Could not save. Keep this notebook open.'; }
    }
    function changed() {
      dirty = true; if (status) status.textContent = 'Saving…'; clearTimeout(saveTimer); saveTimer = setTimeout(persist, 200);
    }
    function paint(stroke) {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.save(); ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = stroke.color || '#293248'; ctx.fillStyle = stroke.color || '#293248'; ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = (stroke.tool === 'eraser' ? 20 : 2.2) * width / 360;
      ctx.beginPath();
      stroke.points.forEach((p, i) => { if (i) ctx.lineTo(p[0] * width, p[1] * height); else ctx.moveTo(p[0] * width, p[1] * height); });
      if (stroke.points.length === 1) { const p = stroke.points[0]; ctx.arc(p[0] * width, p[1] * height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.stroke();
      ctx.restore();
    }
    function redraw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      data.strokes.forEach(paint); if (current) paint(current);
      if (book) book.querySelector('[data-note-undo]').disabled = !data.strokes.length && !cleared;
    }
    function resize() {
      if (!canvas || mode !== 'draw') return;
      const r = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 3);
      if (!r.width || !r.height) return;
      canvas.width = Math.round(r.width * ratio); canvas.height = Math.round(r.height * ratio); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); redraw();
    }
    function finish() {
      if (!current) return;
      data.strokes.push(current); current = null; activePointer = null; cleared = null; changed(); persist(); redraw();
    }
    function close() { finish(); persist(); book?.close(); }
    function showMode(next) {
      finish(); mode = next;
      for (const b of book.querySelectorAll('[data-note-mode]')) b.setAttribute('aria-pressed', String(b.dataset.noteMode === mode));
      book.querySelector('.notebook-typing').hidden = mode !== 'type'; book.querySelector('.notebook-drawing').hidden = mode !== 'draw'; peopleBox.hidden = mode !== 'people'; reportsBox.hidden = mode !== 'reports';
      if (mode === 'people') renderPeople(); if (mode === 'reports') renderReports();
      if (mode === 'draw') resize();
    }
    function open() {
      if (book) return;
      book = node('dialog', 'notebook'); book.setAttribute('aria-labelledby', 'notebook-title');
      const top = node('header', 'notebook-header'), title = node('div');
      title.append(node('small', 'eyebrow', 'FOR YOUR EYES ONLY'), Object.assign(node('h2', '', 'My Notebook'), { id: 'notebook-title' }));
      const closeButton = button('×', close, 'notebook-close'); closeButton.setAttribute('aria-label', 'Close notebook'); top.append(title, closeButton);
      phaseLabel = node('p', 'notebook-phase'); phaseLabel.textContent = launcher.dataset.phase || 'Your private notes';
      const tabs = node('div', 'notebook-modes'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Notebook mode');
      for (const [value, label] of [['people', 'People'], ['reports', 'Reports' + (reportCount ? ' · ' + reportCount : '')], ['type', 'Type'], ['draw', 'Draw']]) {
        const tab = button(label, () => showMode(value)); tab.dataset.noteMode = value; tabs.append(tab);
      }
      const typing = node('div', 'notebook-typing'), label = node('label', '', 'Your notes'); label.htmlFor = 'notebook-text';
      const input = node('textarea', 'notebook-paper'); input.id = 'notebook-text'; input.maxLength = 10000; input.value = data.text;
      input.placeholder = 'Who do you trust? What did you notice?'; input.addEventListener('input', () => { data.text = input.value; changed(); }); typing.append(label, input);
      const drawing = node('div', 'notebook-drawing'), toolbar = node('div', 'notebook-toolbar'), tools = node('div', 'notebook-tools'); tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', 'Drawing tools');
      for (const [value, label] of [['pen', 'Pen'], ['eraser', 'Eraser']]) {
        const b = button(label, () => { tool = value; for (const n of tools.querySelectorAll('[data-note-tool]')) n.setAttribute('aria-pressed', String(n.dataset.noteTool === tool)); });
        b.dataset.noteTool = value; b.setAttribute('aria-pressed', String(tool === value)); tools.append(b);
      }
      const undo = button('Undo', () => { finish(); if (cleared) { data.strokes = cleared; cleared = null; } else data.strokes.pop(); changed(); persist(); redraw(); }); undo.dataset.noteUndo = ''; tools.append(undo);
      tools.append(button('Clear Drawing', () => { finish(); if (!data.strokes.length) return; cleared = data.strokes; data.strokes = []; changed(); persist(); redraw(); }));
      const palette = node('div', 'notebook-palette'); palette.setAttribute('role', 'group'); palette.setAttribute('aria-label', 'Ink colors');
      for (const [name, color] of inks) {
        const swatch = button('', () => { finish(); ink = color; tool = 'pen'; for (const n of palette.children) n.setAttribute('aria-pressed', String(n.dataset.color === ink)); for (const n of tools.querySelectorAll('[data-note-tool]')) n.setAttribute('aria-pressed', String(n.dataset.noteTool === tool)); }, 'ink-swatch');
        swatch.dataset.color = color; swatch.style.setProperty('--ink', color); swatch.setAttribute('aria-label', name + ' ink'); swatch.setAttribute('aria-pressed', String(color === ink)); palette.append(swatch);
      }
      toolbar.append(tools, palette);
      const paper = node('div', 'notebook-paper drawing-paper'); canvas = node('canvas'); canvas.setAttribute('aria-label', 'Handwriting area. Draw with a finger, stylus or mouse.'); ctx = canvas.getContext('2d');
      const point = e => { const r = canvas.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
      canvas.addEventListener('pointerdown', e => {
        if (!e.isPrimary || e.button !== 0 || activePointer !== null) return;
        e.preventDefault(); window.getSelection()?.removeAllRanges(); activePointer = e.pointerId; canvas.setPointerCapture(e.pointerId); current = { tool, color: ink, points: [point(e)] }; redraw();
      });
      canvas.addEventListener('pointermove', e => {
        if (e.pointerId !== activePointer || !current) return;
        e.preventDefault();
        const coalesced = e.getCoalescedEvents?.();
        const events = coalesced?.length ? coalesced : [e];
        for (const event of events) {
          const p = point(event), last = current.points.at(-1);
          if (Math.hypot(p[0] - last[0], p[1] - last[1]) > .001 && current.points.length < 6000) current.points.push(p);
        }
        redraw();
      });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, e => { if (e.pointerId === activePointer) finish(); });
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      paper.addEventListener('selectstart', e => e.preventDefault());
      paper.addEventListener('dragstart', e => e.preventDefault());
      paper.append(canvas); drawing.append(toolbar, paper, node('p', 'notebook-tip', 'Draw with a finger, pen or mouse. Your notes stay private.'));
      status = node('span', 'notebook-save'); status.setAttribute('role', 'status'); status.textContent = dirty ? 'Saving…' : 'Saved on this device';
      const footer = node('footer', 'notebook-footer'); footer.append(status, node('span', '', 'Only you · This game · This device'));
      peopleBox = node('div', 'notebook-people'); reportsBox = node('div', 'notebook-reports');
      book.append(top, phaseLabel, tabs, peopleBox, reportsBox, typing, drawing, footer);
      book.addEventListener('cancel', e => { e.preventDefault(); close(); });
      book.addEventListener('close', () => {
        finish(); persist(); observer?.disconnect(); book.remove(); book = canvas = ctx = status = phaseLabel = peopleBox = reportsBox = null;
        document.body.classList.remove('notebook-open'); launcher?.focus({ preventScroll: true });
      });
      document.body.append(book); book.showModal(); document.body.classList.add('notebook-open');
      showMode(mode); observer = new ResizeObserver(resize); observer.observe(canvas);
      // Avoid opening a phone keyboard until the player chooses the text area.
      closeButton.focus({ preventScroll: true });
    }
    function sync(owner, phase, players = [], nextKey = '', builder = null) {
      buildReports = builder;
      if (nextKey !== reportsKey) { reportsKey = nextKey; reportCount = nextKey ? JSON.parse(nextKey).length : 0; renderReports(); const tab = book?.querySelector('[data-note-mode=reports]'); if (tab) tab.textContent = 'Reports' + (reportCount ? ' · ' + reportCount : ''); }
      const next = owner ? 'lt-notebook:' + [owner.code, owner.pid, owner.match].join(':') : '';
      marksKey = owner ? 'lt-night-notes:' + [owner.code, owner.pid, owner.match].join(':') : ''; meId = owner?.pid || '';
      const roster = JSON.stringify(players.map(p => [p.id, p.alive, p.departed]));
      if (roster !== JSON.stringify(people.map(p => [p.id, p.alive, p.departed]))) { people = players; if (mode === 'people') renderPeople(); } else people = players;
      if (next !== key) {
        if (book) close(); persist(); key = next; data = { text: '', strokes: [] }; dirty = false; cleared = null;
        if (key) try { const saved = JSON.parse(localStorage.getItem(key)); if (typeof saved?.text === 'string' && Array.isArray(saved.strokes)) data = saved; } catch {}
      }
      if (!key) { launcher?.remove(); launcher = null; return; }
      if (!launcher) {
        launcher = button('', open, 'notebook-launcher'); launcher.title = 'My Notebook'; launcher.innerHTML = icon; launcher.append(node('span', '', 'Notes'));
        launcher.setAttribute('aria-label', 'Open private notebook'); launcher.setAttribute('aria-haspopup', 'dialog'); host.append(launcher);
      }
      launcher.dataset.phase = phase; if (phaseLabel) phaseLabel.textContent = phase;
    }
    addEventListener('pagehide', () => { finish(); persist(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { finish(); persist(); } });
    return { sync };
  };
})();
