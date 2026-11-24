import io,tempfile,unittest
from pathlib import Path
from datetime import date
from unittest.mock import patch
import openpyxl
import investment_projects as p

def workbook(count=63,wrong=False):
    b=openpyxl.Workbook();s=b.active;s.title="Реестр"
    s.append(["Реестр"])
    s.append(["№","Наименование проекта","Сведения об Инициаторе проекта/инвестор","Краткое описание проекта","Место реализации проекта","Статус проекта","Срок реализации проекта, годы","Общая стоимость проекта, млн. руб.","Количество создаваемых рабочих мест"])
    for i in range(1,count+1):
        s.append([i,"Проект "+str(i),"ООО Пример","Описание",p.REGION,"реализуемый","2026-2030",0 if i==1 else None if i==2 else "12,5",-1 if wrong else 0])
    f=io.BytesIO();b.save(f);return f.getvalue()
class Projects(unittest.TestCase):
    def test_discovery(self):
        html=('<a href="'+p.BASELINE+'">Скачать реестр</a> (от 30.09.2026)').encode()
        self.assertEqual(p.discover(html,date(2026,11,25)),p.BASELINE)
        with self.assertRaises(ValueError):p.discover(html,date(2026,9,29))
        with self.assertRaises(ValueError):p.release(p.BASELINE.replace("file.invest-buryatia.ru","example.com"))
    def test_parse(self):
        rows=p.parse(workbook(),p.BASELINE)
        self.assertEqual(len(rows),63);self.assertEqual(rows[0]["row"],3)
        self.assertEqual(rows[0]["cost_mln_rub"],"0");self.assertIsNone(rows[1]["cost_mln_rub"])
        self.assertEqual(rows[2]["cost_mln_rub"],"12.5")
        self.assertEqual(rows[0]["jobs"],0)
    def test_reject(self):
        with self.assertRaises(ValueError):p.parse(workbook(62),p.BASELINE)
        with self.assertRaises(ValueError):p.parse(workbook(wrong=True),p.BASELINE)
        with self.assertRaises(ValueError):p.number("неизвестно")
    def test_cache_and_csv(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);old=root/"old";out=root/"out";old.mkdir();out.mkdir()
            html=('<a href="'+p.BASELINE+'">Скачать реестр</a> (от 30.09.2026)').encode()
            with patch.object(p,"fetch",side_effect=[html,workbook()]):
                d=p.publish(lambda *args:None,old,old,"2026-11-25",True)
            self.assertEqual(p.quality(d)["investment_project_records"],63)
            with patch.object(p,"fetch",side_effect=OSError("blocked")):
                new=p.publish(lambda *args:None,out,old,"2026-12-05",True)
            self.assertEqual(new["rows"],d["rows"]);self.assertEqual(new["status"],"cached")
            self.assertEqual(new["success"],"2026-11-25")
            with (out/"investment-projects.csv").open("a",encoding="utf-8") as f:f.write("bad\n")
            with self.assertRaises(ValueError):p.verify_csv(out/"investment-projects.csv",new)
    def test_html_fallback(self):
        h=p.HTML_HEADER+"<br>"
        h+="<br>".join(f"{i};Проект {i};ООО Пример;Описание;{p.REGION};реализуемый;2026;12,5;0" for i in range(1,64))
        html=('<a href="'+p.BASELINE+'">Скачать реестр</a> (от 30.09.2026)<div>'+h+'</div><h2>Архив реестров</h2>').encode()
        rows=p.parse_html(html,p.BASELINE)
        self.assertEqual(len(rows),63);self.assertEqual(rows[0]["source"],p.SOURCE)
        self.assertEqual(rows[62]["jobs"],0)
        with self.assertRaises(ValueError):p.parse_html(html.replace(b"63;",b"64;"),p.BASELINE)
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)
            with patch.object(p,"fetch",side_effect=[html,OSError("timeout")]):
                d=p.publish(lambda *args:None,path,path,"2026-11-25",True)
            self.assertEqual(d["source_format"],"html")
            self.assertEqual(d["workbook_error"],"timeout")
            self.assertEqual(p.quality(d)["investment_project_records"],63)
            self.assertIn("Официальная HTML-таблица",p.render(d))
    def test_empty(self):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t);d=p.publish(lambda *args:None,path,path,"2026-11-25",False)
            self.assertEqual(p.quality(d)["investment_project_regions"],0)
            self.assertIn("Ожидается первая загрузка",p.render(d))
if __name__=="__main__":unittest.main()
