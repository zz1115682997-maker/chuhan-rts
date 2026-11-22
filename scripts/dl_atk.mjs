import { writeFile } from 'node:fs/promises';

const list = [
  ['bingzu_c_atk_raw.png', 'https://aka.doubaocdn.com/s/uxw5a282ea'],
  ['scout_atk_raw.png', 'https://aka.doubaocdn.com/s/EKlcBqkt10'],
  ['gongjiang_atk_raw.png', 'https://aka.doubaocdn.com/s/YQzF8OY0p7'],
  ['han_caiguan_atk_raw.png', 'https://aka.doubaocdn.com/s/H0j2cTTTuR'],
  ['chu_zidi_atk_raw.png', 'https://aka.doubaocdn.com/s/XaBYFGP9CL'],
  ['qingqi_atk_raw.png', 'https://aka.doubaocdn.com/s/giA4YuWPxS'],
];

for (const [name, url] of list) {
  const res = await fetch(url);
  if (!res.ok) { console.log('FAIL', name, res.status); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile('assets/units/' + name, buf);
  console.log('OK', name, buf.length);
}
