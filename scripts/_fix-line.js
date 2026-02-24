const fs = require('fs');
const f = 'app/dashboard/admin/tasks/create-video/page.tsx';
const lines = fs.readFileSync(f, 'utf8').split('\n');
// Fix mangled line 72 (index 71)
lines[71] = '                requestId: `task_video_${Date.now()}`,\r';
fs.writeFileSync(f, lines.join('\n'));
console.log('Fixed line 72:', lines[71]);
