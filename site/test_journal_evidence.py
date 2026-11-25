import sqlite3,unittest,copy
import journal_evidence as j
import literature

class EvidenceTests(unittest.TestCase):
    def test_registry_and_idempotence(self):
        with sqlite3.connect(":memory:") as db:
            registry=literature.registry();articles=[{"journal":"Вопросы экономики"}]
            d=j.collect(db,registry,articles,"2026-11-25T12:00:00+00:00")
            self.assertEqual(j.quality(d,dict(registry=registry,articles=articles)),dict(journal_evidence_journals=len(registry),journal_evidence_versions=len(registry)))
            newer=j.collect(db,registry,articles,"2026-11-26T12:00:00+00:00")
            self.assertEqual(d["journals"],newer["journals"])
            changed=copy.deepcopy(registry);changed["Вопросы экономики"]["note"]="Уточнение источника"
            x=j.collect(db,changed,articles,"2026-11-27T12:00:00+00:00")
            self.assertEqual(j.quality(x,dict(registry=changed,articles=articles))["journal_evidence_versions"],len(registry)+1)
            row=next(r for r in x["journals"] if r["current"]["journal"]=="Вопросы экономики")
            self.assertEqual(len(row["versions"]),2)
            row["versions"][0]["record"]["tags"].append("Unknown")
            with self.assertRaises(ValueError):j.quality(x,dict(registry=changed,articles=articles))
    def test_issn(self):
        self.assertTrue(j.issn_valid("0042-8736"))
        self.assertTrue(j.issn_valid("2949-320X"))
        self.assertFalse(j.issn_valid("0042-8735"))
    def test_historical_evidence_not_inferred(self):
        m=j.canonical("Проблемы прогнозирования",literature.registry()["Проблемы прогнозирования"])
        self.assertEqual(m["white_history"],{"2023":2,"2025":1})
        self.assertNotIn("2024",m["white_history"])
        self.assertEqual(m["evidence_scope"],"journal_registry_set")
