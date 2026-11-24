"""Static compatibility pages for old server URLs and clear 404 recovery."""
from html import escape
from pathlib import Path
import json
ROUTES={
 "archive":"index.html#archive","stats":"statistics.html","compare":"compare.html",
 "overview":"week.html","model":"index.html#model","sources":"sources.html",
 "desk":"desk.html","laws":"laws.html","papers":"papers.html","atlas":"atlas.html",
 "statistics":"statistics.html","national":"national.html","historical":"historical.html","regions":"historical.html","budget":"historical.html#hist-sources","history":"historical.html","diagnostics":"diagnostics.html",
 "scenario":"scenario.html","methodology":"methodology.html","directory":"directory.html",
 "links":"links.html","updates":"updates.html","indicators":"indicators.html",
 "brief":"desk.html#brief","watch":"index.html#archive"
}
def publish(out):
    for old,target in ROUTES.items():
        folder=out/old;folder.mkdir(exist_ok=True)
        dest="../"+target
        canonical="/---/"+target
        # Preserve parameters; never redirect to arbitrary user-provided destinations.
        script="const u=new URL("+json.dumps(canonical)+",location.origin);u.search=location.search;if(location.hash)u.hash=location.hash;location.replace(u.href);"
        (folder/"index.html").write_text('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Раздел перемещён</title><h1>Раздел перемещён</h1><p><a href="'+escape(dest,quote=True)+'">Перейти к актуальному разделу</a></p><script>'+script+'</script></html>',encoding="utf-8")
    body='<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Страница не найдена | Экономический обзор</title><link rel="stylesheet" href="/---/style.css"><main><h1>Страница не найдена</h1><p>Возможно, адрес изменился после обновления. Выберите нужный раздел. Отсутствующий материал не заменяется другим автоматически.</p><p><a href="/---/">Главная</a> · <a href="/---/statistics.html">Статистика</a> · <a href="/---/national.html">Российские данные</a> · <a href="/---/historical.html">Регионы и история</a> · <a href="/---/papers.html">Научные статьи</a> · <a href="/---/atlas.html">Отраслевой атлас</a> · <a href="/---/links.html">Проверка ссылок</a></p><p>Старые серверные функции RSS и совместного редактирования не доступны в статической версии.</p></main></html>'
    # Recover known old extensionless paths even if the host serves the 404 document instead of a directory index.
    script="<script>const routes="+json.dumps(ROUTES,ensure_ascii=False)+";const p=location.pathname.match(/^\\/---\\/([^/]+)\\/?$/);if(p&&Object.prototype.hasOwnProperty.call(routes,p[1])){const u=new URL('/---/'+routes[p[1]],location.origin);u.search=location.search;if(location.hash)u.hash=location.hash;location.replace(u.href)}</script>"
    (out/"404.html").write_text(body+script,encoding="utf-8")
