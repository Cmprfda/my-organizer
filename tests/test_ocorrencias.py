# -*- coding: utf-8 -*-
"""O registo das ocorrências de um item que se repete.

O `missed` dizia QUANTAS ocorrências passaram sem o item ser fechado, e nada
mais: quatro falhas podiam ser um mês irregular ou uma semana de férias. Aqui
prova-se o registo dia a dia — o que se fechou, o que passou em claro, e que a
história acompanha a corrente quando nasce a ocorrência seguinte.
"""
import os
import sys
import unittest
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import todos


class TestRegistoDasOcorrencias(unittest.TestCase):
    def test_as_ocorrencias_que_passaram_ficam_com_o_dia(self):
        hoje = date(2026, 8, 20)
        item = {"id": "t1", "title": "diário", "col": "todo", "done": False,
                "repeat": "daily", "due": "2026-08-17"}
        mexidos = todos.catch_up_repeats([item], today=hoje)
        self.assertEqual(mexidos, 1)
        self.assertEqual(item["due"], "2026-08-20")
        self.assertEqual(item["missed"], 3)
        # e agora sabe-se QUAIS: 17, 18 e 19 passaram em claro
        self.assertEqual([o["day"] for o in item["occurrences"]],
                         ["2026-08-17", "2026-08-18", "2026-08-19"])
        self.assertTrue(all(o["state"] == "missed" for o in item["occurrences"]))

    def test_um_item_em_dia_nao_ganha_registo_nenhum(self):
        item = {"id": "t1", "title": "diário", "col": "todo", "done": False,
                "repeat": "daily", "due": "2026-08-20"}
        self.assertEqual(todos.catch_up_repeats([item], today=date(2026, 8, 20)), 0)
        self.assertNotIn("occurrences", item)

    def test_fechar_um_item_passa_a_historia_para_o_seguinte(self):
        item = {"id": "t1", "title": "diário", "col": "done", "done": True,
                "repeat": "daily", "due": "2026-08-19",
                "occurrences": [{"day": "2026-08-18", "state": "missed"}]}
        lista = [item]
        novo = todos.spawn_repeat(lista, item)
        self.assertIsNotNone(novo)
        # a corrente é do trabalho, não do item: a nova leva o registo inteiro
        self.assertEqual([(o["day"], o["state"]) for o in novo["occurrences"]],
                         [("2026-08-18", "missed"), ("2026-08-19", "done")])
        # o item fechado guarda o mesmo registo (é o que ele fez)
        self.assertEqual(len(item["occurrences"]), 2)
        # e deixa de repetir: quem repete agora é o novo
        self.assertNotIn("repeat", item)
        self.assertNotIn("missed", item)

    def test_uma_corrente_longa_nao_cresce_sem_fim(self):
        inicio = date(2026, 1, 1)
        occs = [{"day": (inicio + timedelta(days=n)).isoformat(), "state": "done"}
                for n in range(200)]
        item = {"id": "t1", "title": "diário", "col": "done", "done": True,
                "repeat": "daily", "due": "2026-07-20", "occurrences": occs}
        novo = todos.spawn_repeat([item], item)
        self.assertEqual(len(novo["occurrences"]), todos.OCCURRENCES_KEEP)
        # ficam as mais RECENTES: é sobre elas que se pergunta "como tem corrido"
        self.assertEqual(novo["occurrences"][-1]["day"], "2026-07-20")

    def test_o_normalizador_recusa_o_que_nao_presta(self):
        item = todos.normalize_todo_item({
            "id": "t1", "title": "x", "col": "todo",
            "occurrences": [
                {"day": "2026-08-01", "state": "done"},
                {"day": "não é data", "state": "done"},
                {"day": "2026-08-02", "state": "seja o que for"},
                "isto não é um dicionário",
                {"day": "2026-08-01", "state": "missed"},   # o mesmo dia outra vez
            ]})
        # uma entrada por dia (a última manda) e só as que prestam
        self.assertEqual([(o["day"], o["state"]) for o in item["occurrences"]],
                         [("2026-08-01", "missed")])

    def test_um_item_sem_ocorrencias_nao_ganha_o_campo(self):
        item = todos.normalize_todo_item({"id": "t1", "title": "x", "col": "todo"})
        self.assertNotIn("occurrences", item)
        vazio = todos.normalize_todo_item({"id": "t2", "title": "x", "col": "todo",
                                          "occurrences": []})
        self.assertNotIn("occurrences", vazio)

    def test_uma_semana_de_ferias_le_se_no_registo(self):
        """O caso que motivou isto: um item diário que passou uma semana sem ser
        fechado e voltou. O total de falhas é o mesmo de antes; a diferença é
        poder dizer em que dias foi."""
        item = {"id": "t1", "title": "diário", "col": "todo", "done": False,
                "repeat": "daily", "due": "2026-08-10",
                "occurrences": [{"day": "2026-08-09", "state": "done"}]}
        todos.catch_up_repeats([item], today=date(2026, 8, 17))
        dias = {o["day"]: o["state"] for o in item["occurrences"]}
        self.assertEqual(dias["2026-08-09"], "done")
        self.assertEqual(sum(1 for v in dias.values() if v == "missed"), 7)
        self.assertEqual(item["missed"], 7)


if __name__ == "__main__":
    unittest.main(verbosity=2)
