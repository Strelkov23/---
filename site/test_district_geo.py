import json,unittest
import district_geo as d
class DistrictTests(unittest.TestCase):
    def fixture(self):
        return {"type":"FeatureCollection","features":[{"type":"Feature","properties":{"shapeID":str(i),"shapeName":"District "+str(i)},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}} for i in range(d.COUNT)]}
    def test_valid(self):
        self.assertEqual(d.validate(json.dumps(self.fixture()).encode()),{"features":d.COUNT,"vertices":4*d.COUNT})
    def test_release_pin(self):
        self.assertEqual(d.EXPECTED-d.COUNT,1)
        with self.assertRaises(ValueError):d.verify_release(json.dumps(self.fixture()).encode())
    def test_duplicate(self):
        data=self.fixture();data["features"][1]["properties"]["shapeID"]="0"
        with self.assertRaises(ValueError):d.validate(json.dumps(data).encode())
    def test_missing(self):
        data=self.fixture();data["features"].pop()
        with self.assertRaises(ValueError):d.validate(json.dumps(data).encode())
    def test_invalid_ring(self):
        data=self.fixture();data["features"][0]["geometry"]["coordinates"][0][0]=[181,0]
        with self.assertRaises(ValueError):d.validate(json.dumps(data).encode())
