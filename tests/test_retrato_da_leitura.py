# -*- coding: utf-8 -*-
"""O retrato da última leitura que correu bem, gravado no disco.

Arrancar a app sem acesso ao livro (no trem, com o OneDrive em baixo) dava uma
vista de Tarefas vazia — e vazio parece "não tens nada" em vez de "não consegui
ler". Aqui prova-se que o retrato é gravado, relido e não escrito duas vezes
quando a leitura vem igual.

Corre offline: o ficheiro do retrato é apontado a uma pasta temporária, e nada
aqui abre Excel nem toca no livro de ninguém.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import tasks

CHAVE = ("C:/livros/tracker.xlsx", "BSP-G2", "Carlos", False, "pt")


def _leitura(digest="d1", linhas=1):
    return {"rows": [{"Function/TC": f"fn{i}"} for i in range(linhas)],
            "sheet": "BSP-G2", "digest": digest,
            # campos que são desta sessão e não pertencem a um retrato
            "files": ["a", "b"], "graph": {"connected": True}, "notice": "olá"}


class TestRetratoDaLeitura(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = tasks.LAST_READ_FILE
        tasks.LAST_READ_FILE = os.path.join(self.tmp, "last_read.json")

    def tearDown(self):
        tasks.LAST_READ_FILE = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_sem_retrato_nao_ha_nada_para_servir(self):
        self.assertIsNone(tasks.load_last_read(CHAVE))

    def test_uma_leitura_boa_fica_gravada_com_a_hora(self):
        tasks.save_last_read(CHAVE, _leitura())
        retrato = tasks.load_last_read(CHAVE)
        self.assertEqual(len(retrato["rows"]), 1)
        self.assertTrue(retrato["at"])

    def test_o_que_e_desta_sessao_nao_entra_no_retrato(self):
        tasks.save_last_read(CHAVE, _leitura())
        retrato = tasks.load_last_read(CHAVE)
        for campo in ("files", "graph", "notice"):
            self.assertNotIn(campo, retrato)

    def test_uma_leitura_com_erro_nao_e_um_retrato(self):
        tasks.save_last_read(CHAVE, {"error": "não consegui ler", "rows": []})
        self.assertIsNone(tasks.load_last_read(CHAVE))

    def test_uma_leitura_sem_linhas_nao_e_um_retrato(self):
        tasks.save_last_read(CHAVE, {"rows": [], "digest": "x"})
        self.assertIsNone(tasks.load_last_read(CHAVE))

    def test_a_mesma_leitura_nao_se_grava_duas_vezes(self):
        tasks.save_last_read(CHAVE, _leitura(digest="d1"))
        primeiro = tasks.load_last_read(CHAVE)["at"]
        tasks.save_last_read(CHAVE, _leitura(digest="d1", linhas=9))
        # o conteúdo é o mesmo (mesmo digest): não se reescreve nada
        self.assertEqual(tasks.load_last_read(CHAVE)["at"], primeiro)
        self.assertEqual(len(tasks.load_last_read(CHAVE)["rows"]), 1)

    def test_conteudo_novo_substitui_o_retrato(self):
        tasks.save_last_read(CHAVE, _leitura(digest="d1"))
        tasks.save_last_read(CHAVE, _leitura(digest="d2", linhas=3))
        self.assertEqual(len(tasks.load_last_read(CHAVE)["rows"]), 3)

    def test_cada_livro_e_aba_tem_o_seu_retrato(self):
        outra = ("C:/livros/outro.xlsx", "Sheet1", "Carlos", False, "pt")
        tasks.save_last_read(CHAVE, _leitura(digest="d1", linhas=1))
        tasks.save_last_read(outra, _leitura(digest="d2", linhas=5))
        self.assertEqual(len(tasks.load_last_read(CHAVE)["rows"]), 1)
        self.assertEqual(len(tasks.load_last_read(outra)["rows"]), 5)

    def test_so_se_guardam_os_ultimos_retratos(self):
        for i in range(tasks.LAST_READ_KEEP + 3):
            tasks.save_last_read((f"C:/l{i}.xlsx", "s", "p", False, "pt"),
                                 _leitura(digest=f"d{i}"))
        with open(tasks.LAST_READ_FILE, encoding="utf-8") as f:
            self.assertEqual(len(json.load(f)), tasks.LAST_READ_KEEP)
        # o primeiro saiu, o último ficou
        self.assertIsNone(tasks.load_last_read(("C:/l0.xlsx", "s", "p", False, "pt")))
        ultimo = tasks.LAST_READ_KEEP + 2
        self.assertIsNotNone(
            tasks.load_last_read((f"C:/l{ultimo}.xlsx", "s", "p", False, "pt")))

    def test_um_retrato_grande_demais_nao_se_guarda(self):
        gorda = {"rows": [{"x": "a" * 200} for _ in range(20000)], "digest": "big"}
        tasks.save_last_read(CHAVE, gorda)
        self.assertIsNone(tasks.load_last_read(CHAVE))

    def test_esquecer_apaga_os_retratos(self):
        tasks.save_last_read(CHAVE, _leitura())
        tasks.forget_last_read()
        self.assertIsNone(tasks.load_last_read(CHAVE))


if __name__ == "__main__":
    unittest.main()
