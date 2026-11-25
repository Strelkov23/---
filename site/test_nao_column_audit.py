import io,unittest
from openpyxl import Workbook
import nao_column_audit as p
class ColumnAudit(unittest.TestCase):
    def test_audit(self):
        wb=Workbook();s=wb.active
        s.cell(5,1,"Номер");s.cell(5,2,"Наименование проекта");s.cell(5,3,"Объем инвестиций")
        s.append([1,"PRIVATE SAMPLE",3.5]);s.append([2,"ANOTHER SAMPLE","—"])
        raw=io.BytesIO();wb.save(raw)
        r=p.inspect(raw.getvalue())[0]
        self.assertEqual(r["headers"][2]["header"],"Объем инвестиций")
        self.assertEqual(r["column_types"][2]["types"],{"missing_marker":1,"number":1})
        self.assertEqual(r["numeric_first_cell"],2)
        self.assertNotIn("PRIVATE SAMPLE",str(r))
    def test_cells(self):
        self.assertEqual(p.cell_type("0"),"numeric_text")
        self.assertEqual(p.cell_type(0),"number")
        self.assertEqual(p.cell_type(None),"blank")
        self.assertEqual(p.cell_type("—"),"missing_marker")
