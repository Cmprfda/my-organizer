# -*- coding: utf-8 -*-
"""O que já está registado no Jira (cswaios/jira.py my_worklogs).

A app só sabia o total que ELA própria tinha registado: um dia registado à mão
no Jira podia voltar a ser oferecido no registo em lote, e registar duas vezes o
mesmo esforço é um problema de auditoria, não um detalhe.

Corre offline: o `_request` é substituído por respostas preparadas — nada aqui
fala com o Jira.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import jira


def _wl(nome, dia, segundos, chave_autor=""):
    autor = {"name": nome}
    if chave_autor:
        autor["key"] = chave_autor
    return {"author": autor, "started": f"{dia}T09:00:00.000+0100",
            "timeSpentSeconds": segundos}


class TestMeusWorklogs(unittest.TestCase):
    def setUp(self):
        self.real = jira._request
        jira._MYSELF = None
        self.pedidos = []

    def tearDown(self):
        jira._request = self.real
        jira._MYSELF = None

    def _responder(self, paginas_por_chave, eu="candrade"):
        """paginas_por_chave: {"BSP-1": [(worklogs, total), ...]}"""
        estado = {}

        def fake(path, method="GET", body=None):
            self.pedidos.append(path)
            if path == "/rest/api/2/myself":
                return {"name": eu, "key": "u-1", "displayName": "Carlos Andrade"}
            chave = path.split("/issue/")[1].split("/")[0]
            n = estado.get(chave, 0)
            estado[chave] = n + 1
            paginas = paginas_por_chave.get(chave, [([], 0)])
            registos, total = paginas[min(n, len(paginas) - 1)]
            return {"worklogs": registos, "total": total}
        jira._request = fake

    # ---------------------------------------------------------------- o basico
    def test_soma_o_meu_tempo_por_issue_e_dia(self):
        self._responder({"BSP-1": [([_wl("candrade", "2026-08-18", 3600),
                                    _wl("candrade", "2026-08-18", 1800)], 2)]})
        out = jira.my_worklogs(["BSP-1"], "2026-08-17", "2026-08-19")
        self.assertEqual(out, {"BSP-1|2026-08-18": 5400})

    def test_o_tempo_de_outra_pessoa_nao_conta(self):
        self._responder({"BSP-1": [([_wl("candrade", "2026-08-18", 3600),
                                     _wl("mribeiro", "2026-08-18", 7200)], 2)]})
        out = jira.my_worklogs(["BSP-1"], "2026-08-17", "2026-08-19")
        self.assertEqual(out, {"BSP-1|2026-08-18": 3600})

    def test_o_autor_e_pela_conta_e_nao_pelo_nome_mostrado(self):
        """Adivinhar pelo displayName dava tempo de outra pessoa como nosso."""
        self._responder({"BSP-1": [([{"author": {"displayName": "Carlos Andrade"},
                                      "started": "2026-08-18T09:00:00.000+0100",
                                      "timeSpentSeconds": 3600}], 1)]})
        self.assertEqual(jira.my_worklogs(["BSP-1"], "2026-08-17", "2026-08-19"), {})

    def test_a_conta_tambem_se_reconhece_pela_key(self):
        self._responder({"BSP-1": [([_wl("outro-nome", "2026-08-18", 3600,
                                         chave_autor="u-1")], 1)]})
        out = jira.my_worklogs(["BSP-1"], "2026-08-17", "2026-08-19")
        self.assertEqual(out, {"BSP-1|2026-08-18": 3600})

    # ---------------------------------------------------------------- limites
    def test_fora_do_intervalo_nao_conta(self):
        self._responder({"BSP-1": [([_wl("candrade", "2026-08-10", 3600),
                                     _wl("candrade", "2026-08-18", 1800),
                                     _wl("candrade", "2026-08-25", 900)], 3)]})
        out = jira.my_worklogs(["BSP-1"], "2026-08-17", "2026-08-19")
        self.assertEqual(out, {"BSP-1|2026-08-18": 1800})

    def test_le_todas_as_paginas(self):
        self._responder({"BSP-1": [
            ([_wl("candrade", "2026-08-18", 3600)] * 200, 400),
            ([_wl("candrade", "2026-08-18", 3600)] * 200, 400),
        ]})
        out = jira.my_worklogs(["BSP-1"], "2026-08-17", "2026-08-19")
        self.assertEqual(out["BSP-1|2026-08-18"], 400 * 3600)

    def test_para_de_pedir_quando_o_total_esta_lido(self):
        self._responder({"BSP-1": [([_wl("candrade", "2026-08-18", 60)], 1)]})
        jira.my_worklogs(["BSP-1"], "2026-08-17", "2026-08-19")
        pedidos_worklog = [p for p in self.pedidos if "worklog" in p]
        self.assertEqual(len(pedidos_worklog), 1)

    def test_demasiadas_issues_e_recusado(self):
        self._responder({})
        chaves = [f"BSP-{n}" for n in range(1, 30)]
        with self.assertRaises(ValueError):
            jira.my_worklogs(chaves, "2026-08-17", "2026-08-19")

    def test_chaves_repetidas_contam_uma_vez(self):
        self._responder({"BSP-1": [([_wl("candrade", "2026-08-18", 60)], 1)]})
        jira.my_worklogs(["BSP-1", "bsp-1", "BSP-1"], "2026-08-17", "2026-08-19")
        self.assertEqual(len([p for p in self.pedidos if "worklog" in p]), 1)

    def test_chave_estragada_e_ignorada_sem_rebentar(self):
        self._responder({"BSP-1": [([_wl("candrade", "2026-08-18", 60)], 1)]})
        out = jira.my_worklogs(["BSP-1", "isto não é uma chave"], "2026-08-01", "2026-08-31")
        self.assertEqual(out, {"BSP-1|2026-08-18": 60})

    def test_issue_sem_registos_nao_aparece(self):
        self._responder({"BSP-9": [([], 0)]})
        self.assertEqual(jira.my_worklogs(["BSP-9"], "2026-08-01", "2026-08-31"), {})

    def test_a_conta_e_pedida_uma_vez_so(self):
        self._responder({"BSP-1": [([], 0)], "BSP-2": [([], 0)]})
        jira.my_worklogs(["BSP-1", "BSP-2"], "2026-08-01", "2026-08-31")
        self.assertEqual(len([p for p in self.pedidos if p.endswith("myself")]), 1)


if __name__ == "__main__":
    unittest.main()
