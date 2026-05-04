/**
 * Split a legacy single-file OM300 bundle into `src/om300/sections/*.jsx`.
 *
 * Usage:
 *   node scripts/split-om300.mjs [path-to-legacy.jsx]
 *
 * Default path ../OM300Final_Study_Guide.jsx only works if that file still
 * contains raw `function Ch1(` etc. After migration, pass a backup monolith.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studyHubRoot = path.join(__dirname, "..");
const argPath = process.argv[2];
const legacy = argPath
  ? path.resolve(argPath)
  : path.join(studyHubRoot, "..", "OM300Final_Study_Guide.jsx");
const outDir = path.join(studyHubRoot, "src", "om300", "sections");

const importLine = `import { BulletList, Card, FormulaBox, Grid2, NumList, SLabel, Term } from "../../components/study/StudyTypography.jsx";\n\n`;

const order = [
  "Ch1",
  "Ch3",
  "Ch4",
  "Ch6",
  "Ch6s",
  "Ch7",
  "Ch11",
  "Ch12",
  "Ch16",
  "Formulas",
];

const src = fs.readFileSync(legacy, "utf8");
if (!src.includes("function Ch1(")) {
  console.error(
    "split-om300: no legacy chapter functions found in:",
    legacy,
    "\nPass the path to a full monolithic source file, or edit src/om300/sections/*.jsx directly."
  );
  process.exit(1);
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (let i = 0; i < order.length; i++) {
  const name = order[i];
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const nextName = order[i + 1];
  const end = nextName
    ? src.indexOf(`function ${nextName}(`)
    : src.indexOf("\nconst contentMap");
  if (end < 0) throw new Error(`Boundary after ${name} not found`);
  let block = src.slice(start, end).trim();
  block = block.replace(`function ${name}(`, `export default function ${name}(`);
  const fileName = `${name}.jsx`;
  fs.writeFileSync(path.join(outDir, fileName), importLine + block + "\n", "utf8");
  console.log("wrote", fileName);
}
