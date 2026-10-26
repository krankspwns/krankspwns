(() => {
  const query=new URLSearchParams(location.search);
  if(query.has('games'))return;
  if(query.has('room')){location.replace('/reckoning.html'+location.search);return;}
  const read=key=>{try{const seat=JSON.parse(localStorage.getItem(key)||sessionStorage.getItem(key)||'null');return seat?.tok?seat:null;}catch{return null;}};
  let last;try{last=localStorage.getItem('arcade-last-game');}catch{}
  const games=[['reckoning','sct','/reckoning.html'],['grand-con','gc-seat','/grand-con.html'],['last-train','lt-seat','/last-train.html'],['bridge','br-seat','/bridge.html'],['hot-joker','hj-seat','/hot-joker.html']];
  const seats=games.filter(([,key])=>read(key));
  const selected=seats.find(([game])=>game===last)||seats.at(-1);
  if(selected)location.replace(selected[2]);
})();
