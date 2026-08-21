# -*- coding: utf-8 -*-
"""Reabrir um concluído que já saiu do quadro (cswaios/todos.py pop_archived).

O arquivo existia desde sempre, mas só o relatório e a exportação o liam: a
única forma de recuperar um item era repor a cópia do dia inteiro. Aqui prova-se
que sai UM item, com o tempo que levava, e que o arquivo deixa de o ter (duas
cópias faziam o relatório contar o mesmo trabalho duas vezes).

Corre offline, com os ficheiros de estado numa pasta temporária.
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import todos


class TestReabrirDoArquivo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = todos.DONE_ARCHIVE_FILE
        todos.DONE_ARCHIVE_FILE = os.path.join(self.tmp, "todo_done_archive.json")

    def tearDown(self):
        todos.DONE_ARCHIVE_FILE = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _arquivar(self, item_id, titulo, ms=3600000):
        todos.archive_done_todo({
            "id": item_id, "title": titulo, "kind": "manual", "done": True,
            "done_at": "2026-08-18T10:00:00", "elapsed_ms": ms,
            "segments": [{"day": "2026-08-18", "ms": ms}],
        })

    def test_sai_o_item_pedido_com_o_tempo_que_levava(self):
        self._arquivar("a1", "regressão do arranque")
        item = todos.pop_archived("a1")
        self.assertIsNotNone(item)
        self.assertEqual(item["title"], "regressão do arranque")
        self.assertEqual(item["elapsed_ms"], 3600000)
        self.assertEqual(item["segments"], [{"day": "2026-08-18", "ms": 3600000}])

    def test_o_arquivo_deixa_de_o_ter(self):
        # ficar nos dois sítios fazia o relatório contar o trabalho duas vezes
        self._arquivar("a1", "x")
        todos.pop_archived("a1")
        self.assertEqual(todos.load_done_archive(), [])

    def test_os_outros_ficam_no_arquivo(self):
        self._arquivar("a1", "um")
        self._arquivar("a2", "dois")
        todos.pop_archived("a1")
        restantes = [x["id"] for x in todos.load_done_archive()]
        self.assertEqual(restantes, ["a2"])

    def test_item_que_nao_existe_responde_none(self):
        self._arquivar("a1", "um")
        self.assertIsNone(todos.pop_archived("nao_existe"))
        self.assertEqual(len(todos.load_done_archive()), 1)

    def test_id_vazio_responde_none_sem_mexer_no_arquivo(self):
        self._arquivar("a1", "um")
        self.assertIsNone(todos.pop_archived(""))
        self.assertIsNone(todos.pop_archived(None))
        self.assertEqual(len(todos.load_done_archive()), 1)

    def test_reabrir_duas_vezes_o_mesmo_nao_duplica_nada(self):
        self._arquivar("a1", "um")
        self.assertIsNotNone(todos.pop_archived("a1"))
        self.assertIsNone(todos.pop_archived("a1"))

    def test_arquivo_vazio_nao_rebenta(self):
        self.assertIsNone(todos.pop_archived("a1"))

    # --------------------------------------------------------- a identidade
    def test_o_item_volta_ligado_a_origem_e_com_o_que_tinha(self):
        """Voltar sem a origem era voltar desligado do sítio onde nasceu — e o
        "ver item original" não se recuperava depois."""
        todos.archive_done_todo({
            "id": "b1", "title": "rever o TC-42", "kind": "task", "done": True,
            "done_at": "2026-08-18T10:00:00", "elapsed_ms": 60000,
            "ref": {"sheet": "BSP-G2", "fn": "FN_07", "todo": "rework"},
            "detail": "falta a evidência do passo 3",
            "subtasks": [{"id": "s1", "title": "correr o script", "done": True}],
            "priority": "high",
            "links": [{"kind": "ccr", "ref": "1234"}],
        })
        item = todos.pop_archived("b1")
        self.assertEqual(item["kind"], "task")
        self.assertTrue(item["ref"], "a linha de origem tem de voltar com o item")
        self.assertEqual(item["ref"]["fn"], "FN_07")
        self.assertEqual(item["detail"], "falta a evidência do passo 3")
        self.assertEqual(len(item["subtasks"]), 1)
        self.assertEqual(item["priority"], "high")
        self.assertEqual(len(item["links"]), 1)

    def test_reaberto_fica_por_fazer_e_nao_concluido(self):
        """A coluna não se guarda: trazê-la de volta punha o item outra vez como
        feito, porque o normalize_todo_item lê o `done` da coluna."""
        todos.archive_done_todo({
            "id": "b2", "title": "x", "kind": "manual", "done": True,
            "done_at": "2026-08-18T10:00:00", "col": "done", "elapsed_ms": 0,
        })
        item = todos.pop_archived("b2")
        self.assertNotIn("col", item)
        # o servidor limpa o `done` antes de normalizar (ver reopen_archived)
        item["done"] = False
        item.pop("done_at", None)
        normalizado = todos.normalize_todo_item(item)
        self.assertFalse(normalizado["done"])
        self.assertEqual(normalizado["col"], "todo")

    def test_o_relatorio_continua_a_ler_o_arquivo_como_antes(self):
        # os campos novos são acrescentados, nunca substituem os que já lá estavam
        todos.archive_done_todo({
            "id": "b3", "title": "y", "kind": "manual", "done": True,
            "done_at": "2026-08-18T10:00:00", "elapsed_ms": 120000,
            "segments": [{"day": "2026-08-18", "ms": 120000}],
        })
        entrada = todos.load_done_archive()[0]
        for campo in ("id", "title", "kind", "elapsed_ms", "segments", "done_at",
                      "done", "due", "repeat", "created", "jiraLoggedSeconds",
                      "jiraIssues"):
            self.assertIn(campo, entrada, f"o {campo} deixou de ser guardado")


if __name__ == "__main__":
    unittest.main()
