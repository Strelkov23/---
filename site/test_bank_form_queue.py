import unittest
import bank_form_queue as q
class BankQueue(unittest.TestCase):
    def test_complete_partial_first(self):
        self.assertEqual(q.plan(["1","2","3","4","5"],{"5"},{"4"},{}, "2026-11-25",{"1":0,"2":2,"3":1,"4":0},4),["4","2","3","1"])
    def test_retry_and_limit(self):
        a={"2":{"checked":"2026-11-25"},"3":{"checked":"2026-11-01"}}
        self.assertEqual(q.plan(["1","2","3","4"],set(),set(),a,"2026-11-26",{"2":2,"3":2,"4":1}),["4","1","3"])
        self.assertEqual(len(q.plan([str(i) for i in range(1,100)],set(),set(),{},"2026-11-26")),20)
    def test_missing_snapshot(self):
        import tempfile
        with tempfile.TemporaryDirectory() as path:self.assertEqual(q.coverage(path),{})

    def test_prior_snapshot_comparison(self):
        import tempfile,json
        from pathlib import Path
        from unittest.mock import patch
        import bank_capital,bank_balance,bank_profit
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)
            directory={"datasets":{"system":{"rows":[]},"full":{"rows":[]}}}
            (p/"bank-directory.json").write_text(json.dumps(directory))
            for module,rows in ((bank_capital,[{"registration_number":"2","verification":"html"}]),(bank_balance,[{"registration_number":"2"}]),(bank_profit,[])):
                (p/module.FILE).write_text(json.dumps({"rows":rows,"attempts":{}}))
            with patch.object(bank_capital,"target_cohort",return_value=[str(i) for i in range(1,31)]),patch.object(bank_capital,"quality"),patch.object(bank_balance,"quality"),patch.object(bank_profit,"quality"):
                d=q.audit(p,"2026-11-26")
            self.assertEqual(d["distribution"],{"0":29,"1":0,"2":1,"3":0})
            self.assertEqual(d["scope"],"conditional_queue_simulation_not_import")
            self.assertTrue(all(n<=20 for n in d["coordinated"]["requests"]))
