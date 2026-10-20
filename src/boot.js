// a phone's address bar sliding away fires height-only resizes while scrolling: only a real width change (rotation) needs a rebuild
let resizeT, lastW = window.innerWidth;
window.addEventListener('resize', () => { if (window.innerWidth === lastW) return; lastW = window.innerWidth; clearTimeout(resizeT); resizeT = setTimeout(() => { if (st && !dragging) safeRender(); }, 150); });
document.getElementById('guideBtn').addEventListener('click', () => openGuide(0));
document.getElementById('setBtn').addEventListener('click', openSettings);
document.getElementById('shopBtn').addEventListener('click', () => openShop());
applyUi();
applyStatic();
if (session) { poll().then(() => { if (session) startPolling(); }); } 
render();
