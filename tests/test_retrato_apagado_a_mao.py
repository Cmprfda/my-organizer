# -*- coding: utf-8 -*-
"""O retrato da última leitura, quando o ficheiro desaparece por fora.

O `save_last_read` compara a impressão digital em memória para não reler o
`last_read.json` inteiro a cada pedido. Só que apagar esse ficheiro à mão é um
passo de recuperação que a app documenta — e um mapa em memória a dizer "isso já
está gravado" sobre um ficheiro que já não existe deixava o arranque sem rede sem
retrato nenhum até o conteúdo da folha mudar.

Corre offline, com o ficheiro numa pasta temporária.
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import tasks

CHAVE = ("C:/livros/x.xlsx", "BSP-G2", "Carlos", False, "pt")


def _leitura(digest="abc12345"):
    return {"rows": [["a", "b"]], "digest": digest, "sheet": "BSP-G2",
            "headers": ["Function/TC", "Status TC"]}


class TestRetratoApagadoAMao(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = tasks.LAST_READ_FILE
        tasks.LAST_READ_FILE = os.path.join(self.tmp, "last_read.json")
        tasks._LAST_READ_DIGESTS = (None, None, {})

    def tearDown(self):
        tasks.LAST_READ_FILE = self.real
        tasks._LAST_READ_DIGESTS = (None, None, {})
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_leitura_igual_nao_reescreve_o_ficheiro(self):
        """O ponto da poupança: o caso normal não toca no disco."""
        tasks.save_last_read(CHAVE, _leitura())
        antes = os.stat(tasks.LAST_READ_FILE).st_mtime_ns
        tasks.save_last_read(CHAVE, _leitura())
        self.assertEqual(os.stat(tasks.LAST_READ_FILE).st_mtime_ns, antes)

    def test_apagado_a_mao_volta_a_ser_gravado(self):
        tasks.save_last_read(CHAVE, _leitura())
        self.assertIsNotNone(tasks.load_last_read(CHAVE))
        os.remove(tasks.LAST_READ_FILE)          # o passo de recuperação
        # a leitura seguinte é igual à anterior: o mapa em memória dizia que já
        # estava gravado, e o retrato ficava por gravar
        tasks.save_last_read(CHAVE, _leitura())
        self.assertTrue(os.path.isfile(tasks.LAST_READ_FILE))
        self.assertIsNotNone(tasks.load_last_read(CHAVE))

    def test_ficheiro_trocado_por_fora_e_relido(self):
        """Outra instância (ou uma reposição de cópia) mexeu no ficheiro."""
        tasks.save_last_read(CHAVE, _leitura())
        with open(tasks.LAST_READ_FILE, "w", encoding="utf-8") as f:
            f.write("{}")                        # reposição que o esvaziou
        tasks.save_last_read(CHAVE, _leitura())
        self.assertIsNotNone(tasks.load_last_read(CHAVE))

    def test_conteudo_novo_grava_como_sempre(self):
        tasks.save_last_read(CHAVE, _leitura("aaa"))
        tasks.save_last_read(CHAVE, _leitura("bbb"))
        self.assertEqual(tasks.load_last_read(CHAVE)["digest"], "bbb")

    def test_esquecer_limpa_o_mapa(self):
        tasks.save_last_read(CHAVE, _leitura())
        tasks.forget_last_read()
        self.assertIsNone(tasks.load_last_read(CHAVE))
        # e o retrato seguinte volta a ser gravado, com a mesma leitura
        tasks.save_last_read(CHAVE, _leitura())
        self.assertIsNotNone(tasks.load_last_read(CHAVE))


if __name__ == "__main__":
    unittest.main()
