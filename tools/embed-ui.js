// Mechanical embedding: preserve single-file/offline entry points and their equality.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'ketime _demo_0.1.html'), 'utf8').replace(/\r/g, '');
for (const file of ['bupt-import.js', 'bupt-ui.js', 'school-tools.js', 'school-ui.js', 'schedule-overlap.js', 'daily-reminders.js', 'chatgpt-ui.js', 'schedule-assistant.js', 'ai-providers.js']) {
  const marker = '<script data-ketime-module="' + file + '">\n';
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r/g, '').trimEnd();
  if (source.includes('</script>')) throw Error('Unsafe embedded source: ' + file);
  const start = html.indexOf(marker), script = marker + source + '\n</script>';
  if (start >= 0) {
    const end = html.indexOf('\n</script>', start);
    if (end < 0) throw Error('Missing script end: ' + file);
    html = html.slice(0, start) + script + html.slice(end + '\n</script>'.length);
  } else {
    if (!['chatgpt-ui.js', 'schedule-assistant.js', 'ai-providers.js'].includes(file) || !html.includes('</body>')) throw Error('Missing module: ' + file);
    // ChatGPT mounts after the main application creates the settings modal.
    html = html.replace('</body>', script + '\n</body>');
  }
}
for (const entry of ['ketime _demo_0.1.html', '刻时 小样.html']) fs.writeFileSync(path.join(root, entry), html);
console.log('Embedded modules synchronized into both HTML entry points.');
