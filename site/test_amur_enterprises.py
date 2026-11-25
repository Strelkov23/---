import unittest
import amur_enterprises as a
def fixture():
    return ("<html>"+"".join(f'<h6>ООО «Фирма {i}»</h6><p>Производство мебели</p><p>Н.п.: город</p><p>Сайт: нет</p><p>Email: test@example.com</p><button>Смотреть карточку</button>' for i in range(21))+'<h6>ИП Иванов</h6><p>Н.п.: город</p><p>Сайт: нет</p><button>Смотреть карточку</button></html>').encode()
class Test(unittest.TestCase):
    def test_parse(self):
        rows,n=a.parse(fixture());self.assertEqual(len(rows),21);self.assertEqual(n,22)
        self.assertTrue(all(r["category"]=="Производство мебели" and r["locality"]=="город" for r in rows))
        self.assertNotIn("test@example.com",str(rows))
    def test_short(self):
        with self.assertRaises(ValueError):a.parse(b"<h6>empty</h6>")
