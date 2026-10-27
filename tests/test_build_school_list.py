import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import build_school_list as builder


class ClassifyDruhTests(unittest.TestCase):
    def test_hospital_kindergarten_is_included(self):
        druh = "škola pre deti a žiakov so špeciálnymi výchovno-vzdelávacími potrebami"
        self.assertEqual(
            builder.classify_druh(druh, "MŠ pri zdravotníckom zariadení"),
            "špeciálna materská škola",
        )

    def test_hospital_primary_school_stays_primary(self):
        druh = "škola pre deti a žiakov so špeciálnymi výchovno-vzdelávacími potrebami"
        self.assertEqual(
            builder.classify_druh(druh, "ZŠ pri zdravotníckom zariadení"),
            "špeciálna základná škola",
        )

    def test_named_special_kindergartens(self):
        druh = "škola pre deti a žiakov so špeciálnymi výchovno-vzdelávacími potrebami"
        for typ in ("Špeciálna materská škola", "ŠMŠ pre deti s autizmom"):
            self.assertEqual(builder.classify_druh(druh, typ), "špeciálna materská škola", typ)

    def test_secondary_special_schools_are_excluded(self):
        druh = "škola pre deti a žiakov so špeciálnymi výchovno-vzdelávacími potrebami"
        for typ in (
            "Praktická škola",
            "Odborné učilište",
            "SOŠ pri špeciálnom výchovnom zariadení",
            "Gymnázium pre žiakov s nadaním",
        ):
            self.assertIsNone(builder.classify_druh(druh, typ), typ)

    def test_canteen_at_kindergarten_is_not_a_school(self):
        self.assertIsNone(
            builder.classify_druh(
                "školské účelové zariadenie",
                "Školská jedáleň/výdajňa ŠJ pri MŠ",
            )
        )

    def test_regular_kinds_pass_through(self):
        self.assertEqual(builder.classify_druh("materská škola", "MŠ celodenná výchova a vzdelávanie"), "materská škola")
        self.assertEqual(builder.classify_druh("základná škola", "Základná škola"), "základná škola")


if __name__ == "__main__":
    unittest.main()
