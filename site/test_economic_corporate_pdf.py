import unittest
from economic_corporate_pdf import *
STAMP="2026-11-27T15:00:00+00:00"
# Synthetic values, not production observations.
HEADER="Операционные показатели деятельности Дивизиона 2021 2022 2023 2024"
ROW="Выработка электроэнергии на АЭС, млрд кВт•ч 100,000 101,000 102,000 103,000"
def data():
    return dict(schema="iv-physical-v1",companies=[dict(id="rosenergoatom",verification="source_rechecked",metrics=[dict(id="nuclear_generation",unit="млрд кВт·ч")],rows=[dict(year=y,nuclear_generation=v) for y,v in zip(YEARS,[100,101,999,103])])])
class PDFTests(unittest.TestCase):
    def test_exact(self):
        self.assertEqual(parse_lines([HEADER,ROW])[-1],{"year":2024,"value":103})
    def test_wrong_years(self):
        with self.assertRaises(ValueError):parse_lines([HEADER.replace("2021","2020"),ROW])
    def test_wrong_unit(self):
        with self.assertRaises(ValueError):parse_lines([HEADER,ROW.replace("млрд","млн")])
    def test_duplicate(self):
        with self.assertRaises(ValueError):parse_lines([HEADER,ROW,ROW])
    def test_comparison(self):
        r=compare(parse_lines([HEADER,ROW]),data())
        self.assertEqual([x["status"] for x in r],["match","match","review","match"])
    def test_bbox(self):
        import xml.etree.ElementTree as ET
        root=ET.Element("html");p=ET.SubElement(root,"page",width="1600",height="800")
        for y,line in [(100,HEADER),(120,ROW)]:
            x=20
            for word in line.split():
                width=len(word)*6
                ET.SubElement(p,"word",xMin=str(x),xMax=str(x+width),yMin=str(y),yMax=str(y+8)).text=word
                x+=width+5
        self.assertEqual(parse_bbox(ET.tostring(root))[0]["value"],100)
    def test_failed_refresh_retains(self):
        d=advance(blank(),data(),STAMP,True,lambda:("a"*64,parse_lines([HEADER,ROW])))
        def fail():raise Blocked("blocked")
        d=advance(d,data(),"2027-01-01T00:00:00+00:00",True,fail)
        self.assertEqual(d["status"],"blocked");self.assertEqual(len(d["rows"]),4)
    def test_offline(self):
        d=advance(blank(),data(),STAMP,False,lambda:self.fail("network"))
        self.assertEqual(d["rows"],[])
if __name__=="__main__":unittest.main()
