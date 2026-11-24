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
if __name__=="__main__":unittest.main()
