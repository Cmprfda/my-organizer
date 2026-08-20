# -*- coding: utf-8 -*-
"""A entrega do feedback de quem NÃO alcança a pasta partilhada.

Do reporte 20260820_105055: "o meu colega tentou dar uma sugestão e não
conseguiu escrever na pasta do OneDrive nem a app abriu uma issue no git já
preenchida". A causa era a pasta sincronizada cair para a pasta da própria app:
a entrega dava-se por feita num sítio que ninguém lê, e por estar "feita" a app
não oferecia a via pública.

Nada aqui sai da máquina: as pastas são temporárias, o link partilhado é
desligado (BSP_FEEDBACK_SHARE="") e o `gh` é dado como não instalado — que é
justamente a máquina do colega. Sem isso, um teste destes abre issues a sério no
repositório público (aconteceu: as issues #1 a #6 foram fechadas à mão).
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import feedback


class TestEntregaSemPartilha(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.reais = (feedback.PENDING_DIR, feedback.HERE,
                      feedback.find_releases_dir, feedback._find_gh,
                      os.environ.get("BSP_FEEDBACK_SHARE"),
                      os.environ.get("BSP_FEEDBACK_DIR"))
        feedback.PENDING_DIR = os.path.join(self.tmp, "feedback_pending")
        feedback.HERE = os.path.join(self.tmp, "app")
        os.makedirs(feedback.HERE, exist_ok=True)
        feedback.find_releases_dir = lambda: None      # sem a partilha ao alcance
        feedback._find_gh = lambda: None               # e sem o gh instalado
        os.environ["BSP_FEEDBACK_SHARE"] = ""          # e sem link de partilha
        os.environ.pop("BSP_FEEDBACK_DIR", None)

    def tearDown(self):
        (feedback.PENDING_DIR, feedback.HERE, feedback.find_releases_dir,
         feedback._find_gh, share, pasta) = self.reais
        for nome, valor in (("BSP_FEEDBACK_SHARE", share), ("BSP_FEEDBACK_DIR", pasta)):
            if valor is None:
                os.environ.pop(nome, None)
            else:
                os.environ[nome] = valor
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _monta(self, nome="20260820_120000_Colega"):
        pasta = feedback.stage_feedback_folder(nome)
        with open(os.path.join(pasta, "feedback.txt"), "w", encoding="utf-8") as f:
            f.write("De: Colega\nApp: v156\n\numa sugestão\n")
        return pasta

    def test_sem_partilha_nao_ha_pasta_sincronizada(self):
        self.assertEqual(feedback.feedback_root(), "")

    def test_sem_partilha_o_feedback_fica_pendente_e_nao_na_pasta_da_app(self):
        pasta = self._monta()
        via = feedback.deliver(pasta, allow_relay=False)
        self.assertEqual(via, "")                      # nada foi entregue
        self.assertTrue(os.path.isdir(pasta))          # e não se perdeu
        self.assertFalse(os.path.isdir(
            os.path.join(feedback.HERE, "feedback", "20260820_120000_Colega")),
            "o feedback aterrou na pasta da app de quem o escreveu")

    def test_pendente_da_para_abrir_a_issue_publica(self):
        pasta = self._monta()
        feedback.deliver(pasta, allow_relay=False)
        url = feedback.github_issue_url(pasta)
        self.assertTrue(url.startswith("https://github.com/"), url[:80])
        self.assertIn("issues/new?", url)
        self.assertIn("Feedback", url)

    def test_a_pasta_sincronizada_continua_a_valer_quando_existe(self):
        destino = os.path.join(self.tmp, "partilha")
        os.makedirs(destino, exist_ok=True)
        os.environ["BSP_FEEDBACK_DIR"] = destino
        pasta = self._monta("20260820_130000_Colega")
        self.assertEqual(feedback.deliver(pasta, allow_relay=False), "local")
        self.assertTrue(os.path.isfile(os.path.join(
            destino, "feedback", "20260820_130000_Colega", "feedback.txt")))

    def test_uma_pasta_pendente_nao_se_confunde_com_uma_entregue(self):
        pasta = self._monta("20260820_140000_Colega")
        feedback.deliver(pasta, allow_relay=False)
        # está por tratar: é o que distingue um erro repetido de uma regressão
        self.assertTrue(feedback.delivered_folder_exists("20260820_140000_Colega"))
        self.assertFalse(feedback.delivered_folder_exists("nunca_existiu"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
