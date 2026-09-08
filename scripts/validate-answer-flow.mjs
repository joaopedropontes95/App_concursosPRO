import fs from 'node:fs';
import vm from 'node:vm';

const tracks=JSON.parse(fs.readFileSync('data/trilhas.json','utf8')).tracks||{};
const ids=['tcesp','tcu','bacen','cgu','rfb','anpd','tjsp'];
for(const id of ids){if(!tracks[id])throw new Error(`Trilha ausente: ${id}`)}

const source=fs.readFileSync('data/answer-flow-guard.js','utf8');
const elements=new Map();
function makeElement(tag='div'){
  const el={tag,id:'',hidden:false,innerHTML:'',isConnected:false,setAttribute(){},appendChild(child){child.isConnected=true;if(child.id)elements.set(child.id,child);return child},remove(){this.isConnected=false;if(this.id)elements.delete(this.id)}};
  return el;
}
const body=makeElement('body');body.isConnected=true;
const quizArea=makeElement('div');quizArea.id='quizArea';quizArea.isConnected=true;elements.set('quizArea',quizArea);
const document={body,getElementById:id=>elements.get(id)||null,createElement:tag=>makeElement(tag)};
let originalCalls=0;
const context={
  document,
  console,
  setInterval,
  clearInterval,
  setTimeout,
  current:{explain:'Explicação de teste'},
  record(q,ok){if(!document.getElementById('daysTCESP'))throw new Error(`daysTCESP ausente em ${q.contest}`);originalCalls++;return {q,ok}},
  window:{cpAdaptiveAnswer(){throw new Error('falha simulada após resposta')}}
};
context.window.record=context.record;
context.window.cpAdaptiveNext=()=>{};
vm.createContext(context);
vm.runInContext(source,context,{filename:'answer-flow-guard.js'});

for(const id of ids){context.record({contest:id,id:`test-${id}`},true);if(document.getElementById('daysTCESP'))throw new Error(`ghost daysTCESP não removido após ${id}`)}
if(originalCalls!==ids.length)throw new Error(`record chamado ${originalCalls} vezes; esperado ${ids.length}`);

context.window.cpAdaptiveAnswer(0);
const feedback=document.getElementById('adaptiveFeedback');
if(!feedback||!feedback.innerHTML.includes('Próxima questão'))throw new Error('Fallback não criou botão Próxima questão');

console.log(`Answer-flow smoke test OK for ${ids.length} trilhas; Próxima questão presente.`);
