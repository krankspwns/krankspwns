(() => {
  const query=new URLSearchParams(location.search);
  if(query.has('games'))return;
  if(query.has('room')){location.replace('/reckoning.html'+location.search);return;}
  const read=key=>{try{const seat=JSON.parse(localStorage.getItem(key)||sessionStorage.getItem(key)||'null');return seat?.tok?seat:null;}catch{return null;}};
  const old=read('sct'),con=read('gc-seat'),last=localStorage.getItem('arcade-last-game');
  if(con&&(!old||last==='grand-con'))location.replace('/grand-con.html');
  else if(old)location.replace('/reckoning.html');
})();
