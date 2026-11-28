"""Release gate: actual built pages, real DOM, mocked local LLM transport.
No model download, external research requests, or WebGPU quality claim.
Run against the existing offline-build HTTP server on port 8765.
"""
import os
from playwright.sync_api import sync_playwright

MODEL = """export const prebuiltAppConfig={model_list:[{model_id:'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'}]};
export async function CreateMLCEngine(){
 return {interruptGenerate(){},async unload(){},chat:{completions:{async create({messages,stream}){
 const context=messages.filter(m=>m.role==='user').map(m=>m.content).join(' | ');
 if(!stream) return {choices:[{message:{content:'Тестовый ответ'}}]};
 return (async function*(){yield {choices:[{delta:{content:'Тест: '}}]};yield {choices:[{delta:{content:context}}]};})();
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
            page.add_init_script("if (!navigator.gpu) Object.defineProperty(navigator,'gpu',{value:{},configurable:true});")
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
            page.locator("#gea-model").click()
            page.wait_for_function("document.querySelector('#gea-status').textContent.includes('Модель загружена')")
            send.click()
            page.wait_for_function("document.querySelector('.gea-chat-scroll').textContent.includes('Тест: Проверка первого диалога') && !document.querySelector('#gea-question').disabled")
            # The mocked transport cannot establish model intelligence. The diagnostic
            # must report failed synthetic cases, not a misleading all-green result.
            page.get_by_text("Диагностика качества локальной модели",exact=True).click()
            quality = page.get_by_role("button",name="Проверить загруженную модель",exact=True)
            quality.click()
            page.wait_for_function("document.body.textContent.includes('0/6 · нужна проверка') && !document.querySelector('#gea-question').disabled")
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
            assert not errors,errors
            print(f"Chat release browser regression passed: {width}",flush=True)
            page.close()
        browser.close()

if __name__=="__main__":
    main()
