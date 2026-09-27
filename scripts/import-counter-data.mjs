// Usage: node scripts/import-counter-data.mjs L123 public path/to/histogram.txt
// Explicit source required: eBird's TXT contains neither a location ID nor source.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHistogram, parseLocation } from '../counter/core.mjs';
const [inputId, source, filename] = process.argv.slice(2);
if (!filename || !['public', 'personal'].includes(source)) throw new Error('Usage: node scripts/import-counter-data.mjs L123 public|personal histogram.txt');
if (source === 'personal') throw new Error('Personal frequency files must be imported locally in the app, never committed to a public repository.');
const id = parseLocation(inputId);
const namedId = path.basename(filename).match(/ebird_(L\d+)_/i)?.[1];
if (namedId && namedId.toUpperCase() !== id) throw new Error('Filename location does not match');
const output = fileURLToPath(new URL('../counter/data/locations.json', import.meta.url));
const data = parseHistogram(fs.readFileSync(filename, 'utf8'), id, source);
data.transport = 'bundled';
data.sourceFile = path.basename(filename);
data.updatedAt = fs.statSync(filename).mtime.toISOString();
const list = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : [];
const next = list.filter(x => x.id !== id).concat(data);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(next, null, 2) + '\n');
console.log(`${id}: ${data.species.length} taxa, twelve weighted monthly frequencies`);
