import fs from 'node:fs';

const data=JSON.parse(fs.readFileSync('data/official-evidence.json','utf8'));
const rules=data.rules||[];
if(rules.length<12) throw new Error(`catálogo oficial insuficiente: ${rules.length} regras`);
const ids=new Set();
const allowed=['planalto.gov.br','www.planalto.gov.br','gov.br','www.gov.br','bcb.gov.br','www.bcb.gov.br','portal.tcu.gov.br','tcu.gov.br','www.tcu.gov.br'];
for(const r of rules){
  if(!r.id||ids.has(r.id)) throw new Error(`id de evidência ausente/duplicado: ${r.id}`);
  ids.add(r.id);
  if(!r.title||!r.basis||!r.summary) throw new Error(`${r.id}: título, fundamento e resumo são obrigatórios`);
  if(!Array.isArray(r.subjects)||!r.subjects.length) throw new Error(`${r.id}: subjects obrigatório`);
  if(!Array.isArray(r.keywords)||!r.keywords.length) throw new Error(`${r.id}: keywords obrigatório`);
  let u;try{u=new URL(r.url)}catch{throw new Error(`${r.id}: URL inválida`)}
  if(u.protocol!=='https:') throw new Error(`${r.id}: fonte deve usar HTTPS`);
  if(!allowed.includes(u.hostname)) throw new Error(`${r.id}: domínio não permitido como fonte oficial: ${u.hostname}`);
}
const engine=fs.readFileSync('data/adaptive-engine.js','utf8');
for(const token of ['cpExplanationHTML','cpFindOfficialEvidence','Por que está certo','Por que está errado','Fundamentação oficial']){
  if(!engine.includes(token)) throw new Error(`motor de explicação sem marcador obrigatório: ${token}`);
}
const sw=fs.readFileSync('sw.js','utf8');
if(!sw.includes('./data/official-evidence.json')) throw new Error('catálogo oficial não está no cache offline');
console.log(`Catálogo oficial OK: ${rules.length} regras validadas em fontes governamentais.`);
