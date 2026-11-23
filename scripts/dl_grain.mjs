import { mkdirSync, createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'assets', 'terrain', '_raw3');
mkdirSync(out, { recursive: true });

const list = [
  ['grainCart', 'https://aka.doubaocdn.com/s/Y4PZTsg5ff'],
];

for (const [name, url] of list) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(name + ' ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  createWriteStream(join(out, name + '.png')).end(buf);
  console.log('ok', name, buf.length);
}
