"""Release gate: actual built pages, real DOM, mocked local LLM transport.
No model download, external research requests, or WebGPU quality claim.
Run against the existing offline-build HTTP server on port 8765.
"""
import os
from playwright.sync_api import sync_playwright

MODEL = """export const prebuiltAppConfig={model_list:[{model_id:'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'}]};
export async function CreateMLCEngine(id,opts){
 opts?.initProgressCallback?.({text:'Контрольная загрузка',progress:0.25});
 if(globalThis.__aiStartupMode==='pending') await new Promise(resolve=>{globalThis.__aiReleaseStartup=resolve;});
 return {interruptGenerate(){},async unload(){globalThis.__aiUnloadCount=(globalThis.__aiUnloadCount||0)+1;},chat:{completions:{async create({messages,stream}){
 const context=messages.filter(m=>m.role==='user').map(m=>m.content).join(' | ');
 if(!stream && messages[0]?.content?.startsWith('Разложи задачу на 2–4')) return {choices:[{message:{content:JSON.stringify([{mode:'general',title:'Объяснение',query:'Объясни межотраслевой баланс'},{mode:'web',title:'Поиск',query:'Межотраслевой баланс статьи'}])}}]};
 if(!stream) return {choices:[{message:{content:'Тестовый ответ'}}]};
 return (async function*(){if(context.includes('Контроль обрыва ответа')){yield {choices:[{delta:{content:'Неполный контрольный текст'}}]};yield {choices:[{delta:{},finish_reason:'length'}]};return;}yield {choices:[{delta:{content:'Тест: '}}]};yield {choices:[{delta:{content:context}}]};})();
 }}}};
}"""

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get("CHROME_BIN") or None, headless=True,
                                    args=["--no-sandbox", "--disable-gpu"])
        for width in (1280, 390):
            page = browser.new_page(viewport={"width":width,"height":844})
            errors, external = [], []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("request", lambda r: external.append(r.url) if
                    any(host in r.url for host in ("wikipedia.org", "api.crossref.org", "api.datacite.org", "europepmc.org")) else None)
            page.add_init_script("Object.defineProperty(navigator,'gpu',{value:{requestAdapter:async()=>window.__aiAdapterMissing?null:{}},configurable:true});")
            page.route("https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm",
                       lambda route: route.fulfill(status=200,content_type="text/javascript",
                       headers={"Access-Control-Allow-Origin":"*"},body=MODEL))
            for route in ("index.html","historical.html","papers.html","analyst-cockpit.html"):
                page.goto("http://localhost:8765/"+route,wait_until="domcontentloaded")
                page.locator("#gea-toggle").click()
                assert page.get_by_role("log",name="Сообщения диалога").is_visible()
                assert page.get_by_role("button",name="Отправить сообщение",exact=True).is_visible()
                assert page.locator("#gea-question").evaluate("(e)=>e.nextElementSibling.classList.contains('gea-chat-actions')")
                assert page.locator(".gea-chat-actions #gea-model").is_visible()
                assert page.locator(".gea-chat-actions #gea-stop").is_visible()
                assert page.locator(".gea-chat-actions").evaluate("(e)=>e.nextElementSibling.id==='gea-status'")
                assert page.locator("#gea-panel").evaluate("(e)=>e.getBoundingClientRect().right<=innerWidth+2 && e.getBoundingClientRect().left>=-2")
                page.locator("#gea-close").click()
            page.goto("http://localhost:8765/index.html",wait_until="domcontentloaded")
            page.locator("#gea-toggle").click()
            log = page.get_by_role("log",name="Сообщения диалога")
            chats = page.get_by_role("combobox",name="Выберите диалог")
            question = page.locator("#gea-question")
            send = page.get_by_role("button",name="Отправить сообщение",exact=True)
            question.fill("Проверка первого диалога")
            send.click()
            assert "загрузите локальную модель" in page.locator("#gea-status").inner_text()
            assert question.input_value()=="Проверка первого диалога"
            # A missing GPU must be visibly diagnosed and must not lock the chat.
            page.evaluate("window.__aiAdapterMissing=true")
            page.locator("#gea-model").click()
            page.wait_for_function("!document.querySelector('#gea-question').disabled")
            assert "не обнаружил совместимое" in page.locator("#gea-status").inner_text(), (page.locator("#gea-status").inner_text(),errors,page.evaluate("({secure:isSecureContext,gpu:typeof navigator.gpu?.requestAdapter,missing:window.__aiAdapterMissing})"))
            startup=page.locator(".gea-model-startup")
            assert startup.is_visible()
            assert "ИИ не запущен" in startup.inner_text()
            assert question.input_value()=="Проверка первого диалога"
            # Cancel a pending engine download; late engines must be unloaded.
            page.evaluate("window.__aiAdapterMissing=false;window.__aiStartupMode='pending'")
            page.locator("#gea-model").click()
            page.wait_for_function("typeof window.__aiReleaseStartup==='function' || !document.querySelector('#gea-question').disabled")
            assert page.evaluate("typeof window.__aiReleaseStartup==='function'"), (page.locator("#gea-status").inner_text(),errors)
            assert startup.get_by_role("progressbar").is_visible()
            assert startup.get_by_role("progressbar").get_attribute("value")=="0.25"
            assert page.locator("#gea-stop").is_enabled()
            page.locator("#gea-stop").click()
            page.wait_for_function("document.querySelector('#gea-status').textContent.includes('Загрузка отменена') && !document.querySelector('#gea-question').disabled")
            assert page.locator("#gea-model").is_disabled()
            page.evaluate("window.__aiStartupMode='normal';window.__aiReleaseStartup()")
            page.wait_for_function("window.__aiUnloadCount===1 && !document.querySelector('#gea-model').disabled")
            assert question.input_value()=="Проверка первого диалога"
            page.locator("#gea-model").click()
            page.wait_for_function("document.querySelector('#gea-status').textContent.includes('Модель загружена')")
            send.click()
            page.wait_for_function("document.querySelector('.gea-chat-scroll').textContent.includes('Тест: Проверка первого диалога') && !document.querySelector('#gea-question').disabled")
            assert "Локальный замер: первый текст" in log.inner_text()
            assert "симв." in log.inner_text()
            # The mocked transport cannot establish model intelligence. The diagnostic
            # must report failed synthetic cases, not a misleading all-green result.
            page.get_by_text("Диагностика качества локальной модели",exact=True).click()
            quality = page.get_by_role("button",name="Проверить загруженную модель",exact=True)
            quality.click()
            page.wait_for_function("document.body.textContent.includes('0/9 · нужна проверка') && !document.querySelector('#gea-question').disabled")
            assert log.locator("article").count()==1
            assert not external,external
            page.get_by_text("Диагностика качества локальной модели",exact=True).click()

            question.fill("Уточнение")
            question.press("Enter")
            page.wait_for_function("document.querySelector('.gea-chat-scroll').textContent.includes('Тест: Проверка первого диалога | Уточнение') && !document.querySelector('#gea-question').disabled")
            assert log.locator("article").count()==2
            original=chats.input_value()
            page.get_by_role("checkbox",name="Сохранять диалоги в этой вкладке").check()
            page.get_by_role("button",name="Новый чат",exact=True).click()
            assert log.locator("article").count()==0
            question.fill("Независимый вопрос")
            send.click()
            page.wait_for_function("document.querySelector('.gea-chat-scroll').textContent.includes('Тест: Независимый вопрос') && !document.querySelector('#gea-question').disabled")
            assert "Проверка первого диалога" not in log.inner_text()
            chats.select_option(original)
            assert log.locator("article").count()==2
            page.get_by_role("button",name="Повторить последний вопрос",exact=True).click()
            assert question.input_value()=="Уточнение"
            # Explicit web search preview; no external request before confirmation.
            question.fill("PRIVATE_QUESTION")
            page.get_by_role("button",name="Интернет-поиск",exact=True).click()
            public=page.get_by_role("textbox",name="Публичный запрос",exact=True)
            # type=search may be exposed as searchbox, use the actual aria label.
            page.locator('[aria-label="Публичный запрос"]').fill("economic planning")
            page.get_by_role("button",name="Подготовить план",exact=True).click()
            assert page.get_by_role("button",name="Подтвердить и выполнить",exact=True).is_enabled()
            assert not external,external
            # Attachment picker is connected to the existing document reader.
            page.locator(".gea-chat-actions summary").click()
            with page.expect_file_chooser() as picker:
                page.get_by_role("button",name="Документ / фото",exact=True).click()
            assert not picker.value.is_multiple()
            page.reload(wait_until="domcontentloaded")
            page.locator("#gea-toggle").click()
            assert page.get_by_role("log",name="Сообщения диалога").locator("article").count()==2
            # Automatic routing must preview the approved query and never send before consent.
            question = page.locator("#gea-question")
            question.fill("Найди в интернете историю науки")
            page.once("dialog", lambda dialog: dialog.dismiss())
            page.get_by_role("button",name="Отправить сообщение",exact=True).click()
            assert question.input_value()=="Найди в интернете историю науки"
            assert not external,external
            # A long transcript can be navigated with a visible return-to-latest control.
            page.locator("#gea-model").click()
            page.wait_for_function("document.querySelector('#gea-status').textContent.includes('Модель загружена')")
            question.fill("Длинный учебный ответ " + "экономика " * 45)
            page.get_by_role("button",name="Отправить сообщение",exact=True).click()
            page.wait_for_function("document.querySelectorAll('.gea-chat-scroll article').length===3 && !document.querySelector('#gea-question').disabled")
            log = page.get_by_role("log",name="Сообщения диалога")
            assert log.evaluate("(e)=>e.scrollHeight>e.clientHeight+80")
            assert log.get_attribute("tabindex")=="0"
            log.evaluate("(e)=>{e.scrollTop=0;e.dispatchEvent(new Event('scroll'))}")
            jump=page.get_by_role("button",name="К последнему сообщению",exact=True)
            assert jump.is_visible()
            jump.click()
            assert log.evaluate("(e)=>e.scrollHeight-e.clientHeight-e.scrollTop<5")
            assert not jump.is_visible()
            # User-owned gateway: exact consent, no network on dismissal, safe results.
            gateway_requests=[]
            def gateway_route(route):
                gateway_requests.append(route.request.url)
                route.fulfill(status=200,content_type="application/json",
                              headers={"Access-Control-Allow-Origin":"*"},
                              body='{"results":[{"url":"https://science.org/history","title":"История науки","content":"Учебная справка"},{"url":"javascript:alert(1)","title":"invalid"}]}')
            page.route(lambda url: url.startswith("https://search.mydomain.org/search?"),gateway_route)
            page.get_by_text("Настроить веб-поиск через свой сервер",exact=True).click()
            page.get_by_role("textbox",name="HTTPS-адрес поискового сервера").fill("https://search.mydomain.org/search")
            page.get_by_role("button",name="Использовать веб-сервер",exact=True).click()
            question.fill("История науки")
            page.once("dialog",lambda dialog: dialog.dismiss())
            page.get_by_role("button",name="Отправить сообщение",exact=True).click()
            assert not gateway_requests,gateway_requests
            # Match the URL using a predicate: the literal ? in glob syntax is ambiguous.
            assert question.input_value()=="История науки"
            assert page.locator("#gea-question").is_enabled()
            page.once("dialog",lambda dialog: dialog.accept())
            page.get_by_role("button",name="Отправить сообщение",exact=True).click()
            page.wait_for_function("document.querySelectorAll('.gea-chat-scroll article').length===4 && !document.querySelector('#gea-question').disabled")
            assert "Найдены веб-страницы" in log.inner_text(), (page.locator("#gea-status").inner_text(), log.inner_text(), gateway_requests, errors)
            assert len(gateway_requests)==1,gateway_requests
            assert "format=json" in gateway_requests[0]
            assert "invalid" not in log.inner_text()
            assert log.locator("article").count()==4
            # Explicit page read, not automatic fetching of search hits.
            read_requests=[]
            def page_route(route):
                read_requests.append(route.request.url)
                route.fulfill(status=200,content_type="text/html; charset=utf-8",
                              headers={"Access-Control-Allow-Origin":"*"},
                              body="<script>hidden test 999</script><p>История науки: учебный материал для проверки содержания страницы, не проверенный научный факт.</p>")
            page.route("https://science.org/history",page_route)
            page.get_by_text("Прочитать выбранные веб-страницы",exact=True).click()
            page.get_by_role("checkbox",name="История науки",exact=True).check()
            page.once("dialog",lambda dialog: dialog.dismiss())
            page.get_by_role("button",name="Получить и проанализировать текст",exact=True).click()
            assert not read_requests,read_requests
            page.once("dialog",lambda dialog: dialog.accept())
            page.get_by_role("button",name="Получить и проанализировать текст",exact=True).click()
            page.wait_for_function("document.querySelectorAll('.gea-chat-scroll article').length===5 && !document.querySelector('#gea-question').disabled")
            assert read_requests==["https://science.org/history"],read_requests
            assert "Получены фрагменты выбранных страниц" in log.inner_text()
            assert "hidden test 999" not in log.text_content()
            # Multi-step search retains consent for every exact query and deduplicates results.
            question.fill("История науки")
            page.get_by_role("textbox",name="Дополнительные поисковые запросы").fill("История техники")
            page.once("dialog",lambda dialog: dialog.dismiss())
            page.get_by_role("button",name="Многоступенчатый веб-поиск",exact=True).click()
            assert len(gateway_requests)==1,gateway_requests
            page.once("dialog",lambda dialog: dialog.accept())
            page.get_by_role("button",name="Многоступенчатый веб-поиск",exact=True).click()
            page.wait_for_function("document.querySelectorAll('.gea-chat-scroll article').length===6 && !document.querySelector('#gea-question').disabled")
            assert "Многоступенчатый поиск завершён" in log.inner_text(), (page.locator("#gea-status").inner_text(), log.inner_text(), gateway_requests, errors)
            assert len(gateway_requests)==3,gateway_requests
            assert "1, 2" in log.text_content()
            # Memory is explicit and scoped to one thread. Task drafts never execute automatically.
            page.get_by_text("Память и контекст этого диалога",exact=True).click()
            memory=page.get_by_role("textbox",name="Заметки диалога")
            memory.fill("Память контрольного диалога")
            page.get_by_role("checkbox",name="Подбирать релевантные ранние сообщения").check()
            page.get_by_role("button",name="Сохранить настройки памяти",exact=True).click()
            question.fill("Объясни межотраслевой баланс")
            page.get_by_role("button",name="Проверить контекст следующего вопроса",exact=True).click()
            assert "заметки: включены" in page.locator("#gea-panel").inner_text()
            active_thread=chats.input_value()
            page.get_by_role("button",name="Новый чат",exact=True).click()
            assert memory.input_value()==""
            chats.select_option(active_thread)
            assert memory.input_value()=="Память контрольного диалога"
            question.fill("Подготовить исследование")
            page.get_by_role("button",name="Составить план задачи",exact=True).click()
            page.get_by_role("button",name="Подготовить шаг 2",exact=True).wait_for(state="visible")
            before=log.locator("article").count()
            page.get_by_role("button",name="Подготовить шаг 2",exact=True).click()
            assert question.input_value()=="Межотраслевой баланс статьи"
            assert log.locator("article").count()==before
            assert len(gateway_requests)==3 and not external
            page.get_by_role("button",name="Очистить заметки диалога",exact=True).click()
            assert memory.input_value()==""
            # Truncation must remain visible and must not enter future chat context.
            page.locator(".gea-chat-toolbar select").filter(has=page.locator("option[value='general']")).select_option("general")
            question.fill("Контроль обрыва ответа")
            send.click()
            page.wait_for_function("document.querySelector('#gea-status').textContent.includes('Получен неполный ответ') && !document.querySelector('#gea-question').disabled")
            assert "Ответ достиг лимита генерации" in log.locator("article").last.inner_text()
            assert question.input_value()=="Контроль обрыва ответа"
            question.fill("Контроль нового сообщения")
            send.click()
            page.wait_for_function("document.querySelector('#gea-status').textContent.includes('Ответ общего чата готов') && !document.querySelector('#gea-question').disabled")
            last=log.locator("article").last.inner_text()
            assert "Контроль нового сообщения" in last and "Контроль обрыва ответа" not in last
            question.fill("Вычисли 2+2. Ответь только числом.")
            send.click()
            page.wait_for_function("document.querySelector('#gea-status').textContent.includes('заданный формат не соблюдён') && !document.querySelector('#gea-question').disabled")
            assert "Модель не соблюла явно заданный формат ответа" in log.locator("article").last.inner_text()
            assert question.input_value()=="Вычисли 2+2. Ответь только числом."
            assert len(gateway_requests)==3 and not external
            assert not errors,errors
            print(f"Chat release browser regression passed: {width}",flush=True)
            page.close()
        browser.close()

if __name__=="__main__":
    main()
