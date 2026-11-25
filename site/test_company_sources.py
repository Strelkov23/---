import unittest
import company_sources as c
def fixture():
    path="https://file.nalog.ru/opendata/7707329152-revexp/"
    fields={"Идентификационный номер":"7707329152-revexp","Гиперссылка (URL) на набор":path+"data-20261025-structure-20180110.zip","Описание структуры набора данных":path+"structure-20180110.xsd","Формат данных":"xml","Дата последнего внесения изменений":"25.10.2026","Содержание последнего изменения":"Данные за 2025 год"}
    return ("<table>"+"".join(f"<tr><td>{i}</td><td>{k}</td><td>{v}</td></tr>" for i,(k,v) in enumerate(fields.items()))+"</table>").encode()
class TestCompanySources(unittest.TestCase):
    def test_catalog(self):
        d=c.parse_catalog(fixture(),"utf-8","income_expense");self.assertEqual(d["report_year"],2025);self.assertEqual(d["release"],"2026-10-25")
    def test_bad_link(self):
        with self.assertRaises(ValueError):c.parse_catalog(fixture().replace(b"file.nalog.ru",b"bad.example"),"utf-8","income_expense")
    def test_schema(self):
        d=c.inspect_schema(b'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="File"/><xs:attribute name="INN"/></xs:schema>')
        self.assertEqual(d["attributes"],["INN"])
        with self.assertRaises(ValueError):c.inspect_schema(b'<!DOCTYPE a><a/>')
