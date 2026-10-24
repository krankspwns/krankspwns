/* Last Train languages: English, Simplified Chinese and Traditional Chinese, like Row of Reckoning (the choice is shared).
   The game is written in English. This layer watches the page and swaps each piece of text, placeholder and label for
   its translation, so every screen, dialog and module is covered without changing how they are built. A dictionary
   holds whole strings; patterns cover text with names or numbers inside ("Night 3", "Write to Ava"). */
(() => {
  'use strict';
  const LANGS = { en: ['EN', 'English', 'en'], zh: ['简体', '简体中文', 'zh-CN'], zht: ['繁體', '繁體中文', 'zh-TW'] };
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  const SKIP = 'script, style, textarea, [contenteditable], [data-no-tr]';
  let lang = 'en';
  try {
    const saved = localStorage.getItem('sct-lang'), nav = (navigator.language || 'en').toLowerCase();
    lang = LANGS[saved] ? saved : nav.startsWith('zh') ? (/tw|hk|mo|hant/.test(nav) ? 'zht' : 'zh') : 'en';
  } catch {}
  const dicts = {}, loading = {}, listeners = new Set();
  let cache = new Map(), compiled = null;
  const harvest = window.LT_I18N_HARVEST ? new Set() : null;
  // Each dictionary file registers itself: { exact: { English: translation }, patterns: [[template, translation]] }.
  // In a template, {0} {1}… stand for any text, {N0} {N1}… for a short name (no sentence punctuation) and {#} for a
  // number; captured text is translated too when it can be.
  window.LT_I18N_REGISTER = (code, dict) => { dicts[code] = dict; if (code === lang) { compiled = null; cache = new Map(); refresh(); } };
  function load(code) {
    if (code === 'en' || dicts[code] || loading[code]) return;
    loading[code] = true;
    const s = document.createElement('script'); s.src = '/last-train-i18n-' + code + '.js'; s.async = true;
    s.onerror = () => { loading[code] = false; };
    document.head.append(s);
  }
  function compile(dict) {
    return (dict.patterns || []).map(([from, to]) => {
      const parts = from.split(/(\{N?\d\}|\{#\})/), order = [];
      const source = parts.map(p => {
        if (p === '{#}') { order.push('#'); return '([\\d.,]+)'; }
        const m = /^\{(N?)(\d)\}$/.exec(p); if (m) { order.push(+m[2]); return m[1] ? '([^.!?,:;。]{1,40}?)' : '(.+?)'; }
        return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('');
      return { re: new RegExp('^' + source + '$'), order, to };
    });
  }
  function core(text, dict) {
    if (!/[A-Za-z]/.test(text)) return text;
    const hit = dict.exact[text]; if (hit !== undefined) return hit;
    if (!compiled) compiled = compile(dict);
    for (const p of compiled) {
      const m = p.re.exec(text); if (!m) continue;
      let num = 0;
      const vals = {}; p.order.forEach((k, i) => { const v = m[i + 1]; if (k === '#') vals['#' + num++] = v; else vals[k] = translate(v) ?? list(v) ?? v; });
      let n = 0;
      return p.to.replace(/\{(\d|#)\}/g, (_, k) => k === '#' ? vals['#' + n++] : vals[k]);
    }
    // Labels joined with " · " are translated part by part ("Host · speaking", "· Night 2").
    if (text.includes('·')) {
      const parts = text.split(/(\s*·\s*)/), out = parts.map((part, i) => i % 2 ? part : translate(part) ?? part);
      if (out.some((part, i) => part !== parts[i])) return out.join('');
    }
    return null;
  }
  // A list inside a pattern ("Careful Passenger, Brave Passenger, Witness") when every item has a translation.
  function list(text) {
    const items = text.split(', '); if (items.length < 2) return null;
    const out = items.map(i => translate(i)); return out.every(Boolean) ? out.join('、') : null;
  }
  // Translates one string, keeping its outer spaces. Returns null when there is nothing to change.
  function translate(text, dict = dicts[lang]) {
    if (!dict || !text || !/[A-Za-z]/.test(text)) return null;
    if (dict === dicts[lang] && cache.has(text)) return cache.get(text);
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text), body = core(m[2], dict);
    const out = body === null ? null : m[1] + body + m[3];
    if (dict === dicts[lang]) { if (cache.size > 6000) cache = new Map(); cache.set(text, out); }
    return out;
  }
  const textOrig = new WeakMap(), attrOrig = new WeakMap();
  const skipped = node => { const p = node.nodeType === 3 ? node.parentElement : node; return !p || !!p.closest(SKIP); };
  function note(text) {
    if (!harvest || harvest.has(text) || !/[A-Za-z]{2}/.test(text)) return;
    harvest.add(text);
    try { navigator.sendBeacon('/__lt-i18n-miss', text); } catch {}
  }
  function doText(node) {
    if (skipped(node)) return;
    const rec = textOrig.get(node);
    const english = rec && node.data === rec.out ? rec.en : node.data;
    if (harvest && dicts.zh && translate(english, dicts.zh) === null) note(english.trim());
    const out = lang === 'en' ? english : translate(english) ?? english;
    textOrig.set(node, { en: english, out });
    if (node.data !== out) node.data = out;
  }
  function doAttr(elm, name) {
    if (!elm.hasAttribute(name) || skipped(elm)) return;
    let recs = attrOrig.get(elm); if (!recs) attrOrig.set(elm, recs = {});
    const value = elm.getAttribute(name), rec = recs[name];
    const english = rec && value === rec.out ? rec.en : value;
    if (harvest && dicts.zh && translate(english, dicts.zh) === null) note(english.trim());
    const out = lang === 'en' ? english : translate(english) ?? english;
    recs[name] = { en: english, out };
    if (value !== out) elm.setAttribute(name, out);
  }
  function walk(rootNode) {
    if (rootNode.nodeType === 3) return doText(rootNode);
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 11) return;
    if (rootNode.nodeType === 1) { if (rootNode.closest(SKIP)) return; ATTRS.forEach(a => doAttr(rootNode, a)); }
    const tw = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (n.nodeType === 3) doText(n); else ATTRS.forEach(a => doAttr(n, a)); }
  }
  let titleEn = document.title;
  function doTitle() {
    if (document.title !== (translate(titleEn) ?? titleEn)) titleEn = document.title;
    const out = lang === 'en' ? titleEn : translate(titleEn) ?? titleEn;
    if (document.title !== out) document.title = out;
  }
  function refresh() { document.documentElement.lang = LANGS[lang][2]; if (document.body) walk(document.body); doTitle(); }
  const observer = new MutationObserver(list => {
    if (lang === 'en' && !harvest) return;
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttr(m.target, m.attributeName);
    }
    doTitle();
  });
  function start() {
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  document.documentElement.lang = LANGS[lang][2];
  load(lang); if (harvest) load('zh');
  window.ltI18n = {
    LANGS,
    get lang() { return lang; },
    set(code) {
      if (!LANGS[code] || code === lang) return;
      lang = code; compiled = null; cache = new Map();
      try { localStorage.setItem('sct-lang', code); } catch {}
      load(code); refresh(); listeners.forEach(f => f(code));
    },
    t: text => lang === 'en' ? text : translate(text) ?? text,
    onChange: f => listeners.add(f),
  };
})();
