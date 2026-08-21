# -*- coding: utf-8 -*-
"""O arquivo das CCRs apagadas (cswaios/store.py archive_ccr).

Apagar uma CCR era definitivo, ao contrário do quadro Por fazer, que arruma os
concluídos num arquivo: quem apagava perdia os passos feitos e, com eles, a
resposta a "quanto tempo nos leva uma CCR".

Corre offline, com os ficheiros de estado numa pasta temporária.
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import store


class TestArquivoDasCCRs(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = store.CCR_ARCHIVE_FILE
        store.CCR_ARCHIVE_FILE = os.path.join(self.tmp, "ccr_done_archive.json")

    def tearDown(self):
        store.CCR_ARCHIVE_FILE = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_ccr_com_passos_feitos_fica_guardada(self):
        store.archive_ccr("1234", {"checks": {"versoes": True, "header": False},
                                   "note": "", "created": "18/08 10:00",
                                   "created_iso": "2026-08-18"})
        arquivo = store.load_ccr_archive()
        self.assertEqual(len(arquivo), 1)
        self.assertEqual(arquivo[0]["id"], "1234")
        self.assertEqual(arquivo[0]["checks"], {"versoes": True, "header": False})
        self.assertEqual(arquivo[0]["created_iso"], "2026-08-18")
        self.assertTrue(arquivo[0]["deleted_at"])

    def test_ccr_com_nota_mas_sem_passos_tambem_fica(self):
        store.archive_ccr("55", {"checks": {}, "note": "a aguardar o cliente"})
        self.assertEqual(len(store.load_ccr_archive()), 1)

    def test_ccr_vazia_nao_suja_o_arquivo(self):
        """Quem adiciona uma CCR por engano e a apaga a seguir não deixa lixo."""
        store.archive_ccr("77", {"checks": {}, "note": "", "created": "18/08 10:00"})
        self.assertEqual(store.load_ccr_archive(), [])

    def test_passos_todos_a_falso_conta_como_vazia(self):
        store.archive_ccr("78", {"checks": {"versoes": False}, "note": ""})
        self.assertEqual(store.load_ccr_archive(), [])

    def test_apagar_a_mesma_ccr_duas_vezes_nao_duplica(self):
        store.archive_ccr("1", {"checks": {"versoes": True}})
        store.archive_ccr("1", {"checks": {"versoes": True, "header": True}})
        arquivo = store.load_ccr_archive()
        self.assertEqual(len(arquivo), 1)
        # fica a última, que é a que sabe mais
        self.assertEqual(arquivo[0]["checks"], {"versoes": True, "header": True})

    def test_o_arquivo_tem_teto(self):
        for n in range(store.CCR_ARCHIVE_MAX + 20):
            store.archive_ccr(str(n), {"checks": {"versoes": True}})
        self.assertEqual(len(store.load_ccr_archive()), store.CCR_ARCHIVE_MAX)

    def test_entrada_estragada_nao_rebenta(self):
        store.archive_ccr("9", None)
        store.archive_ccr("9", "isto não é um dicionário")
        self.assertEqual(store.load_ccr_archive(), [])

    def test_ficheiro_estragado_le_se_como_vazio(self):
        with open(store.CCR_ARCHIVE_FILE, "w", encoding="utf-8") as f:
            f.write("{isto não é json}")
        self.assertEqual(store.load_ccr_archive(), [])

    def test_o_arquivo_entra_nas_copias_do_estado(self):
        from cswaios import statefile
        self.assertIn("ccr_done_archive.json", statefile.STATE_FILES)


if __name__ == "__main__":
    unittest.main()
