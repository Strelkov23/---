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

def full_fixture():
    h="<h1>Список кредитных организаций по состоянию на 25.11.2026 (00:00 МСК)</h1><table><tr>"+"".join("<th>"+x+"</th>" for x in b.HEADERS)+"</tr>"
    return (h+"".join(f"<tr><td>{i}</td><td></td><td>{i}</td><td>1027739043750</td><td>Тест {i}</td><td>АО</td><td>06.09.1994</td><td>{'Действующая' if i%2 else 'Ликвидация'}</td><td>адрес</td></tr>" for i in range(1,101))+"</table>").encode()
class FullDirectoryTests(unittest.TestCase):
    def test_full(self):
        d=b.parse_full(full_fixture());self.assertEqual(len(d["rows"]),100)
        self.assertNotIn("адрес",str(d))
        self.assertEqual(d["rows"][1]["license_status"],"Ликвидация")
    def test_cache(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);out=root/"out";old=root/"old";out.mkdir();old.mkdir()
            d=b.publish(out,old,"2026-11-25",True,{"system":lambda:(fixture(),"utf-8"),"full":lambda:(full_fixture(),"utf-8")})
            self.assertEqual(b.quality(d)["credit_organization_active_license"],50)
            (old/b.FILE).write_bytes((out/b.FILE).read_bytes())
            def fail():raise OSError("test")
            d=b.publish(out,old,"2026-12-03",True,{"system":fail,"full":fail})
            self.assertEqual(d["datasets"]["full"]["status"],"cached")
            self.assertEqual(b.quality(d)["system_bank_records"],12)

    def test_missing_license(self):
        d=b.parse_full(full_fixture().replace("Действующая".encode(),b"",1))
        self.assertIsNone(d["rows"][0]["license_status"])
