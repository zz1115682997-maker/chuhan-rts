import { writeFile } from 'node:fs/promises';

const list = [
  ['zhanche_atk_raw.png', 'https://aka.doubaocdn.com/s/6F7WhIq2Hi'],
  ['zhuangche_atk_raw.png', 'https://aka.doubaocdn.com/s/4WcgOK5GSB'],
  ['weixiuche_atk_raw.png', 'https://aka.doubaocdn.com/s/MmUtYWyViV'],
  ['xiankeng_raw.png', 'https://aka.doubaocdn.com/s/I99jtdxaxz'],
];

for (const [name, url] of list) {
  const res = await fetch(url);
  if (!res.ok) { console.log('FAIL', name, res.status); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile('assets/units/' + name, buf);
  console.log('OK', name, buf.length);
}
