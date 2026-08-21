# -*- coding: utf-8 -*-
"""Em que pé estão as sugestões de cada pessoa (cswaios/feedback.py my_reports).

Quem enviava uma sugestão não voltava a saber nada dela. O estado já estava na
partilha, dito pela pasta onde o reporte vive: `feedback\\` por tratar,
`feedback\\Fixed\\` tratado. Aqui prova-se a divisão, e o caso que interessa
mais: sem a partilha ao alcance responde-se "não sei", e não "nada".

Corre offline: a partilha é uma pasta temporária, via BSP_FEEDBACK_DIR.
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import feedback


class TestAsMinhasSugestoes(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.partilha = os.path.join(self.tmp, "share")
        self.abertos = os.path.join(self.partilha, "feedback")
        self.tratados = os.path.join(self.abertos, "Fixed")
        os.makedirs(self.tratados, exist_ok=True)
        self.real_env = os.environ.get("BSP_FEEDBACK_DIR")
        os.environ["BSP_FEEDBACK_DIR"] = self.partilha
        self.real_pending = feedback.PENDING_DIR
        feedback.PENDING_DIR = os.path.join(self.tmp, "feedback_pending")
        os.makedirs(feedback.PENDING_DIR, exist_ok=True)

    def tearDown(self):
        if self.real_env is None:
            os.environ.pop("BSP_FEEDBACK_DIR", None)
        else:
            os.environ["BSP_FEEDBACK_DIR"] = self.real_env
        feedback.PENDING_DIR = self.real_pending
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _pasta(self, onde, nome):
        os.makedirs(os.path.join(onde, nome), exist_ok=True)

    def _sem_partilha(self):
        """my_reports com a partilha fora de alcance.

        O `feedback.py` faz `from .updates import find_releases_dir`, por isso e
        o nome DELE que tem de ser substituido: trocar o do `updates` deixava
        este teste a ler a pasta partilhada a serio.
        """
        os.environ["BSP_FEEDBACK_DIR"] = ""
        real = feedback.find_releases_dir
        feedback.find_releases_dir = lambda: None
        try:
            return feedback.my_reports("Carlos Andrade")
        finally:
            feedback.find_releases_dir = real

    # ------------------------------------------------------------ o nome
    def test_o_nome_da_pasta_usa_a_mesma_regra_do_envio(self):
        # se as duas regras divergissem, ficavam reportes que ninguém encontra
        self.assertEqual(feedback.safe_name("Carlos Andrade"), "Carlos_Andrade")
        self.assertEqual(feedback.safe_name(""), "anon")
        self.assertEqual(feedback.safe_name(None, "auto"), "auto")

    # ------------------------------------------------------------ a divisão
    def test_divide_por_tratar_e_tratadas(self):
        self._pasta(self.abertos, "20260818_101533_Carlos_Andrade")
        self._pasta(self.tratados, "20260810_090000_Carlos_Andrade")
        out = feedback.my_reports("Carlos Andrade")
        self.assertTrue(out["reachable"])
        self.assertEqual(out["open"], ["20260818_101533_Carlos_Andrade"])
        self.assertEqual(out["fixed"], ["20260810_090000_Carlos_Andrade"])

    def test_as_sugestoes_de_outra_pessoa_nao_aparecem(self):
        self._pasta(self.abertos, "20260818_101533_Mariana_Ribeiro")
        out = feedback.my_reports("Carlos Andrade")
        self.assertEqual(out["open"], [])

    def test_o_que_esta_por_entregar_neste_pc_tambem_conta(self):
        self._pasta(feedback.PENDING_DIR, "20260819_120000_Carlos_Andrade")
        out = feedback.my_reports("Carlos Andrade")
        self.assertEqual(out["pending"], ["20260819_120000_Carlos_Andrade"])

    def test_o_reporte_automatico_tambem_e_meu(self):
        self._pasta(self.abertos, "BUG_20260818_101533_Carlos_Andrade")
        out = feedback.my_reports("Carlos Andrade")
        self.assertEqual(out["open"], ["BUG_20260818_101533_Carlos_Andrade"])

    def test_ficheiros_soltos_nao_contam_como_reportes(self):
        with open(os.path.join(self.abertos, "leia-me_Carlos_Andrade"), "w") as f:
            f.write("x")
        out = feedback.my_reports("Carlos Andrade")
        self.assertEqual(out["open"], [])

    # ------------------------------------------------------------ sem alcance
    def test_sem_partilha_diz_que_nao_alcanca(self):
        """Dizer "não sei" é melhor do que dizer "nada" — o silêncio parecia
        desprezo pela sugestão de quem a enviou."""
        out = self._sem_partilha()
        self.assertFalse(out["reachable"])
        self.assertEqual(out["open"], [])

    def test_sem_partilha_ainda_mostra_o_que_esta_neste_pc(self):
        self._pasta(feedback.PENDING_DIR, "20260819_120000_Carlos_Andrade")
        out = self._sem_partilha()
        self.assertFalse(out["reachable"])
        self.assertEqual(out["pending"], ["20260819_120000_Carlos_Andrade"])

    def test_pasta_fixed_em_falta_nao_rebenta(self):
        shutil.rmtree(self.tratados)
        out = feedback.my_reports("Carlos Andrade")
        self.assertFalse(out["reachable"])   # não se conseguiu ler tudo
        self.assertEqual(out["fixed"], [])

    def test_sem_nome_nao_apanha_as_dos_outros(self):
        self._pasta(self.abertos, "20260818_101533_Mariana_Ribeiro")
        out = feedback.my_reports("")
        # sem nome o sufixo é "_anon": não casa com o de ninguém
        self.assertEqual(out["open"], [])


if __name__ == "__main__":
    unittest.main()
