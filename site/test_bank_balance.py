import unittest
import bank_balance as b
def fixture():
    vals={"assets":("12954292","10160855"),"liabilities":("7380428","5820501"),"equity":("5573864","4340354"),"loans":("8362910","6780861"),"client_funds":("6554891","5005927"),"nonbank_funds":("4295481","3812717"),"retail_funds":("693799","886583")}
    rows="".join(f"<tr><td>{n}</td><td>{label}</td><td></td><td>{vals[k][0]}</td><td>{vals[k][1]}</td></tr>" for k,(n,label) in b.FIELDS.items())
    return ('<h1>Бухгалтерский баланс (публикуемая форма) на 1.01.2026</h1><p>Регистрационный номер (порядковый номер) 2664</p><p>Код формы по ОКУД 0409806</p><table><tr><th>Номер строки</th><th>Наименование статьи</th><th>Номер пояснения</th><th>Данные за отчетный период, тыс. руб.</th><th>Данные за предыдущий отчетный год, тыс. руб.</th></tr>'+rows+'</table>').encode()
class Balance(unittest.TestCase):
    def test_parse(self):
        r=b.parse(fixture(),"utf-8","2664")
        self.assertEqual(r["current"]["assets"],"12954292")
        self.assertEqual(r["current"]["loans"],"8362910")
        with self.assertRaises(ValueError):b.parse(fixture(),"utf-8","1")
        with self.assertRaises(ValueError):b.parse(fixture().replace(b"12954292",b"12954293"),"utf-8","2664")
        with self.assertRaises(ValueError):b.parse(fixture().replace(b"1.01.2026",b"1.04.2026"),"utf-8","2664")
    def test_empty(self):
        self.assertEqual(b.quality(b.empty())["bank_balance_records"],0)
