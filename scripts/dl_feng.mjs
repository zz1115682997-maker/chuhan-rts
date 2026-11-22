import { writeFile } from 'node:fs/promises';

const res = await fetch('https://aka.doubaocdn.com/s/0kYhFiLOae');
if (!res.ok) { console.log('FAIL', res.status); process.exit(1); }
await writeFile('assets/units/fengjiantai_raw.png', Buffer.from(await res.arrayBuffer()));
console.log('OK fengjiantai_raw.png');
