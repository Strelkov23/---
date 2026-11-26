import unittest
from literature_delivery import encode,unpack
class Delivery(unittest.TestCase):
    def test_roundtrip(self):
        data={"articles":[{"journal":"Journal","topics":None,"title":"Article "+str(i),"nested":{"x":[1,None,False]}} for i in range(100)],"registry":{"x":{}}, "links":{}}
        p=encode(data)
        self.assertEqual(p["encoding"],"rows")
        self.assertEqual(unpack(p),data)
    def test_missing_null_and_numeric(self):
        for rows in [[{},{"journal":None},{"journal":""}],[{"journal":1}]]:
            d={"articles":rows}
            self.assertEqual(unpack(encode(d)),d)
