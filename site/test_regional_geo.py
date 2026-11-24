import json,unittest
import regional_geo as g
class GeoTests(unittest.TestCase):
    def fixture(self):
        return {"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Test","iso_3166_2":"RU-"+str(i)},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}} for i in range(83)]}
    def test_valid(self):
        self.assertEqual(g.validate(json.dumps(self.fixture()).encode()),83)
    def test_invalid(self):
        data=self.fixture()
        data["features"][0]["geometry"]["coordinates"][0][0][0]=181
        with self.assertRaises(ValueError):g.validate(json.dumps(data).encode())
    def test_no_fake_geometry(self):
        with self.assertRaises(ValueError):g.validate(b'{"type":"FeatureCollection","features":[]}')
if __name__=="__main__":unittest.main()
