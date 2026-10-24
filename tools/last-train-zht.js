// Builds public/last-train-i18n-zht.js (Traditional Chinese) from the Simplified file with OpenCC's Taiwan phrasing.
// Run after editing last-train-i18n-zh.js:  npm i --no-save opencc-js && node tools/last-train-zht.js
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const OpenCC = require(process.env.OPENCC_PATH || 'opencc-js');
const toTw = OpenCC.Converter({ from: 'cn', to: 'twp' });
const src = path.join(__dirname, '../public/last-train-i18n-zh.js');
let dict;
vm.runInNewContext(fs.readFileSync(src, 'utf8'), { window: { LT_I18N_REGISTER: (code, d) => { dict = d; } } });
const tw = s => toTw(s);
const exact = Object.fromEntries(Object.entries(dict.exact).map(([k, v]) => [k, tw(v)]));
const patterns = dict.patterns.map(([k, v]) => [k, tw(v)]);
fs.writeFileSync(path.join(__dirname, '../public/last-train-i18n-zht.js'),
  '/* Last Train in Traditional Chinese. Generated from last-train-i18n-zh.js by tools/last-train-zht.js; edit that file instead. */\n' +
  'window.LT_I18N_REGISTER(\'zht\', ' + JSON.stringify({ exact, patterns }) + ');\n');
console.log('zht:', Object.keys(exact).length, 'strings,', patterns.length, 'patterns');
