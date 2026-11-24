"""Chromium layout audit of generated pages; screenshots and machine-readable findings."""
import json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as BrowserTimeout

ROOT=sys.argv[1] if len(sys.argv)>1 else "http://localhost:8765/"
OUT=Path(sys.argv[2] if len(sys.argv)>2 else "/tmp/layout-audit")
OUT.mkdir(parents=True,exist_ok=True)
PAGES=["index.html","monitoring.html","data-centre.html","sectors.html","analysis-centre.html","research-centre.html","quality-centre.html","statistics.html","national.html","historical.html","industrial.html","sector-passports.html","compare.html","diagnostics.html","scenario.html","atlas.html","papers.html","desk.html","methodology.html","links.html","laws.html","week.html","programmes.html","budget-diagnostics.html","programme-evidence.html","labor.html","prices.html","technology.html","forecast.html","capital.html","data-registry.html","method-passports.html"]
AUDIT="""() => {
 const root=document.documentElement;
 const isVisible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
 const tables=[...document.querySelectorAll('main table')].filter(isVisible);
 const uncontained=tables.filter(t=>!t.closest('.atlas-table,.table-scroll,#month-list,#stat-list,#pair-table')).length;
 const outside=[...document.querySelectorAll('main h1, main h2, main h3, main button, main label, main article, .primary-nav a, .section-nav')]
   .filter(isVisible).filter(e=>!e.closest('.atlas-table,.table-scroll,.regional-figure-scroll')&&(e.getBoundingClientRect().right>root.clientWidth+3||e.getBoundingClientRect().left< -3))
   .slice(0,10).map(e=>({tag:e.tagName,text:e.textContent.trim().slice(0,90)}));
 const svgIssues=[];
 for(const svg of document.querySelectorAll('main svg[viewBox]')){
  if(!isVisible(svg))continue;
  const vb=svg.viewBox.baseVal;
  const labels=[...svg.querySelectorAll('text')].map(e=>{const b=e.getBBox();return {t:e.textContent.trim().slice(0,100),x:b.x,y:b.y,w:b.width,h:b.height}});
  for(const l of labels)if(l.x<vb.x-2||l.y<vb.y-2||l.x+l.w>vb.x+vb.width+2||l.y+l.h>vb.y+vb.height+2)svgIssues.push({kind:'outside SVG',chart:svg.getAttribute('aria-label'),text:l.t});
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
   const a=labels[i],b=labels[j],w=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),h=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
   if(w>3&&h>Math.min(a.h,b.h)*.5)svgIssues.push({kind:'overlapping labels',chart:svg.getAttribute('aria-label'),texts:[a.t,b.t]});
  }
 }
 return {viewport:root.clientWidth,documentWidth:root.scrollWidth,uncontainedTables:uncontained,outside,svgIssues:svgIssues.slice(0,40)};
}"""
def run():
    report=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get("CHROME_BIN","/usr/bin/google-chrome"),args=["--no-sandbox","--disable-dev-shm-usage"])
        for width,height in ((320,800),(390,844),(768,1024),(1440,900)):
            context=browser.new_context(viewport={"width":width,"height":height},device_scale_factor=1)
            for path in PAGES:
                page=context.new_page();errors=[]
                page.on("pageerror",lambda error:errors.append(str(error)))
                record={"page":path,"width":width,"errors":errors}
                try:
                    response=page.goto(ROOT.rstrip("/")+"/"+path,wait_until="load",timeout=20000)
                    if not response or not response.ok:raise RuntimeError("HTTP "+str(response.status if response else "unknown"))
                    try:page.wait_for_load_state("networkidle",timeout=10000)
                    except BrowserTimeout:record["network_warning"]="network did not become idle"
                    page.evaluate("document.fonts.ready")
                    page.wait_for_timeout(150)
                    record.update(page.evaluate(AUDIT))
                    if path in ("index.html","historical.html","scenario.html","sector-passports.html","papers.html","analysis-centre.html") or record.get("outside") or errors or record.get("svgIssues"):
                        page.screenshot(path=str(OUT/f"{width}-{path.replace('.html','')}.png"),full_page=False,timeout=12000)
                except Exception as err:record["audit_error"]=str(err)
                finally:page.close()
                report.append(record)
            context.close()
        browser.close()
    (OUT/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    hard=[r for r in report if r.get("audit_error") or r["errors"] or r.get("documentWidth",0)>r.get("viewport",0)+3 or r.get("uncontainedTables",0) or r.get("outside")]
    svg=[r for r in report if r.get("svgIssues")]
    print(json.dumps({"pages":len(report),"layout_errors":len(hard),"pages_with_svg_warnings":len(svg),"report":str(OUT/"report.json")},ensure_ascii=False))
    for r in hard:print(json.dumps(r,ensure_ascii=False))
    # SVG warnings are retained for detailed review; page overflow and JS failures are release blockers.
    if hard:raise SystemExit("Layout audit failed")
if __name__=="__main__":run()
