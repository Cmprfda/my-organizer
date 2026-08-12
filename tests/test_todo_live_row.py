# -*- coding: utf-8 -*-
"""A linha ao vivo que o cartão do TODO mostra (row_meta["cur"]) e a ligação
entre um item e a linha de onde veio, quando o "To Do" é maior do que o corte
dos 200 caracteres. Corre offline: nem Excel, nem COM, nem rede — a leitura crua
é semeada no _RAW_CACHE e o read_sheet serve-se dela (é o mesmo caminho de
quando o Excel tem o ficheiro bloqueado).
"""
import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import tasks
from cswaios.excel import _RAW_CACHE
from cswaios.text import normalize
from cswaios.todos import row_key_text, sync_todo_review_from_tasks

FICHEIRO = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "__nao_existe__", "livro_de_teste.xlsx")
ABA = "PRJ_CFG1_reworks_julho"
LONGO = ("meter global fp: _func_rtnet_config_hook = NULL em todos os TCs "
         "excepto nos testes de RTNET. " * 4)     # bem mais de 200 caracteres

CABECALHOS = ["Function/TC", "To Do", "Status TC", "Status TP",
              "Author TC", "Reviewer TC", "Author TP", "Reviewer TP", "OBS"]
LINHAS = [
    ["Multiple", "Close manual tests CCRs", "N/A", "In progress",
     "N/A", "N/A", "Carlos Andrade", "", "CTAD v0.7"],
    ["usrRoot", LONGO, "N/A", "Ready for review",
     "N/A", "N/A", "Carlos Andrade", "Rui Morais", ""],
]


def semeia_folha():
    """Põe a leitura crua em cache e devolve o que o read_sheet fez dela."""
    _RAW_CACHE[(FICHEIRO, normalize(ABA))] = (
        datetime.now(), ABA, [ABA], [list(CABECALHOS)] + [list(r) for r in LINHAS])
    return tasks.read_sheet(FICHEIRO, ABA, "Carlos Andrade", False)


class TestLinhaAoVivo(unittest.TestCase):
    def setUp(self):
        _RAW_CACHE.clear()
        self._overrides = tasks.load_overrides
        self._notes = tasks.load_notes
        self._save = tasks.save_overrides
        tasks.load_overrides = lambda: {}
        tasks.load_notes = lambda: {}
        tasks.save_overrides = lambda data: None

    def tearDown(self):
        tasks.load_overrides = self._overrides
        tasks.load_notes = self._notes
        tasks.save_overrides = self._save
        _RAW_CACHE.clear()

    def test_cur_traz_as_colunas_do_tracker(self):
        data = semeia_folha()
        self.assertNotIn("error", data)
        cur = data["row_meta"][0]["cur"]
        self.assertEqual(cur["Function/TC"], "Multiple")
        self.assertEqual(cur["To Do"], "Close manual tests CCRs")
        self.assertEqual(cur["Status TP"], "In progress")
        self.assertEqual(cur["OBS"], "CTAD v0.7")
        # só as colunas fixas do tracker (o resto da linha já vai em `orig`)
        self.assertEqual(set(cur), set(tasks.TRACKER_COLS))

    def test_cur_leva_a_alteracao_local_e_orig_fica_com_a_folha(self):
        chave = "%s||%s||Multiple||Close manual tests CCRs" % (FICHEIRO, ABA)
        tasks.load_overrides = lambda: {
            chave: {"Status TP": {"base": "In progress", "value": "Done by us"}}}
        meta = semeia_folha()["row_meta"][0]
        self.assertEqual(meta["cur"]["Status TP"], "Done by us")
        self.assertEqual(meta["orig"]["Status TP"], "In progress")

    def test_chave_da_linha_corta_como_o_ref_do_item(self):
        meta = semeia_folha()["row_meta"][1]
        self.assertGreater(len(meta["todo"]), 200)
        # é este o valor que o item guarda (normalize_ref corta a 200)
        self.assertEqual(row_key_text(meta["todo"]), meta["todo"].strip()[:200].strip())

    def test_item_com_to_do_longo_ainda_muda_de_coluna(self):
        """O "Ready for review" da linha tem de mover o item para Review mesmo
        com o "To Do" cortado no item (era aqui que a sincronização falhava)."""
        row_meta = semeia_folha()["row_meta"]
        item = {"id": "t1", "title": "usrRoot", "kind": "task", "col": "todo",
                "done": False, "ref": {"sheet": ABA, "fn": "usrRoot",
                                       "todo": LONGO.strip()[:200]}}
        self.assertTrue(sync_todo_review_from_tasks([item], row_meta, ABA))
        self.assertEqual(item["col"], "review")


if __name__ == "__main__":
    unittest.main()
