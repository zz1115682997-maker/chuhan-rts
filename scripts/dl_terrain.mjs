import { writeFile, mkdir } from 'node:fs/promises';

const items = [
  ['grass', 'https://aka.doubaocdn.com/s/F5A42bZybD'],
  ['dirt', 'https://aka.doubaocdn.com/s/9gWwXNbNIg'],
  ['water', 'https://aka.doubaocdn.com/s/t1BSWJsSJ8'],
  ['rock', 'https://aka.doubaocdn.com/s/B6qgnzg97W'],
  ['tree', 'https://aka.doubaocdn.com/s/5KA9T2MZh8'],
  ['stones', 'https://aka.doubaocdn.com/s/xpBA3e9vNW'],
  ['hill', 'https://aka.doubaocdn.com/s/9u8MlU7EYJ'],
  ['reeds', 'https://aka.doubaocdn.com/s/Km1Dh7awYf'],
];

await mkdir('../assets/terrain/_raw', { recursive: true });
for (const [name, url] of items) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(`../assets/terrain/_raw/${name}.png`, buf);
  console.log(name, buf.length, 'bytes');
}
