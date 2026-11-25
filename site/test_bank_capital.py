import unittest,json
from pathlib import Path
import bank_capital as b
def fixture(value="1 401 603"):
    return f'<h1>Отчет об уровне достаточности капитала для покрытия рисков (публикуемая форма) на 1.01.2026</h1><p>Регистрационный номер (порядковый номер)</p><p>2650</p><p>Код формы по ОКУД 0409808</p><table><tr><th>Номер строки</th><th>Наименование</th><th>Пояснение</th><th>Стоимость на отчетную дату, тыс. руб.</th><th>Стоимость на начало отчетного года, тыс. руб.</th></tr><tr><td>59</td><td>Собственные средства (капитал), итого</td><td></td><td>{value}</td><td>0</td></tr><tr><td>14</td><td>Собственные средства (капитал), итого</td><td></td><td></td><td></td></tr></table>'.encode()
class BankCapital(unittest.TestCase):
    def test_parse(self):
        r=b.parse(fixture(),"utf-8","2650");self.assertEqual(r["capital"],"1401603");self.assertEqual(r["opening"],"0")
        with self.assertRaises(ValueError):b.parse(fixture(),"utf-8","1")
        with self.assertRaises(ValueError):b.parse(fixture(""),"utf-8","2650")
    def test_seed(self):
        d=json.loads(Path(b.__file__).with_name("bank-capital-seed.json").read_text())
        self.assertEqual(b.quality(d),{"bank_capital_records":8,"bank_capital_html_verified":0})
