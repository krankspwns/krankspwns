// Manual asset export: node tools/build-brand-icons.js (requires ImageMagick).
// Keep the generated source intact; trim transparent padding and center each export.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=path.join(root,'assets/brand/game-room-source.png'),out=path.join(root,'public');
const magick=args=>execFileSync('magick',args,{maxBuffer:8*1024*1024});
fs.mkdirSync(path.join(out,'brand'),{recursive:true});
const mark=path.join(out,'brand/game-room-mark.png');
const bounds=magick([source,'-alpha','extract','-threshold','10%','-format','%@','info:']).toString().trim();
magick([source,'-crop',bounds,'+repage','-resize','400x400','-gravity','center','-background','none','-extent','512x512',mark]);
for(const [name,size] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]])magick([mark,'-resize',size+'x'+size,'-background','#0e1426','-alpha','remove','-alpha','off',path.join(out,name)]);
// An Android maskable icon keeps all important artwork inside the central safe circle.
magick([source,'-crop',bounds,'+repage','-resize','300x300','-gravity','center','-background','#0e1426','-extent','512x512','-alpha','remove','-alpha','off',path.join(out,'icon-maskable-512.png')]);
const favicon=magick([mark,'-resize','96x96','png:-']).toString('base64');
fs.writeFileSync(path.join(out,'icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0e1426"/><image width="64" height="64" href="data:image/png;base64,'+favicon+'"/></svg>\n');
magick([mark,'-resize','128x128',mark]);
console.log('Exported centered Game Room logo, favicon and app icons.');
