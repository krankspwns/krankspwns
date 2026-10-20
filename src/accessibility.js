// Keyboard placement follows the same actions as pointer placement.
let keyboardPick = null;
function announce(message) {
  let live = document.getElementById('game-announcement');
  if (!live) { live = el('div', { id: 'game-announcement', class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }); document.body.append(live); }
  live.textContent = message;
}
function cardLabel(id, up = true) {
  if (!up || id === '?') return t('hiddenCard');
  if (id === 'JK') return t('jokerLabel');
  const rank = id.slice(0, -1), suit = id.slice(-1);
  return t('cardName', { rank: t('rank' + rank) === 'rank' + rank ? rank : t('rank' + rank), suit: t('suit' + suit) });
}
function focusKey(key) {
  const node = [...document.querySelectorAll('[data-focus]')].find((e) => e.dataset.focus === key);
  if (node) node.focus({ preventScroll: true });
}
function slotKeydown(event, slot) {
  if (event.target !== event.currentTarget) return;
  const slots = [...document.querySelectorAll('.ownpanel [data-slot]')];
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    let index = slot + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
    if (event.key === 'Home') index = 0;
    if (event.key === 'End') index = slots.length - 1;
    slots[(index + slots.length) % slots.length]?.focus();
    return;
  }
  const me = st.players.find((p) => p.id === st.meId);
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault(); keyboardPick = null;
    if (me.board[slot]) act('unplace', { slot });
    focusKey('slot-' + slot); return;
  }
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  if (keyboardPick) {
    const pick = keyboardPick; keyboardPick = null;
    if (pick.src === 'hand') act('place', { card: pick.card, slot });
    else if (pick.src !== slot) act('move', { from: pick.src, to: slot });
    else render();
    announce(t('cardPlaced')); focusKey('slot-' + slot);
  } else if (me.board[slot]) {
    keyboardPick = { src: slot, card: me.board[slot].c };
    render(); focusKey('slot-' + slot); announce(t('selectedCard'));
  }
}
function focusSnapshot(root) {
  const active = document.activeElement;
  if (!active || !root.contains(active) || active === root) return null;
  return { node: active, key: active.dataset.focus, id: active.id, tag: active.tagName, label: active.getAttribute('aria-label'), text: active.textContent, cls: active.className };
}
function restoreFocus(snapshot, root) {
  if (!snapshot) return;
  if (snapshot.node.isConnected) return;
  const nodes = [...root.querySelectorAll(snapshot.tag)];
  const match = nodes.find((n) => snapshot.key ? n.dataset.focus === snapshot.key : snapshot.id ? n.id === snapshot.id : snapshot.label ? n.getAttribute('aria-label') === snapshot.label : n.textContent === snapshot.text && n.className === snapshot.cls);
  match?.focus({ preventScroll: true });
}
const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]';
const visibleFocusables = (root) => [...root.querySelectorAll(focusableSelector)].filter((n) => !n.closest('[inert]') && n.getClientRects().length);
let modalStack = [], modalInert = new Map();
function modalRoot(dialog) {
  let root = dialog;
  while (root.parentElement && root.parentElement !== document.body) root = root.parentElement;
  return root;
}
function topDialog() {
  return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter((n) => n.getClientRects().length).at(-1);
}
function syncDialogs() {
  const dialog = topDialog(), root = dialog && modalRoot(dialog);
  for (const [node, value] of modalInert) node.inert = value;
  modalInert.clear();
  while (modalStack.length && !modalStack.at(-1).root.isConnected) {
    const closed = modalStack.pop();
    if (closed.opener?.isConnected) closed.opener.focus({ preventScroll: true });
    else restoreFocus(closed.snapshot, document);
  }
  if (!dialog) return;
  let entry = modalStack.find((m) => m.root === root);
  if (!entry) {
    const opener = document.activeElement;
    entry = { root, opener, snapshot: focusSnapshot(document.body), focus: null };
    modalStack.push(entry);
  }
  for (const node of document.body.children) {
    if (node === root || ['SCRIPT', 'LINK'].includes(node.tagName) || node.id === 'game-announcement') continue;
    modalInert.set(node, node.inert); node.inert = true;
  }
  if (!dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
    dialog.setAttribute('aria-label', dialog.querySelector('.gtitle, .avtitle, h2, h3, h4')?.textContent || t('title'));
  }
  dialog.tabIndex = -1;
  if (!dialog.contains(document.activeElement)) {
    restoreFocus(entry.focus, dialog);
    if (!dialog.contains(document.activeElement)) (visibleFocusables(dialog)[0] || dialog).focus({ preventScroll: true });
  }
  entry.focus = focusSnapshot(dialog);
}
document.addEventListener('focusin', () => {
  const dialog = topDialog(), entry = modalStack.at(-1);
  if (dialog && entry && dialog.contains(document.activeElement)) entry.focus = focusSnapshot(dialog);
});
document.addEventListener('keydown', (event) => {
  const dialog = topDialog();
  if (dialog) {
    if (event.key === 'Tab') {
      const items = visibleFocusables(dialog), first = items[0] || dialog, last = items.at(-1) || dialog;
      if (!items.length || !dialog.contains(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      const root = modalRoot(dialog);
      if (typeof root.close === 'function') root.close();
      else dialog.querySelector('.gx, .leaverow .ghost, .gfoot button:last-child')?.click();
    }
    return;
  }
  if (event.key === 'Escape' && keyboardPick) {
    event.preventDefault();
    const pick = keyboardPick; keyboardPick = null; render();
    focusKey(pick.src === 'hand' ? 'hand-' + pick.card : 'slot-' + pick.src);
    announce(t('selectionCancelled'));
  }
}, true);
new MutationObserver(syncDialogs).observe(document.body, { childList: true, subtree: true });
