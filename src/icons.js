const SUIT = { S:'♠', H:'♥', D:'♦', C:'♣' };


// ---- icons: one consistent set of line icons (drawn here, no emoji) ----
const ICONS = {
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 19.5c.4-3.4 3-5.5 6.2-5.5s5.8 2.1 6.2 5.5"/><circle cx="17.2" cy="9" r="2.5"/><path d="M16.5 14.3c2.6.1 4.5 1.9 4.9 4.7"/>',
  cards: '<rect x="3.5" y="5.5" width="10.5" height="14.5" rx="2" transform="rotate(-10 8.75 12.75)"/><rect x="9.8" y="4" width="10.5" height="14.5" rx="2" transform="rotate(9 15 11.25)" fill="currentColor" fill-opacity=".3"/><path d="M15 9.2c.9-1.2 2.8-.6 2.8.9 0 1.4-2.8 3-2.8 3s-2.8-1.6-2.8-3c0-1.5 1.9-2.1 2.8-.9z" fill="currentColor" stroke="none" transform="rotate(9 15 11.25)"/>',
  rows: '<rect x="9.5" y="2.8" width="5" height="4.6" rx="1"/><rect x="6" y="9.2" width="5" height="4.6" rx="1"/><rect x="13" y="9.2" width="5" height="4.6" rx="1"/><rect x="2.5" y="15.6" width="5" height="4.6" rx="1"/><rect x="9.5" y="15.6" width="5" height="4.6" rx="1"/><rect x="16.5" y="15.6" width="5" height="4.6" rx="1"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M7.8 12.4l2.9 2.9 5.6-5.8"/>',
  tick: '<path d="M5 12.8l4.4 4.4L19 7.6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M14.5 5.5l4 4L8 20H4v-4z"/><path d="M12.5 7.5l4 4"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M2 12s3.6-6.5 10-6.5c2 0 3.7.6 5.1 1.4M22 12s-3.6 6.5-10 6.5c-2 0-3.7-.6-5.1-1.4"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/><path d="M4 4l16 16"/>',
  bag: '<path d="M5.5 8.5h13l-1 11.5h-11z"/><path d="M9 10.5V7.5a3 3 0 016 0v3"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11"/><path d="M12 9S9.500 4.500 7.500 6s1 3 4.500 3zM12 9s2.500-4.500 4.500-3-1 3-4.500 3z"/>',
  zap: '<path d="M13.2 2.5L4.8 13.4h6.2l-1 8.1 8.4-11h-6.2z" fill="currentColor" fill-opacity=".32"/>',
  hand: '<path d="M9 11V5.2a1.6 1.6 0 013.2 0V10.5M12.2 9.6a1.6 1.6 0 013.2 0v1.4M15.4 10.7a1.6 1.6 0 013.2 0V15a6.2 6.2 0 01-6.2 6.2h-.6A6.3 6.3 0 016.8 18L4.2 14a1.4 1.4 0 012.3-1.6L9 15"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.6"/><path d="M10.8 18.4h2.4"/>',
  ticket: '<path d="M3.5 7.5h17v3a2 2 0 000 4v3h-17v-3a2 2 0 000-4z"/><path d="M14.5 7.5v1.8M14.5 11.1v1.8M14.5 14.7v1.8"/>',
  crown: '<path d="M3.5 8.5l4.6 4 3.9-7 3.9 7 4.6-4-1.9 10.5H5.4z" fill="currentColor" fill-opacity=".3"/>',
  hourglass: '<path d="M7 3h10M7 21h10M8 3v3.8l4 4.7-4 4.7V21M16 3v3.8l-4 4.7 4 4.7V21"/>',
  wifi: '<path d="M2.5 9.2a14.5 14.5 0 0119 0M5.6 12.6a10 10 0 0112.8 0M8.8 16a5.4 5.4 0 016.4 0"/><circle cx="12" cy="19.4" r=".9" fill="currentColor"/>',
  'wifi-off': '<path d="M5.6 12.6a10 10 0 015-2.5M8.8 16a5.4 5.4 0 016.4 0M2.5 9.2a14.5 14.5 0 016-3.2"/><circle cx="12" cy="19.4" r=".9" fill="currentColor"/><path d="M4 4l16 16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 014.9.7c0 1.7-2.5 2.1-2.5 3.7"/><circle cx="12" cy="17.2" r=".9" fill="currentColor"/>',
  'user-x': '<circle cx="9.5" cy="8" r="3.4"/><path d="M3 19.5c.4-3.5 3-5.6 6.5-5.6 1.2 0 2.3.2 3.2.7"/><path d="M16.5 14.5l5 5M21.5 14.5l-5 5"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2"/><path d="M15.5 8.5V6.2A2.2 2.2 0 0013.3 4H6.2A2.2 2.2 0 004 6.2v7.1a2.2 2.2 0 002.2 2.2h2.3"/>',
  logout: '<path d="M9.5 4H6A2 2 0 004 6v12a2 2 0 002 2h3.5"/><path d="M15 8l4 4-4 4M19 12H9.5"/>',
  shuffle: '<path d="M3 7h3.5c3 0 4.5 2 6 5s3 5 6 5H21M3 17h3.5c1.5 0 2.7-.6 3.7-1.7M21 7h-2.5c-1.5 0-2.7.6-3.7 1.7M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5"/>',
  'volume-x': '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" fill-opacity=".3"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  'volume-2': '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" fill-opacity=".3"/><path d="M15.5 9.2a4 4 0 010 5.6M18.2 6.6a8 8 0 010 10.8"/>',
  music: '<path d="M9 17.5V6.2l10-2v11.3"/><circle cx="6.5" cy="17.6" r="2.5" fill="currentColor" fill-opacity=".35"/><circle cx="16.5" cy="15.6" r="2.5" fill="currentColor" fill-opacity=".35"/>',
  trophy: '<path d="M7.5 4h9v5.2a4.5 4.5 0 01-9 0z" fill="currentColor" fill-opacity=".32"/><path d="M7.5 5.5H4.2c0 3 1.3 4.6 3.5 4.9M16.5 5.5h3.3c0 3-1.3 4.6-3.5 4.9M12 13.7V17M8.5 20h7M9.5 17h5v3h-5z"/>',
  book: '<path d="M12 6.6C10.2 5.1 7.5 4.6 3.8 4.9v13.3c3.7-.3 6.4.2 8.2 1.7 1.8-1.5 4.5-2 8.2-1.7V4.9c-3.7-.3-6.4.2-8.2 1.7z" fill="currentColor" fill-opacity=".25"/><path d="M12 6.6v13.3M6.4 8.7c1.2 0 2.3.1 3.2.4M6.4 12c1.2 0 2.3.1 3.2.4M17.6 8.7c-1.2 0-2.3.1-3.2.4M17.6 12c-1.2 0-2.3.1-3.2.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/><circle cx="12" cy="15" r="1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.2"/><circle cx="12" cy="7.8" r=".9" fill="currentColor"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2"/><path d="M14 14h3v3M20.5 14v.5M14 20.5h2.5M20.5 17v3.5M17.5 20.5h.5"/>',
  caret: '<path d="M6 9.5l6 6 6-6"/>',
  sliders: '<path d="M4 7h8M18 7h2M4 17h2M12 17h8"/><circle cx="15" cy="7" r="2.4"/><circle cx="9" cy="17" r="2.4"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 8.5V13l3 2M9.5 3h5"/>',
  chat: '<path d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v7a2.5 2.5 0 01-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 014 13.5z" fill="currentColor" fill-opacity=".25"/><path d="M8 9h8M8 12h5"/>',
  send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
};
// full-colour versions of the icons people see most (the small functional ones: tick, cross, caret, volume stay as simple line icons)
const COLOR_ICONS = {
  users: '<circle cx="21" cy="10.500" r="4.600" fill="#ff8fc0"/><path d="M12.500 27c0-5 3.800-8.800 8.500-8.800s8.500 3.800 8.500 8.800z" fill="#ff5a9a"/><circle cx="11" cy="11.500" r="5.200" fill="#6bd6ff"/><path d="M2 28c0-5.600 4-9.800 9-9.800s9 4.200 9 9.800z" fill="#3a7bff"/><path d="M6.500 8.500q2-2 5-1.600" stroke="#fff" stroke-width="1.200" stroke-linecap="round" fill="none" opacity=".55"/>',
  link: '<path d="M13.500 18.500l5-5" stroke="#ffd23f" stroke-width="3" stroke-linecap="round"/><path d="M12.200 14.600l-3.300 3.300a4.800 4.800 0 006.800 6.800l3.300-3.300" fill="none" stroke="#4fb4ff" stroke-width="4.200" stroke-linecap="round"/><path d="M19.800 17.400l3.300-3.300a4.800 4.800 0 00-6.800-6.800L13 10.600" fill="none" stroke="#ff7ab0" stroke-width="4.200" stroke-linecap="round"/>',
  copy: '<rect x="3" y="3" width="17" height="21" rx="3.500" fill="#8f6bff"/><rect x="11" y="8" width="18" height="21" rx="3.500" fill="#fff"/><rect x="11" y="8" width="18" height="7" rx="3.500" fill="#cfe3ff"/><path d="M15 19.500h10M15 24h6.500" stroke="#3a7bff" stroke-width="2" stroke-linecap="round"/>',
  logout: '<path d="M4 4h12.500a2 2 0 012 2v6h-3.500V8H7.500v16H15v-4h3.500v6a2 2 0 01-2 2H4z" fill="#ffb02e"/><path d="M4 4h12.500a2 2 0 012 2v1H7.500v18H4z" fill="#ffd23f" opacity=".6"/><path d="M14 16h12.500M22 10.500l5.500 5.500-5.500 5.500" fill="none" stroke="#ff5a5a" stroke-width="3.400" stroke-linecap="round" stroke-linejoin="round"/>',
  clock: '<circle cx="16" cy="17.500" r="11.500" fill="#ff9a1f"/><circle cx="16" cy="17.500" r="9.200" fill="#fff"/><rect x="13" y="2" width="6" height="3" rx="1.500" fill="#ffd23f"/><path d="M16 17.500V11M16 17.500l4.400 2.600" stroke="#3a7bff" stroke-width="2.400" stroke-linecap="round"/><circle cx="16" cy="17.500" r="1.500" fill="#e8352e"/><path d="M26.500 7.500l1.800-1.800" stroke="#ffd23f" stroke-width="2.400" stroke-linecap="round"/>',
  swap: '<path d="M26 12A10.500 10.500 0 007.500 9" fill="none" stroke="#4fd17a" stroke-width="3.600" stroke-linecap="round"/><path d="M7 3.500l.4 6.800 6.400-1.300" fill="none" stroke="#4fd17a" stroke-width="3.600" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 20a10.500 10.500 0 0018.500 3" fill="none" stroke="#4fb4ff" stroke-width="3.600" stroke-linecap="round"/><path d="M25 28.500l-.4-6.800-6.400 1.300" fill="none" stroke="#4fb4ff" stroke-width="3.600" stroke-linecap="round" stroke-linejoin="round"/>',
  sliders: '<rect x="3" y="5" width="26" height="4.600" rx="2.300" fill="#e8ecff" opacity=".3"/><rect x="3" y="13.700" width="26" height="4.600" rx="2.300" fill="#e8ecff" opacity=".3"/><rect x="3" y="22.400" width="26" height="4.600" rx="2.300" fill="#e8ecff" opacity=".3"/><rect x="3" y="5" width="15" height="4.600" rx="2.300" fill="#ff5a8a"/><rect x="3" y="13.700" width="21" height="4.600" rx="2.300" fill="#4fb4ff"/><rect x="3" y="22.400" width="10" height="4.600" rx="2.300" fill="#4fd17a"/><circle cx="18" cy="7.300" r="3.600" fill="#fff" stroke="#ff5a8a" stroke-width="1.600"/><circle cx="24" cy="16" r="3.600" fill="#fff" stroke="#4fb4ff" stroke-width="1.600"/><circle cx="13" cy="24.700" r="3.600" fill="#fff" stroke="#4fd17a" stroke-width="1.600"/>',
  'user-x': '<circle cx="13" cy="10" r="5.600" fill="#6bd6ff"/><path d="M2 28c0-6 4.800-10.500 11-10.500s11 4.500 11 10.500z" fill="#3a7bff"/><circle cx="24.500" cy="21.500" r="6.800" fill="#ff5a5a" stroke="#fff" stroke-width="1.400"/><path d="M21.700 18.700l5.600 5.600M27.300 18.700l-5.600 5.600" stroke="#fff" stroke-width="2.200" stroke-linecap="round"/>',
  trophy: '<path d="M9 5h14v8a7 7 0 01-14 0z" fill="#ffcf40"/><path d="M9 7H4.500q-.5 6 4.500 8M23 7h4.500q.5 6-4.500 8" fill="none" stroke="#ffb02e" stroke-width="2.400" stroke-linecap="round"/><path d="M13 20h6v3h-6z" fill="#e0a21a"/><rect x="9.500" y="23" width="13" height="4" rx="1.500" fill="#ffb02e"/><path d="M11.500 7v6" stroke="#fff" stroke-width="1.800" stroke-linecap="round" opacity=".6"/><path d="M16 8l1 2.200 2.300.3-1.700 1.600.4 2.300-2-1.100-2 1.100.4-2.300-1.700-1.600 2.300-.3z" fill="#fff6c9"/>',
  zap: '<path d="M18.500 2.500L6 17.500h7.500L11.500 29.500 26 13h-8z" fill="#ffcf40" stroke="#ff9a1f" stroke-width="1.600" stroke-linejoin="round"/><path d="M17 6.500L10 15" stroke="#fff" stroke-width="1.600" stroke-linecap="round" opacity=".65"/>',
  hand: '<path d="M9 17V8.500a2 2 0 014 0V15M13 14V6a2 2 0 014 0v8M17 14V7a2 2 0 014 0v8M21 15V10a2 2 0 014 0v8c0 6-3.500 10-9 10-4.500 0-7-2-9.500-6l-3-5a2 2 0 013.200-2.200L9 18.500" fill="#ffd36b" stroke="#e0a21a" stroke-width="1.400" stroke-linejoin="round" stroke-linecap="round"/>',
  phone: '<rect x="8" y="2" width="16" height="28" rx="4" fill="#2b3350"/><rect x="10" y="5.500" width="12" height="18.500" rx="1.500" fill="#6bd6ff"/><rect x="10" y="5.500" width="12" height="8" rx="1.500" fill="#b6f0ff"/><circle cx="16" cy="27" r="1.400" fill="#8a96b8"/>',
  ticket: '<path d="M3 9a2 2 0 012-2h22a2 2 0 012 2v3.500a3.500 3.500 0 000 7V23a2 2 0 01-2 2H5a2 2 0 01-2-2v-3.500a3.500 3.500 0 000-7z" fill="#ff8a1f"/><path d="M20 7v18" stroke="#fff" stroke-width="1.600" stroke-dasharray="2.500 2.500" opacity=".8"/><path d="M10.500 12.500l1.200 2.500 2.700.4-2 1.900.5 2.700-2.400-1.300-2.400 1.300.5-2.700-2-1.900 2.700-.4z" fill="#fff6c9"/>',
  info: '<circle cx="16" cy="16" r="13" fill="#4fb4ff"/><circle cx="16" cy="16" r="13" fill="none" stroke="#fff" stroke-width="1.200" opacity=".5"/><circle cx="16" cy="9.800" r="2" fill="#fff"/><path d="M16 14.500v8.500" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
  eye: '<path d="M2 16s5-9 14-9 14 9 14 9-5 9-14 9S2 16 2 16z" fill="#fff"/><circle cx="16" cy="16" r="6.800" fill="#3a7bff"/><circle cx="16" cy="16" r="3.200" fill="#13224a"/><circle cx="14.200" cy="14.200" r="1.500" fill="#fff"/>',
  'volume-x': '<defs><linearGradient id="vxg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8c0d8"/><stop offset="1" stop-color="#7c86a6"/></linearGradient></defs><path d="M3 12h5.500L15 6v20l-6.500-6H3z" fill="url(#vxg)"/><path d="M20 12.500l7 7M27 12.500l-7 7" stroke="#ff5a5a" stroke-width="3.200" stroke-linecap="round"/>',
  'volume-2': '<defs><linearGradient id="v2g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6bd6ff"/><stop offset="1" stop-color="#3a7bff"/></linearGradient></defs><path d="M3 12h5.500L15 6v20l-6.500-6H3z" fill="url(#v2g)"/><path d="M19.500 12a5.500 5.500 0 010 8" fill="none" stroke="#5ee8b0" stroke-width="3" stroke-linecap="round"/><path d="M23.500 8.500a10.500 10.500 0 010 15" fill="none" stroke="#ffd23f" stroke-width="3" stroke-linecap="round"/>',
  music: '<defs><linearGradient id="mug" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8fc0"/><stop offset="1" stop-color="#8f6bff"/></linearGradient></defs><path d="M10.500 8.500L25.500 5v4.500L10.500 13z" fill="url(#mug)"/><rect x="10.500" y="9" width="3" height="15" rx="1.500" fill="#ff5a9a"/><rect x="22.500" y="6" width="3" height="15" rx="1.500" fill="#8f6bff"/><ellipse cx="8.800" cy="24.800" rx="5.300" ry="4" fill="#ff5a9a" transform="rotate(-18 8.800 24.800)"/><ellipse cx="20.800" cy="21.800" rx="5.300" ry="4" fill="#8f6bff" transform="rotate(-18 20.800 21.800)"/><path d="M6 23.500q2-1.200 4-.4" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".5" fill="none"/>',
  qr: '<rect x="3" y="3" width="26" height="26" rx="4" fill="#fff"/><rect x="6" y="6" width="8" height="8" rx="1.800" fill="#14182b"/><rect x="18" y="6" width="8" height="8" rx="1.800" fill="#14182b"/><rect x="6" y="18" width="8" height="8" rx="1.800" fill="#14182b"/><rect x="8" y="8" width="4" height="4" rx=".8" fill="#4fd1c5"/><rect x="20" y="8" width="4" height="4" rx=".8" fill="#4fd1c5"/><rect x="8" y="20" width="4" height="4" rx=".8" fill="#4fd1c5"/><path d="M18 18h3v3h-3zM23 18h3v3M18 23h3M23 23h3v3h-3z" fill="#ff7ab0"/>',
};

function icon(name, size = 18, cls = '') {
  if (COLOR_ICONS[name] && !cls.includes('mono')) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    c.setAttribute('viewBox', '0 0 32 32'); c.setAttribute('width', size); c.setAttribute('height', size); c.setAttribute('aria-hidden', 'true');
    c.setAttribute('class', 'ic ic-c ic-' + name + ' ' + cls); c.innerHTML = uniqSvg(COLOR_ICONS[name]);
    return c;
  }
  const e = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  e.setAttribute('viewBox', '0 0 24 24'); e.setAttribute('width', size); e.setAttribute('height', size);
  e.setAttribute('fill', 'none'); e.setAttribute('stroke', 'currentColor'); e.setAttribute('stroke-width', '1.8');
  e.setAttribute('stroke-linecap', 'round'); e.setAttribute('stroke-linejoin', 'round'); e.setAttribute('aria-hidden', 'true');
  e.setAttribute('class', 'ic ic-' + name + ' ' + cls);
  e.innerHTML = ICONS[name] || '';
  return e;
}
const withIcon = (name, text, size = 16) => el('span', { class: 'iconlabel' }, icon(name, size), text);


