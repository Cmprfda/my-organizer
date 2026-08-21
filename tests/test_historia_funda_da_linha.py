# -*- coding: utf-8 -*-
"""A história de UMA linha, pedida pela identidade dela (sheet_history com
`fn`/`todo`) — o "ver mais atrás" da caixa da tarefa.

A caixa só via a janela dos 30 dias e dizia "a primeira alteração foi...".
quando o que sabia era "a primeira que cabe na janela". Aqui prova-se que o
pedido por identidade traz a linha certa, e só a linha certa: o número da linha
muda de mês para mês na folha, a identidade não.

Corre offline, com o `history.json` numa pasta temporária.
"""
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import history

LIVRO = "livro1"
ABA = "Sheet1"


def _ts(dias_atras, hora=9):
    quando = datetime.now() - timedelta(days=dias_atras)
    return quando.replace(hour=hora, minute=0, second=0, microsecond=0).isoformat()


def _evento(ts, fn, todo, xlrow, para="Done"):
    return {"ts": ts, "book": LIVRO, "sheet": ABA, "xlrow": xlrow,
            "fn": fn, "todo": todo, "col": "Status TC",
            "from": "", "to": para, "via": "sheet",
            "ident": f"{fn}||{todo}"}


class TestHistoriaDeUmaLinha(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = history.HISTORY_FILE
        history.HISTORY_FILE = os.path.join(self.tmp, "history.json")
        history._ARCHIVE_CACHE.clear()

    def tearDown(self):
        history.HISTORY_FILE = self.real
        history._ARCHIVE_CACHE.clear()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _gravar(self, eventos):
        with history._lock:
            data = history._empty()
            data["events"] = eventos
            history._save(data)

    def test_sem_identidade_vem_a_folha_toda(self):
        self._gravar([_evento(_ts(3), "fn_a", "rework", 10),
                      _evento(_ts(2), "fn_b", "review", 11)])
        out = history.sheet_history(LIVRO, ABA, days=60)
        self.assertEqual(len(out["events"]), 2)

    def test_com_identidade_vem_so_essa_linha(self):
        self._gravar([_evento(_ts(3), "fn_a", "rework", 10),
                      _evento(_ts(2), "fn_b", "review", 11)])
        out = history.sheet_history(LIVRO, ABA, days=60, fn="fn_a", todo="rework")
        self.assertEqual(len(out["events"]), 1)
        self.assertEqual(out["events"][0]["fn"], "fn_a")

    def test_a_linha_e_reconhecida_mesmo_tendo_mudado_de_numero(self):
        """É o ponto todo: no arquivo de outro mês a mesma linha estava noutro
        número, e pedir por xlrow perdia-a."""
        self._gravar([_evento(_ts(40), "fn_a", "rework", 7),
                      _evento(_ts(3), "fn_a", "rework", 10)])
        out = history.sheet_history(LIVRO, ABA, days=60, fn="fn_a", todo="rework")
        self.assertEqual(len(out["events"]), 2)
        self.assertEqual({e["xlrow"] for e in out["events"]}, {7, 10})

    def test_acentos_e_maiusculas_nao_estorvam(self):
        self._gravar([_evento(_ts(3), "Função A", "Rework", 10)])
        out = history.sheet_history(LIVRO, ABA, days=60, fn="funcao a", todo="rework")
        self.assertEqual(len(out["events"]), 1)

    def test_to_do_vazio_distingue_se_de_um_preenchido(self):
        self._gravar([_evento(_ts(3), "fn_a", "", 10),
                      _evento(_ts(2), "fn_a", "rework", 11)])
        out = history.sheet_history(LIVRO, ABA, days=60, fn="fn_a", todo="")
        self.assertEqual(len(out["events"]), 1)
        self.assertEqual(out["events"][0]["xlrow"], 10)

    def test_a_janela_curta_continua_a_cortar(self):
        # o filtro por identidade não passa por cima do período pedido
        self._gravar([_evento(_ts(40), "fn_a", "rework", 7),
                      _evento(_ts(3), "fn_a", "rework", 10)])
        out = history.sheet_history(LIVRO, ABA, days=30, fn="fn_a", todo="rework")
        self.assertEqual(len(out["events"]), 1)

    def test_linha_sem_historia_responde_vazio_sem_rebentar(self):
        self._gravar([_evento(_ts(3), "fn_a", "rework", 10)])
        out = history.sheet_history(LIVRO, ABA, days=60, fn="nao_existe", todo="x")
        self.assertEqual(out["events"], [])
        self.assertIn("rows", out)

    def test_as_linhas_paradas_continuam_a_vir_todas(self):
        """O `rows` (idades das linhas) é da folha, não da linha pedida: a caixa
        continua a precisar dele para a idade, e o resto da app também."""
        self._gravar([_evento(_ts(3), "fn_a", "rework", 10),
                      _evento(_ts(2), "fn_b", "review", 11)])
        completo = history.sheet_history(LIVRO, ABA, days=60)
        so_uma = history.sheet_history(LIVRO, ABA, days=60, fn="fn_a", todo="rework")
        self.assertEqual(so_uma["rows"], completo["rows"])


if __name__ == "__main__":
    unittest.main()
