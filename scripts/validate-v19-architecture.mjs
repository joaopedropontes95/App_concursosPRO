import fs from 'node:fs';

const app=fs.readFileSync('app.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const tracks=JSON.parse(fs.readFileSync('data/trilhas.json','utf8')).tracks||{};

const runtimes=[
  './data/tcesp-runtime.js',
  './data/bank-loader-v2.js',
  './data/trilhas-runtime.js?b=19',
  './data/adaptive-engine.js',
  './data/discursive-engine.js',
  './data/performance-dashboard.js',
  './data/answer-flow-guard.js?b=19',
  './data/app-stability.js?b=19'
];

if(!app.includes('data-cp-runtime-bootstrap="v19"')) throw new Error('app.html não possui bootstrap direto v19');
let previous=-1;
for(const src of runtimes){
  const needle=`src="${src}"`;
  const matches=app.split(needle).length-1;
  if(matches!==1) throw new Error(`${src}: esperado exatamente 1 carregamento direto; encontrado ${matches}`);
  const pos=app.indexOf(needle);
  if(pos<=previous) throw new Error(`ordem de runtime inválida em ${src}`);
  previous=pos;
}
if(sw.includes('RUNTIME_TAGS')||sw.includes("replace('</body>'")||sw.includes('injectApp(')){
  throw new Error('Service Worker voltou a injetar runtimes no HTML');
}
if(!sw.includes("const CACHE='concursospro-v19'")) throw new Error('cache PWA não está em v19');

const tcu=(tracks.tcu||{}).units||[];
const mockNodes=tcu.filter(u=>u.id==='simulado'||(u.mode==='mock'&&/simulado/i.test(u.title||'')));
if(mockNodes.length!==1) throw new Error(`TCU deve ter exatamente 1 nó de simulado objetivo; encontrado ${mockNodes.length}`);
const mock=mockNodes[0];
if(mock.id!=='simulado'||mock.mode!=='mock'||mock.title!=='Simulado objetivo'){
  throw new Error('nó de simulado do TCU está com configuração inesperada');
}

console.log('Arquitetura v19 OK: runtimes diretos, SW sem injeção e TCU com simulado objetivo.');
