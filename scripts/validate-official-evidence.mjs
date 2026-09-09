import fs from 'node:fs';

const base=JSON.parse(fs.readFileSync('data/official-evidence.json','utf8'));
const contestPack=JSON.parse(fs.readFileSync('data/contest-official-evidence.json','utf8'));
const rules=[...(base.rules||[]),...(contestPack.rules||[])];
if(rules.length<30) throw new Error(`catálogo oficial insuficiente: ${rules.length} regras`);
const ids=new Set();
const allowed=['planalto.gov.br','www.planalto.gov.br','gov.br','www.gov.br','bcb.gov.br','www.bcb.gov.br','portal.tcu.gov.br','tcu.gov.br','www.tcu.gov.br','tce.sp.gov.br','www.tce.sp.gov.br','tjsp.jus.br','www.tjsp.jus.br','portal.tjsp.jus.br'];
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
const contests=['tcesp','tcu','bacen','cgu','rfb','anpd','tjsp'];
for(const id of contests){
  const own=rules.filter(r=>r.contest===id);
  if(own.length<3) throw new Error(`${id}: cobertura institucional insuficiente (${own.length}); mínimo 3 fontes específicas`);
}
const anpd=rules.filter(r=>r.contest==='anpd');
if(!anpd.some(r=>/lgpd/i.test(`${r.id} ${r.title} ${r.basis}`))) throw new Error('ANPD sem fonte explícita da LGPD');
if(!anpd.some(r=>/regulament/i.test(`${r.id} ${r.title} ${r.basis}`))) throw new Error('ANPD sem regulamentações próprias');
const engine=fs.readFileSync('data/adaptive-engine.js','utf8');
for(const token of ['cpExplanationHTML','cpFindOfficialEvidence','Por que está certo','Por que está errado','Fundamentação oficial']){
  if(!engine.includes(token)) throw new Error(`motor de explicação sem marcador obrigatório: ${token}`);
}
const guard=fs.readFileSync('data/answer-flow-guard.js','utf8');
if(!guard.includes('contest-official-evidence.json')||!guard.includes('__cpContestOfficialEvidenceLoaded')) throw new Error('loader de fontes institucionais não está ativo');
const sw=fs.readFileSync('sw.js','utf8');
for(const asset of ['./data/official-evidence.json','./data/contest-official-evidence.json']) if(!sw.includes(asset)) throw new Error(`${asset} não está no cache offline`);
console.log(`Catálogo oficial OK: ${rules.length} regras; 7/7 concursos com ao menos 3 fontes oficiais específicas.`);
