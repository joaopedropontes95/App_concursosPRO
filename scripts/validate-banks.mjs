import fs from 'node:fs';

const files = [
  'data/banks/tcu-question-bank.json',
  'data/banks/bacen-question-bank.json',
  'data/banks/cgu-question-bank.json',
  'data/banks/rfb-question-bank.json',
  'data/banks/anpd-question-bank.json',
  'data/banks/tjsp-question-bank.json',
  'data/banks/curated/tcesp-v1.json',
  'data/banks/curated/tcu-v1.json',
  'data/banks/curated/tcu-v2.json',
  'data/banks/curated/tcu-v3-p1.json',
  'data/banks/curated/tcu-v3-p2.json',
  'data/banks/curated/tcu-v3-p3.json',
  'data/banks/curated/tcu-v3-p4.json',
  'data/banks/curated/bacen-v1.json',
  'data/banks/curated/bacen-v2.json',
  'data/banks/curated/bacen-v3-p1.json',
  'data/banks/curated/bacen-v3-p2.json',
  'data/banks/curated/cgu-v1.json',
  'data/banks/curated/cgu-v2.json',
  'data/banks/curated/cgu-v3-p1.json',
  'data/banks/curated/cgu-v3-p2.json',
  'data/banks/curated/rfb-v1.json',
  'data/banks/curated/rfb-v2.json',
  'data/banks/curated/rfb-v3-p1.json',
  'data/banks/curated/rfb-v3-p2.json'
];

const allowedDifficulty = new Set(['facil','media','dificil']);
const seen = new Set();
const curatedByContest = {};
let total = 0;
let curated = 0;
let failed = false;

function fail(message){
  failed = true;
  console.error('ERROR:', message);
}

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  let pack;
  try { pack = JSON.parse(raw); }
  catch (e) { fail(`${file}: JSON inválido: ${e.message}`); continue; }
  if (!Array.isArray(pack.questions)) { fail(`${file}: questions não é array`); continue; }
  for (const q of pack.questions) {
    total++;
    if (q.quality === 'curated') {
      curated++;
      curatedByContest[q.contest] = (curatedByContest[q.contest] || 0) + 1;
    }
    if (!q.id || typeof q.id !== 'string') fail(`${file}: questão sem id`);
    else if (seen.has(q.id)) fail(`${file}: id duplicado ${q.id}`);
    else seen.add(q.id);
    if (!q.contest || q.contest !== pack.contest) fail(`${q.id}: contest incompatível com o pack`);
    if (!q.subject || !q.topic || !q.prompt || !q.explain) fail(`${q.id}: campo textual obrigatório ausente`);
    if (!allowedDifficulty.has(q.difficulty)) fail(`${q.id}: difficulty inválida (${q.difficulty})`);
    if (!Array.isArray(q.opts)) fail(`${q.id}: opts não é array`);
    else {
      if (q.type === 'true_false' && q.opts.length !== 2) fail(`${q.id}: item C/E deve ter 2 opções`);
      if (q.type === 'mcq' && q.opts.length !== 5) fail(`${q.id}: múltipla escolha deve ter 5 opções`);
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.opts.length) fail(`${q.id}: índice de resposta inválido`);
    }
    if (!['true_false','mcq'].includes(q.type)) fail(`${q.id}: type inválido (${q.type})`);
  }
}

for (const id of ['tcu','bacen','cgu','rfb']) {
  if ((curatedByContest[id] || 0) < 120) fail(`${id}: menos de 120 questões curated (${curatedByContest[id] || 0})`);
}

let evidence;
try { evidence = JSON.parse(fs.readFileSync('data/historical-exam-evidence.json','utf8')); }
catch (e) { fail(`historical-exam-evidence.json inválido: ${e.message}`); evidence = {contests:{}}; }
for (const id of ['bacen','cgu','rfb']) {
  const c = evidence?.contests?.[id];
  if (!c) { fail(`${id}: evidência histórica ausente`); continue; }
  if (!Array.isArray(c.exams) || c.exams.length !== 5) fail(`${id}: deve possuir exatamente 5 provas históricas`);
  const weights = c.subject_weights;
  if (!weights || !Object.keys(weights).length) fail(`${id}: subject_weights ausente`);
  else for (const [subject,value] of Object.entries(weights)) {
    if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1) fail(`${id}/${subject}: peso histórico inválido (${value})`);
  }
  for (const exam of (c.exams||[])) {
    if (!exam.year || !exam.bank || !exam.weight) fail(`${id}: prova histórica sem year/bank/weight`);
    if (!Array.isArray(exam.sources) || exam.sources.length === 0) fail(`${id}/${exam.year}: fonte histórica ausente`);
  }
}

console.log(`Validated ${total} dedicated questions; ${curated} curated; ${seen.size} unique IDs.`);
console.log('Curated by contest:', curatedByContest);
console.log('Five-exam historical evidence validated for BACEN, CGU and RFB.');
if (failed) process.exit(1);
