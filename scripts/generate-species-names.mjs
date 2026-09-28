// Input: official https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=csv&locale=zh
// Public names/codes only; never pass personal observation CSVs to this script.
import fs from "node:fs";
import { parseCSV } from "../counter/personal.mjs";
const file = process.argv[2];
if (!file) throw new Error("Provide the official taxonomy CSV path");
const [header, ...rows] = parseCSV(fs.readFileSync(file, "utf8"));
const n = header.indexOf("COMMON_NAME"),
  c = header.indexOf("SPECIES_CODE");
if (n < 0 || c < 0 || rows.length < 10000)
  throw new Error("Not a full official taxonomy CSV");
const names = Object.fromEntries(rows.map((r) => [r[n], r[c]]));
// The public chart sometimes displays the broader parent name instead of the
// reporting form (e.g. 原鴿). Keep both forms recognizable.
for (const s of JSON.parse(
  fs.readFileSync(
    new URL("../counter/data/species-names.json", import.meta.url),
  ),
).species)
  names[s.name] ||= s.code;
const p = new URL("../EBirdTextInputAssistant.user.js", import.meta.url);
const source = fs
  .readFileSync(p, "utf8")
  .replace(
    /\/\/ BEGIN GENERATED FULL NAMES[\s\S]*?\/\/ END GENERATED FULL NAMES/,
    "// BEGIN GENERATED FULL NAMES (scripts/generate-species-names.mjs)\n    const fullSpeciesNames = Object.freeze(" +
      JSON.stringify(names, null, 4) +
      ");\n    // END GENERATED FULL NAMES",
  );
fs.writeFileSync(p, source);
console.log(`Generated ${Object.keys(names).length} full names`);
