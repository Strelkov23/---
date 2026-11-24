import tempfile, unittest
from pathlib import Path
import national, routes, link_audit

def table(headers,rows):
    return '<table><tr>'+''.join('<th>'+x+'</th>' for x in headers)+'</tr>'+''.join('<tr>'+''.join('<td>'+x+'</td>' for x in r)+'</tr>' for r in rows)+'</table>'
class NationalTests(unittest.TestCase):
    def test_infl(self):
        html=table(["Дата","Ключевая ставка, % годовых","Инфляция, % г/г","Цель по инфляции, %"],[["06.2026","14,25","6,02","4,00"]])
        self.assertEqual(national.parse_infl(html)[("CPI_YOY","2026-06")],6.02)
        self.assertFalse(national.parse_infl(table(["Дата","A","B","C"],[["06.2026","14,25","6,02","4,00"]])))
    def test_reserves(self):
        html="млн долл. США"+table(["Дата","Международные резервы","Валютные резервы","Иностранная валюта","СДР","Резервная позиция","Монетарное золото"],[["01.07.2026","720 447","421 457","392 403","24 073","4 981","298 991"]])
        self.assertEqual(national.parse_res(html)[("RES_TOTAL","2026-07")],720447)
        self.assertFalse(national.parse_res(html.replace("720 447","20")))
    def test_money(self):
        html=table(["","01.07.2026 трлн руб.","Темп прироста","A","B","C","D","E"],[["Денежный агрегат М2","134,8","13,0","13,2","1,2","0,9","3,1","4,0"]])
        self.assertEqual(national.parse_money(html)[("M2","2026-07")],134.8)
        self.assertFalse(national.parse_money(html.replace("трлн руб.","млрд руб.")))
    def test_routes(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)
            for target in set(routes.ROUTES.values()):
                f,_,anchor=target.partition("#")
                path=out/f
                old=path.read_text() if path.exists() else ""
                path.write_text(old+('<div id="'+anchor+'"></div>' if anchor else '<h1>Page</h1>'))
            (out/"style.css").write_text("")
            routes.publish(out)
            self.assertTrue((out/"404.html").exists())
            self.assertTrue((out/"archive/index.html").exists())
            errors,_=link_audit.scan(out)
            self.assertFalse(errors,errors)
if __name__=="__main__":unittest.main()
