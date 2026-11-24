import json,unittest
import regional_geo as g
class GeoTests(unittest.TestCase):
    def fixture(self):
        return {"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Test","iso_3166_2":"RU-"+str(i)},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}} for i in range(83)]}
    def test_valid(self):
        self.assertEqual(g.validate(json.dumps(self.fixture()).encode()),83)
    def test_unnamed_feature(self):
        data=self.fixture()
        data["features"][0]["properties"].pop("name")
        self.assertEqual(g.validate(json.dumps(data).encode()),83)
    def test_invalid(self):
        data=self.fixture()
        data["features"][0]["geometry"]["coordinates"][0][0][0]=181
        with self.assertRaises(ValueError):g.validate(json.dumps(data).encode())
    def test_inventory(self):
        data=self.fixture()
        data["features"][1]["properties"]["iso_3166_2"]="RU-0"
        data["features"][2]["properties"].pop("name")
        result=g.inventory(json.dumps(data).encode())
        self.assertEqual(result["contours"],83)
        self.assertEqual(result["duplicate_codes"],["RU-0"])
        self.assertEqual(result["unmatched_contours"],1)
        self.assertEqual(result["vertices"],332)
        self.assertEqual(len(result["unique_codes"]),80)
    def test_continuity(self):
        old=self.fixture();new=self.fixture()
        new["features"][1]["properties"]["iso_3166_2"]="RU-0"
        with self.assertRaises(ValueError):g.assert_continuity(json.dumps(old).encode(),json.dumps(new).encode())
        g.assert_continuity(json.dumps(old).encode(),json.dumps(old).encode())
    def test_no_fake_geometry(self):
        with self.assertRaises(ValueError):g.validate(b'{"type":"FeatureCollection","features":[]}')
if __name__=="__main__":unittest.main()
