// Shared bot seats have no recoverable client token and can never become host.
const crypto=require('node:crypto');
const NAMES=['Mei','Bao','Wei','Luna','Ash','Jun','Nora','Kai','Mina','Ken','Sora','Yuki'];
const present=room=>room.players.filter(p=>!p.departed&&!p.kicked&&!p.released);
function add(room,max,key='tokenHash'){
  const taken=new Set(room.players.map(p=>p.name));
  const names=NAMES.map(n=>n+' [Bot]').filter(n=>!taken.has(n));
  const name=names.length?names[crypto.randomInt(names.length)]:'Bot '+crypto.randomInt(1000);
  const used=new Set(room.players.map(p=>p.avatarIndex));
  const avatarIndex=Array.from({length:max},(_,i)=>i).find(i=>!used.has(i))??0;
  const bot={id:crypto.randomUUID(),name,bot:true,avatarIndex,[key]:crypto.randomBytes(32).toString('hex')};
  room.players.push(bot);return bot;
}
function remove(room,targetId){
  const bot=targetId?room.players.find(p=>p.id===targetId&&p.bot):room.players.filter(p=>p.bot).at(-1);
  if(!bot)throw Object.assign(Error('There are no bots to remove.'),{status:409});
  room.players=room.players.filter(p=>p.id!==bot.id);return bot;
}
// Persist the wait so polling from several phones cannot make bots act faster.
function due(bot,key,{min=1000,spread=1800}={}){
  if(process.env.BOT_FAST==='1')return {act:true,changed:false};
  if(bot.botWait?.key!==key){bot.botWait={key,at:Date.now()+min+crypto.randomInt(spread)};return {act:false,changed:true};}
  return {act:Date.now()>=bot.botWait.at,changed:false};
}
const pick=list=>list.length?list[crypto.randomInt(list.length)]:null;
const canEarn=room=>!room.players.some(p=>p.bot)||present(room).filter(p=>!p.bot).length>=2;
module.exports={add,remove,due,pick,present,canEarn};
