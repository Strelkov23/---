import unittest
import bank_registry as b
def fixture():
    return ("<h1>Перечень системно значимых кредитных организаций на 07.10.2026</h1><table><tr><th>№ п/п</th><th>Наименование кредитной организации</th><th>Рег. №</th></tr>"+"".join(f"<tr><td>{i}</td><td>Тест {i}</td><td>{100+i}</td></tr>" for i in range(1,13))+"</table>").encode()
class BankRegistryTests(unittest.TestCase):
    def test_parse(self):
        d=b.parse(fixture());self.assertEqual(d["edition"],"2026-10-07");self.assertEqual(len(d["rows"]),12);self.assertEqual(d["rows"][0]["registration_number"],"101")
    def test_duplicate(self):
        with self.assertRaises(ValueError):b.parse(fixture().replace(b"<td>102</td>",b"<td>101</td>"))
    def test_missing_date(self):
        with self.assertRaises(ValueError):b.parse(fixture().replace(b"07.10.2026",b""))
