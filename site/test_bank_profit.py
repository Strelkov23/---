import unittest
import bank_profit as b
def fixture():
    vals={"interest_income":("100","80"),"interest_expense":("40","30"),"net_interest":("60","50"),"net_interest_after_reserves":("50","40"),"fee_income":("15","10"),"fee_expense":("5","2"),"net_income":("70","60"),"operating_expense":("30","40"),"pretax_profit":("40","20"),"profit":("30","15")}
    rows="".join(f"<tr><td>{n}</td><td>{label}</td><td></td><td>{vals[k][0]}</td><td>{vals[k][1]}</td></tr>" for k,(n,label) in b.FIELDS.items())
    header="<tr><th>Номер строки</th><th>Наименование статьи</th><th>Номер пояснения</th><th>Данные за отчетный период, тыс. руб.</th><th>Данные за соответствующий период прошлого года, тыс. руб.</th></tr>"
    return ('<h1>Отчёт о финансовых результатах (публикуемая форма) за первый квартал 2026 года</h1><p>Регистрационный номер (порядковый номер) 1000</p><p>Код формы по ОКУД 0409807</p><table>'+header+rows+'</table><table>'+header+'<tr><td>1</td><td>Прибыль (убыток) за отчетный период</td><td></td><td>30</td><td>15</td></tr></table>').encode()
class Profit(unittest.TestCase):
    def test_parse(self):
        r=b.parse(fixture(),"utf-8","1000")
        self.assertEqual(r["current"]["profit"],"30")
        self.assertEqual(r["prior"]["profit"],"15")
        with self.assertRaises(ValueError):b.parse(fixture(),"utf-8","1")
        with self.assertRaises(ValueError):b.parse(fixture().replace(b">100<",b">101<"),"utf-8","1000")
        with self.assertRaises(ValueError):b.parse(fixture().replace("первый квартал".encode(),"первое полугодие".encode()),"utf-8","1000")
    def test_empty(self):
        self.assertEqual(b.quality(b.empty())["bank_profit_records"],0)
