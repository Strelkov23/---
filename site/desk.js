document.addEventListener('DOMContentLoaded', async () => {
  if (!version) {
    try {
      const res = await fetch('version.txt');
      if (res.ok) version = (await res.text()).trim();
    } catch { /* The datasets can still be opened offline from the browser cache. */ }
  }
  const storageKey = 'economics-research-collection-v1';
  let basket = new Map();
  let persistent = true;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    for (const item of saved) if (/^https?:\/\//i.test(item.url)) basket.set(item.url, item);
  } catch { persistent = false; }
  let records = [], limit = 25;
  const fields = ['words','material','since'];
  function toggle(item) {
    if (basket.has(item.url)) basket.delete(item.url);
    else basket.set(item.url,item);
    try { localStorage.setItem(storageKey,JSON.stringify([...basket.values()])); }
    catch { persistent = false; }
    render();
  }
  function card(item) {
    const box = node('article',''), heading = node('h3',''), link = node('a',item.title);
    link.href = item.url;
    heading.append(link);
    const button = node('button',basket.has(item.url) ? 'Убрать из подборки' : 'В подборку');
    button.onclick = () => toggle(item);
    box.append(node('small',[item.date,item.type,item.source].filter(Boolean).join(' · ')),heading,
      node('p',[item.authors,item.topics].filter(Boolean).join(' · ')),button);
    return box;
  }
  let missing = [];
  function render() {
    const terms = el('words').value.toLowerCase().trim().split(/\s+/).map(stem);
    const result = records.filter(item => (!el('material').value || item.type === el('material').value)
      && (!el('since').value || Number(item.date.slice(0,4)) >= Number(el('since').value))
      && terms.every(term => item.search.includes(term)));
    el('desk-results').replaceChildren(...result.slice(0,limit).map(card));
    el('desk-status').textContent = 'Найдено материалов: '+fmt(result.length)+(missing.length ? '. Недоступные архивы: '+missing.join(', ') : '');
    el('desk-more').hidden = result.length <= limit;
    el('basket-count').textContent = 'Выбрано: '+basket.size+(persistent ? '' : ' · Доступно только до закрытия страницы');
    el('basket').replaceChildren(...Array.from(basket.values(),card));
    el('desk-export').disabled = !basket.size;
    save(fields);
  }
  const sets = await Promise.allSettled([load('archive.json'),load('literature.json')]);
  if (sets[0].status === 'fulfilled') records.push(...sets[0].value.map(r => ({
    title:r.title,url:r.url,date:(r.published||'').slice(0,10),type:sourceKind(r),source:r.source,topics:r.topics,authors:''
  }))); else missing.push('новости и акты');
  if (sets[1].status === 'fulfilled') records.push(...sets[1].value.articles.map(r => ({
    title:r.title,url:'https://doi.org/'+r.doi,date:r.published,type:'Научная статья',source:r.journal,topics:r.topics,authors:r.authors
  }))); else missing.push('журналы');
  for (const item of records) item.search = [item.title,item.authors,item.topics,item.source,item.url].join(' ').toLowerCase();
  records.sort((a,b)=>b.date.localeCompare(a.date));
  restore(fields);
  el('desk-filter').oninput = () => {limit=25;render()};
  el('desk-filter').onsubmit = e => e.preventDefault();
  el('desk-more').onclick = () => {limit+=25;render()};
  el('desk-export').onclick = () => csv('research-collection.csv',[['Название','Тип','Источник','Дата','Авторы','Темы','Ссылка'],...Array.from(basket.values(),r=>[r.title,r.type,r.source,r.date,r.authors,r.topics,r.url])]);
  render();
});
