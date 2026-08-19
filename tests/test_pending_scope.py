# -*- coding: utf-8 -*-
"""O que o botão Enviar promete tem de ser o que ele escreve.

As alterações locais (✎) de todos os livros vivem no mesmo `overrides.json`, mas
um Push só escreve num livro (ver push_overrides): o número do botão, a lista do
painel e o "descartar" têm de falar todos do mesmo conjunto. Corre offline — os
overrides são semeados em memória, sem tocar no ficheiro nem no Excel.

Também aqui: o arquivo dos concluídos apagados guarda o registo diário do
cronómetro, senão apagar um item mudava horas de um dia para o "sem registo" da
folha de horas.
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import tasks, todos

LIVRO_A = r"C:\livros\A.xlsx"
LIVRO_B = "onedrive:driveXYZ:itemABC"
ABA = "PRJ_CFG1_reworks_julho"


def override_de_coluna(base, valor):
    return {"Status TC": {"base": base, "value": valor}}


class TestAmbitoDosPendentes(unittest.TestCase):
    def setUp(self):
        self._load = tasks.load_overrides
        self._save = tasks.save_overrides
        self._headers = tasks.known_headers
        self._forget = tasks.forget_cache
        self.gravado = None
        tasks.known_headers = lambda *a, **k: []
        tasks.forget_cache = lambda *a, **k: None

    def tearDown(self):
        tasks.load_overrides = self._load
        tasks.save_overrides = self._save
        tasks.known_headers = self._headers
        tasks.forget_cache = self._forget

    def semeia(self, overrides):
        tasks.load_overrides = lambda: dict(overrides)
        def grava(data):
            self.gravado = data
        tasks.save_overrides = grava

    def test_cada_pendente_diz_de_que_livro_e(self):
        self.semeia({
            tasks._wb_key(LIVRO_A, ABA, "usrRoot", "fazer x"): override_de_coluna("", "Done by us"),
            tasks._wb_key(LIVRO_B, ABA, "Multiple", "fazer y"): override_de_coluna("", "Blocked"),
        })
        detalhes = tasks.pending_overrides_summary()
        self.assertEqual({d["book"] for d in detalhes}, {LIVRO_A, LIVRO_B})

    def test_o_numero_do_botao_e_so_o_do_livro_a_enviar(self):
        self.semeia({
            tasks._wb_key(LIVRO_A, ABA, "usrRoot", "x"): override_de_coluna("", "Done by us"),
            tasks._wb_key(LIVRO_A, ABA, "outra", "y"): override_de_coluna("", "Blocked"),
            tasks._wb_key(LIVRO_B, ABA, "Multiple", "z"): override_de_coluna("", "Reviewed"),
        })
        detalhes = tasks.pending_overrides_summary()
        self.assertEqual(len(detalhes), 3)
        self.assertEqual(tasks.pending_for_book(detalhes, LIVRO_A), 2)
        self.assertEqual(tasks.pending_for_book(detalhes, LIVRO_B), 1)
        # sem livro nenhum aberto não há Push que leve nada
        self.assertEqual(tasks.pending_for_book(detalhes, ""), 0)

    def test_o_numero_nao_depende_das_maiusculas_do_caminho(self):
        self.semeia({
            tasks._wb_key(LIVRO_A, ABA, "usrRoot", "x"): override_de_coluna("", "Done by us"),
        })
        detalhes = tasks.pending_overrides_summary()
        self.assertEqual(tasks.pending_for_book(detalhes, LIVRO_A.upper()), 1)

    def test_as_chaves_antigas_sem_livro_vao_em_qualquer_push(self):
        # é o que o push_overrides faz com elas (são de quando só havia um livro)
        self.semeia({
            tasks._legacy_key(ABA, "usrRoot", "x"): override_de_coluna("", "Done by us"),
        })
        detalhes = tasks.pending_overrides_summary()
        self.assertEqual(detalhes[0]["book"], "")
        self.assertEqual(tasks.pending_for_book(detalhes, LIVRO_A), 1)
        self.assertEqual(tasks.pending_for_book(detalhes, LIVRO_B), 1)

    def test_a_categoria_livre_tambem_diz_o_livro(self):
        self.semeia({
            tasks._cellcat_key(LIVRO_B, ABA, 12, 3): {"value": "OK", "base": ""},
        })
        detalhes = tasks.pending_overrides_summary()
        self.assertEqual(detalhes[0]["book"], LIVRO_B)
        self.assertEqual(tasks.pending_for_book(detalhes, LIVRO_B), 1)
        self.assertEqual(tasks.pending_for_book(detalhes, LIVRO_A), 0)

    def test_descartar_so_mexe_no_livro_pedido(self):
        overrides = {
            tasks._wb_key(LIVRO_A, ABA, "usrRoot", "x"): override_de_coluna("", "Done by us"),
            tasks._cellcat_key(LIVRO_A, ABA, 12, 3): {"value": "OK", "base": ""},
            tasks._wb_key(LIVRO_B, ABA, "Multiple", "z"): override_de_coluna("", "Blocked"),
            tasks._legacy_key(ABA, "antiga", "w"): override_de_coluna("", "Reviewed"),
        }
        self.semeia(overrides)
        # o que sobra é lido do que ficou gravado
        restantes = tasks.discard_overrides(LIVRO_A)
        self.assertEqual(list(self.gravado), [tasks._wb_key(LIVRO_B, ABA, "Multiple", "z")])
        # a chave antiga sai com o livro pedido: era isso que o Push lhe faria
        self.assertEqual(restantes, 1)


class TestArquivoGuardaOsDias(unittest.TestCase):
    """O registo diário do cronómetro sobrevive a apagar o item do quadro."""

    def setUp(self):
        self._file = todos.DONE_ARCHIVE_FILE
        self.tmp = tempfile.mkdtemp()
        todos.DONE_ARCHIVE_FILE = os.path.join(self.tmp, "todo_done_archive.json")

    def tearDown(self):
        todos.DONE_ARCHIVE_FILE = self._file
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_o_arquivo_leva_os_segmentos(self):
        item = {"id": "t1", "title": "usrRoot", "done": True,
                "done_at": "2026-08-17T14:03:54", "elapsed_ms": 3600000,
                "segments": [{"d": "2026-08-16", "ms": 1200000},
                             {"d": "2026-08-17", "ms": 2400000}]}
        todos.archive_done_todo(item)
        entrada = todos.load_done_archive()[0]
        self.assertEqual(entrada["segments"],
                         [{"d": "2026-08-16", "ms": 1200000},
                          {"d": "2026-08-17", "ms": 2400000}])
        # e o total continua lá, para o relatório saber o que o item contou
        self.assertEqual(entrada["elapsed_ms"], 3600000)


if __name__ == "__main__":
    unittest.main()
