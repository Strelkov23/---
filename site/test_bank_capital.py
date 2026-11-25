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
    def test_plan(self):
        d={"rows":[{"registration_number":"1","verification":"html"}],"attempts":{"2":{"checked":"2026-11-25","error":"no report"}}}
        self.assertEqual(b.plan(d,["1","2","3","4"],["4"],"2026-11-25"),["4","3"])
        self.assertEqual(b.plan(d,["1","2","3","4"],["4"],"2026-12-09"),["4","3","2"])
        self.assertEqual(len(b.plan({"rows":[]},[str(x) for x in range(1,50)],[],"2026-11-25")),20)
        self.assertEqual(b.plan(dict(d,expansion_day="2026-11-25"),["3"],[],"2026-11-25"),[])
    def test_target(self):
        base=dict(license_status="Действующая",kind=None,registered="2020-01-01")
        rows=[dict(base,registration_number="1"),dict(base,registration_number="2",kind="Расчетная НКО"),dict(base,registration_number="3",registered="2026-02-01"),dict(base,registration_number="4",license_status="Отозвана")]
        self.assertEqual(b.target_cohort({"datasets":{"full":{"rows":rows}}}),["1"])
