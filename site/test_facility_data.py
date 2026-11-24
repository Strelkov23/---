import io,zipfile,unittest
import facility_data as f
def archive(rows):
    b=io.BytesIO()
    with zipfile.ZipFile(b,"w") as z:z.writestr("global_power_plant_database.csv","country,name,gppd_idnr,capacity_mw,latitude,longitude,primary_fuel,source,url,generation_gwh_2017\n"+rows)
    return b.getvalue()
class FacilityTest(unittest.TestCase):
    def test_parse(self):
        r=f.parse(archive("RUS,Example,A,10,55.123,80.456,Gas,Example,https://example.com,20\nUSA,Other,B,20,42,80,Gas,Example,https://example.com,\n"))
        self.assertEqual(len(r),1)
        self.assertEqual(r[0]["latitude"],55.1)
        self.assertEqual(r[0]["longitude"],80.5)
        self.assertEqual(r[0]["generation"],{"2017":20})
    def test_missing(self):
        r=f.parse(archive("RUS,Example,A,,55,80,Gas,Example,,\n"))
        self.assertIsNone(r[0]["capacity_mw"]);self.assertEqual(r[0]["generation"],{})
    def test_duplicate(self):
        with self.assertRaises(ValueError):f.parse(archive("RUS,Example,A,10,55,80,Gas,Example,,\nRUS,Example,A,10,55,80,Gas,Example,,\n"))
    def test_bad(self):
        with self.assertRaises(ValueError):f.parse(archive("RUS,Example,A,10,nan,80,Gas,Example,,\n"))
    def test_quality(self):
        rows=[dict(id=str(i),name="Example",latitude=55.1,longitude=80.2,capacity_mw=10,generation={}) for i in range(100)]
        data=dict(schema=1,release=f.RELEASE,source=f.SOURCE,license=f.LICENSE,status="ok",sha256="a"*64,rows=rows)
        counts,warnings=f.quality(data)
        self.assertEqual(counts["facility_records"],100)
        self.assertEqual(counts["facility_reported_generation_records"],0)
        self.assertTrue(any("нет наблюдаемой" in w for w in warnings))
        with self.assertRaises(ValueError):f.quality(dict(data,rows=rows[1:]))
        with self.assertRaises(ValueError):f.quality(dict(data,rows=[dict(rows[0],latitude=55.123),*rows[1:]]))
        with self.assertRaises(ValueError):f.quality(dict(data,rows=[dict(rows[0],id="new"),*rows[1:]]),data)
if __name__=="__main__":unittest.main()
