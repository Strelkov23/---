import unittest
from economic_ai_discovery import *
STAMP="2026-11-27T03:17:00+00:00"
def metadata(page):
    return [{"page":1,"pages":1,"total":2},[{"id":"NY.TEST","source":{"id":"2"},"name":"Test","unit":"USD","sourceNote":"Definition"},{"id":"SL.TEST","source":{"id":"2"},"name":"Labour","unit":"%","sourceNote":"Definition"}]]
def observation(code):
    return [{"pages":1,"total":3,"lastupdated":"2026-01-01"},[{"countryiso3code":"RUS","indicator":{"id":code},"date":y,"value":v} for y,v in [("1990",7),("2025",3),("2024",None)]]]
class DiscoveryTests(unittest.TestCase):
    def test_discovery(self):
        self.assertEqual(set(discover({"SL.TEST"},metadata)),{"NY.TEST"})
    def test_import(self):
        data=advance(blank(),{"SL.TEST"},STAMP,True,metadata,observation)
        self.assertEqual(validate(data)["discovery_observations"],1)
        self.assertEqual(data["rows"]["NY.TEST"]["values"],{"2025":3.0})
    def test_offline(self):
        def fail(*a):self.fail("Unexpected network")
        self.assertEqual(advance(blank(),set(),STAMP,False,fail,fail)["rows"],{})
    def test_error_retains(self):
        data=advance(blank(),set(),STAMP,True,metadata,observation)
        def fail(*a):raise OSError()
        data=advance(data,set(),"2026-12-28T03:17:00+00:00",True,fail,fail)
        self.assertEqual(data["rows"]["NY.TEST"]["values"],{"2025":3.0})
        self.assertEqual(data["rows"]["NY.TEST"]["status"],"error")
    def test_wrong_country(self):
        d=observation("NY.TEST");d[1][0]["countryiso3code"]="USA"
        with self.assertRaises(ValueError):values_from_payload(d,"NY.TEST",STAMP)
    def test_incomplete(self):
        def bad(p):
            x=metadata(p);x[0]["total"]=3;return x
        with self.assertRaises(ValueError):discover(set(),bad)
    def test_changed_definition(self):
        data=advance(blank(),set(),STAMP,True,metadata,observation)
        def changed(p):
            x=metadata(p);x[1][0]["sourceNote"]="Changed";return x
        def fail(*a):raise OSError()
        data=advance(data,set(),"2026-12-05T03:17:00+00:00",True,changed,fail)
        self.assertEqual(data["rows"]["NY.TEST"]["values"],{})
    def test_null_withdrawal(self):
        data=advance(blank(),set(),STAMP,True,metadata,observation)
        def empty(code):
            x=observation(code);x[1][1]["value"]=None;return x
        data=advance(data,set(),"2026-12-28T03:17:00+00:00",True,metadata,empty)
        self.assertEqual(data["rows"]["NY.TEST"]["status"],"empty")
        self.assertEqual(data["rows"]["NY.TEST"]["values"],{})
if __name__=="__main__":unittest.main()
