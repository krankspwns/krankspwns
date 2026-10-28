// Preserve the original initialization order while extracting focused feature
// files. The files share the existing game scope; no runtime framework needed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function build() {
  require('./build-shared-art')(root);
  const files = JSON.parse(fs.readFileSync(path.join(root, 'src/order.json'), 'utf8'));
  const script = files.map((file) => `\n// Source: src/${file}\n${fs.readFileSync(path.join(root, 'src', file), 'utf8')}`).join('\n');
  new vm.Script(script, { filename: 'app.js' });
  for (const file of ['game-i18n.js', 'game-i18n-zh.js', 'game-i18n-zht.js', 'avatar-art.js', 'arcade.js', 'platform.js', 'game-audio.js', 'game-guide.js', 'emote-art.js', 'grand-con.js', 'table-kit.js', 'bridge.js', 'hot-joker.js', 'last-train.js', 'last-train-audio.js', 'last-train-voice.js', 'last-train-notebook.js', 'last-train-letters.js', 'last-train-test-players.js', 'last-train-test-strategy.js']) new vm.Script(fs.readFileSync(path.join(root, 'public', file), 'utf8'), { filename: file });
  fs.writeFileSync(path.join(root, 'public/app.js'), script);
  fs.copyFileSync(path.join(root, 'src/styles.css'), path.join(root, 'public/styles.css'));
  console.log(`Built ${files.length} frontend files`);
}
build();
if (process.argv.includes('--watch')) {
  let debounce;
  fs.watch(path.join(root, 'src'), () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { try { build(); } catch (error) { console.error(error.message); } }, 100);
  });
}
