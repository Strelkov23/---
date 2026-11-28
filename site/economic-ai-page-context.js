/* Explicit read-only page context and research note export. */
const EconomicAIPageContext=(function pageContext(){
 const configs={
  "compare.html":[["left","Первый показатель"],["right","Второй показатель"],["begin","Начальный год"],["finish","Конечный год"]],
  "historical.html":[["hist-series","Показатель"],["hist-region","Регион"],["hist-peer","Регион сравнения"],["hist-from","Начальный год"],["hist-to","Конечный год"],["hist-mode","Режим"],["rc-a","Первый региональный показатель"],["rc-b","Второй региональный показатель"],["rc-region","Территория сравнения"],["rc-from","Сравнение с года"],["rc-to","Сравнение по год"],["rc-base","База сравнения"]],
  "economic-map.html":[["geo-theme","Тема"],["geo-series","Показатель"],["geo-year","Год"],["geo-region","Регион"],["geo-scale","Шкала"],["geo-diff-base","Базовый год"],["geo-diff-mode","Метод сравнения"]],
  "forecast.html":[["forecast-series","Показатель"],["forecast-horizon","Горизонт от последнего наблюдения"],["forecast-board-period","Частота"],["forecast-board-target","Целевой период"]],
  "scenario.html":[["repro-base","Базовый год"],["repro-years","Горизонт, лет"],["repro-growth","Целевой реальный рост ВВП, %/год"],["repro-productivity","Рост производительности, %/год"],["repro-laborGrowth","Рост доступной занятости, %/год"],["repro-capitalRatio","Капитал / ВВП, раз"],["repro-depreciation","Выбытие капитала, %/год"],["repro-budget","Инвестиционный бюджет, % ВВП предыдущего года"],["dyn-years","Горизонт динамической модели, периодов"],["dyn-spare","Исходный свободный прирост, % выпуска"],["dyn-investment","Лимит инвестиций за период, млрд ₽"],["dyn-importLimit","Лимит дополнительного промежуточного импорта, млрд ₽"],["dyn-allocation","Распределение инвестиций"],["dyn-uniform","Общий годовой прирост спроса, %"],["dyn-laborEnabled","Учёт дополнительных трудовых ресурсов"],["dyn-laborCap","Дополнительные человеко-лет за период"],["dyn-laborProductivity","Изменение производительности, % за период"]],
  "analyst-cockpit.html":[["ac-year","Год наблюдения"]]
 };
 function capture(page,get){
  const found=[];for(const [id,label] of configs[page]||[]){
   const e=get(id);if(!e||e.disabled||e.hidden)continue;
   let value=null;
   if(e.tagName==="SELECT"){const opt=e.selectedOptions?.[0];if(opt&&!opt.disabled&&e.value!=="")value=String(opt.textContent||"").trim().slice(0,200)}
   else if(e.tagName==="INPUT"&&e.type==="number"&&e.value!==""&&Number.isFinite(Number(e.value))&&(!e.validity||e.validity.valid))value=String(Number(e.value));
   else if(e.tagName==="INPUT"&&e.type==="checkbox")value=e.checked?"Да":"Нет";
   if(value!==null&&value!=="")found.push({id,label,value,kind:page==="scenario.html"?"scenario_assumption":"selection"});
  }return found;
 }
 function note(question,context,rows,fingerprint,answer){
  const lines=["Экономический обзор России — исследовательская заметка","Вопрос: "+question,"Раздел: "+context.heading,"Отпечаток набора SHA-256: "+fingerprint,"","Параметры страницы (не статистические факты):"];
  for(const p of context.parameters||[])lines.push(p.label+": "+p.value);
  if(!context.parameters?.length)lines.push("Не переданы.");
  if(context.model_input){const m=context.model_input;lines.push("","Контекст модели: "+m.included.length+" карточек; не передано "+m.omitted,"Переданные ID: "+m.included.join(", "),"Размер сообщения (оценка байт): "+m.bytes+" / "+m.budget);}
  if(context.research_scope){const r=context.research_scope;lines.push("","Охват исследования (счётчики карточек, не статистика):",JSON.stringify(r,null,2));}
  lines.push("","Результаты поиска (включая не переданные модели):");
  for(const r of rows)lines.push("["+r.id+"] "+r.kind+" — "+r.title,r.description||"",r.limit||"",r.href||"","");
  if(context.answer_review)lines.push("","Протокол повторной буквальной сверки:",JSON.stringify(context.answer_review,null,2));
  if(context.structured_findings)lines.push("","Структурированное заключение (буквальная проверка, не смысловая):",JSON.stringify(context.structured_findings,null,2));
  if(answer)lines.push("Черновик ИИ (не подтверждённая аналитика):",answer);
  return lines.join("\n");
 }
 return {capture,note,configs};
})();
if(typeof module!=="undefined")module.exports=EconomicAIPageContext;
