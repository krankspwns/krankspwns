/* Private device-only notes. No notebook content is sent to the game API. */
(() => {
  'use strict';
  window.createTrainNotebook = host => {
    let key = '', data = { text: '', strokes: [] }, launcher, book, canvas, ctx, status, phaseLabel;
    const inks = [['Midnight', '#293248'], ['Ruby', '#a22d46'], ['Emerald', '#22745b'], ['Blue', '#275fbc'], ['Violet', '#7747a8'], ['Amber', '#976313']];
    let ink = inks[0][1];
    let current = null, activePointer = null, mode = 'type', tool = 'pen', dirty = false, saveTimer, observer, cleared = null;
    const node = (tag, cls, text) => {
      const n = document.createElement(tag); n.className = cls || ''; if (text) n.textContent = text; return n;
    };
    const button = (text, click, cls = '') => {
      const n = node('button', cls, text); n.type = 'button'; n.addEventListener('click', click); return n;
    };
    const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 3h13v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M8 3v18M11 8h5M11 12h5M2 7h4M2 17h4"/></svg>';
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
      book.querySelector('.notebook-typing').hidden = mode !== 'type'; book.querySelector('.notebook-drawing').hidden = mode !== 'draw';
      if (mode === 'draw') resize();
    }
    function open() {
      if (book) return;
      book = node('dialog', 'notebook'); book.setAttribute('aria-labelledby', 'notebook-title');
      const top = node('header', 'notebook-header'), title = node('div');
      title.append(node('small', 'eyebrow', 'FOR YOUR EYES ONLY'), Object.assign(node('h2', '', 'My notebook'), { id: 'notebook-title' }));
      const closeButton = button('×', close, 'notebook-close'); closeButton.setAttribute('aria-label', 'Close notebook'); top.append(title, closeButton);
      phaseLabel = node('p', 'notebook-phase'); phaseLabel.textContent = launcher.dataset.phase || 'Your private notes';
      const tabs = node('div', 'notebook-modes'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Notebook mode');
      for (const [value, label] of [['type', 'Type'], ['draw', 'Draw']]) {
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
      tools.append(button('Clear drawing', () => { finish(); if (!data.strokes.length) return; cleared = data.strokes; data.strokes = []; changed(); persist(); redraw(); }));
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
      book.append(top, phaseLabel, tabs, typing, drawing, footer);
      book.addEventListener('cancel', e => { e.preventDefault(); close(); });
      book.addEventListener('close', () => {
        finish(); persist(); observer?.disconnect(); book.remove(); book = canvas = ctx = status = phaseLabel = null;
        document.body.classList.remove('notebook-open'); launcher?.focus({ preventScroll: true });
      });
      document.body.append(book); book.showModal(); document.body.classList.add('notebook-open');
      showMode(mode); observer = new ResizeObserver(resize); observer.observe(canvas);
      // Avoid opening a phone keyboard until the player chooses the text area.
      closeButton.focus({ preventScroll: true });
    }
    function sync(owner, phase) {
      const next = owner ? 'lt-notebook:' + [owner.code, owner.pid, owner.match].join(':') : '';
      if (next !== key) {
        if (book) close(); persist(); key = next; data = { text: '', strokes: [] }; dirty = false; cleared = null;
        if (key) try { const saved = JSON.parse(localStorage.getItem(key)); if (typeof saved?.text === 'string' && Array.isArray(saved.strokes)) data = saved; } catch {}
      }
      if (!key) { launcher?.remove(); launcher = null; return; }
      if (!launcher) {
        launcher = button('', open, 'notebook-launcher'); launcher.innerHTML = icon; launcher.append(node('span', '', 'Notes'));
        launcher.setAttribute('aria-label', 'Open private notebook'); launcher.setAttribute('aria-haspopup', 'dialog'); host.append(launcher);
      }
      launcher.dataset.phase = phase; if (phaseLabel) phaseLabel.textContent = phase;
    }
    addEventListener('pagehide', () => { finish(); persist(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { finish(); persist(); } });
    return { sync };
  };
})();
