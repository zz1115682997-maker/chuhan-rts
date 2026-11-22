import { writeFile } from 'node:fs/promises';

const list = [
  ['bingzu_c_back_raw.png', 'https://aka.doubaocdn.com/s/fErGWUROte'],
  ['scout_back_raw.png', 'https://aka.doubaocdn.com/s/Xjos2KpO1b'],
  ['gongjiang_back_raw.png', 'https://aka.doubaocdn.com/s/wf6krQKnHG'],
  ['han_caiguan_back_raw.png', 'https://aka.doubaocdn.com/s/xoaU6QS2BI'],
  ['chu_zidi_back_raw.png', 'https://aka.doubaocdn.com/s/aDj4CZhusR'],
  ['qingqi_back_raw.png', 'https://aka.doubaocdn.com/s/shEY5xzVvd'],
];

for (const [name, url] of list) {
  const res = await fetch(url);
  if (!res.ok) { console.log('FAIL', name, res.status); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile('assets/units/' + name, buf);
  console.log('OK', name, buf.length);
}
