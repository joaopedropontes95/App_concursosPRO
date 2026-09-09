import fs from 'node:fs';

const app=fs.readFileSync('app.html','utf8');
const ui=fs.readFileSync('data/ui-v22.js','utf8');
const guard=fs.readFileSync('data/answer-flow-guard.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const index=fs.readFileSync('index.html','utf8');

if(/data-view=["']tcesp["']/.test(app)) throw new Error('atalho lateral TCESP ainda existe no HTML');
if(!ui.includes('concursosProLastContest')||!ui.includes('state.lastContest')) throw new Error('persistência do último concurso ausente');
for(const token of ['refreshSubjectFilter','sortedSubjects','contestFilter','subjectFilter']) if(!ui.includes(token)) throw new Error(`filtro cruzado sem ${token}`);
for(const token of ['cpIsSevereLengthCue','cpQuestionDeliveryWeight','historicalSubjectWeight','uniqueLongest']) if(!ui.includes(token)) throw new Error(`realismo de alternativas sem ${token}`);
if(!guard.includes("./data/ui-v22.js?b=22")) throw new Error('ui-v22 não é carregada pelo bootstrap de compatibilidade');
if(!sw.includes("const CACHE='concursospro-v22'")) throw new Error('service worker não está em v22');
if(!sw.includes('./data/ui-v22.js?b=22')) throw new Error('ui-v22 não está no cache offline');
if(!index.includes('sw.js?b=22')||!index.includes('app.html?build=22')) throw new Error('bootstrap não aponta para v22');
console.log('v22 OK: sidebar sem atalho TCESP, último concurso persistente, filtros cruzados e seleção com anti-viés de comprimento.');
