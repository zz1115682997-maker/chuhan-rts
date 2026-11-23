import { writeFile, mkdir } from 'node:fs/promises';

const items = [
  ['tree', 'https://aka.doubaocdn.com/s/Fazdu2zwIg'],
  ['stones', 'https://aka.doubaocdn.com/s/NJ74iy3qe9'],
  ['hill', 'https://aka.doubaocdn.com/s/AUalU4muTb'],
  ['reeds', 'https://aka.doubaocdn.com/s/vzVCodIdC9'],
  ['shuaita', 'https://aka.doubaocdn.com/s/6HQQSVfD4m'],
  ['grainCart', 'https://aka.doubaocdn.com/s/Lhz6es1sRH'],
  ['grass', 'https://aka.doubaocdn.com/s/ng5f6LraY8'],
  ['dirt', 'https://aka.doubaocdn.com/s/TBLPlTPbfU'],
  ['water', 'https://aka.doubaocdn.com/s/U7UBfVNtQm'],
  ['rock', 'https://aka.doubaocdn.com/s/xWfbV6wuEM'],
];

await mkdir(new URL('../assets/terrain/_raw2/', import.meta.url), { recursive: true });
for (const [name, url] of items) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(new URL(`../assets/terrain/_raw2/${name}.png`, import.meta.url), buf);
  console.log(name, buf.length);
}
