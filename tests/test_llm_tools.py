# -*- coding: utf-8 -*-
"""Ferramentas do motor LLM do assistente.

O motor LLM levava no pedido as primeiras 120 linhas e respondia sobre essa
fatia. Estas ferramentas dão-lhe o resto — a partir do MESMO retrato que o
cliente mandou, nunca da folha. Aqui testam-se as ferramentas em si (o modelo
não é chamado: nenhum destes testes precisa de rede, de chave ou do SDK).
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import chat, chatllm


def contexto(n_linhas=150):
    return chat.normalize_context({
        "person": "Carlos Andrade", "stale_days": 5, "pending": 2,
        "books": [{
            "name": "BSP-G2", "sheet": "reworks", "file": "livro.xlsx", "active": True,
            "statuses": ["In progress", "Done"],
            "rows": [{"fn": f"FN_{i}", "todo": "rework", "xlrow": i + 2,
                      "tc": "Done" if i % 3 == 0 else "In progress",
                      "obs": f"nota {i}", "people": "Carlos Andrade",
                      "mine": i % 2 == 0, "age_days": i,
                      "over": ["Status TC"] if i == 4 else []}
                     for i in range(n_linhas)],
        }],
        "todos": [{"id": "t1", "title": "Fechar CTAD", "col": "inprogress",
                   "priority": "high"}],
        "ccrs": [{"id": "CCR-1", "note": "à espera do build", "ready": True}],
        "notes": [{"id": "n1", "title": "Plano", "folder": "BSP", "text": "texto"}],
    })


class TestFerramentas(unittest.TestCase):
    def setUp(self):
        self.ctx = contexto()

    def test_procura_alcanca_linhas_fora_do_principio(self):
        """O que o retrato de entrada corta é exatamente o que isto vai buscar."""
        self.assertGreater(len(self.ctx["rows"]), chatllm.LLM_ROWS)
        out = chatllm._llm_run_tool("search", {"query": "FN_149"}, self.ctx, "pt")
        self.assertIn("FN_149", out)

    def test_procura_sem_resultados_di_lo(self):
        out = chatllm._llm_run_tool("search", {"query": "não existe nada assim"},
                                 self.ctx, "pt")
        self.assertIn("nada encontrado", out)

    def test_procura_tambem_ve_itens_ccrs_e_notas(self):
        self.assertIn("Por fazer", chatllm._llm_run_tool("search", {"query": "CTAD"},
                                                      self.ctx, "pt"))
        self.assertIn("CCR", chatllm._llm_run_tool("search", {"query": "build"},
                                                self.ctx, "pt"))
        self.assertIn("Nota", chatllm._llm_run_tool("search", {"query": "Plano"},
                                                 self.ctx, "pt"))

    def test_listar_linhas_pagina(self):
        primeira = chatllm._llm_run_tool("list_rows", {"limit": 2}, self.ctx, "pt")
        seguinte = chatllm._llm_run_tool("list_rows", {"offset": 2, "limit": 2},
                                      self.ctx, "pt")
        self.assertIn("FN_0", primeira)
        self.assertNotIn("FN_0 ", seguinte)
        self.assertIn("150 linha(s) no total", primeira)

    def test_listar_linhas_filtra(self):
        so_minhas = chatllm._llm_run_tool("list_rows", {"mine": True, "limit": 3},
                                       self.ctx, "pt")
        self.assertIn("75 linha(s)", so_minhas)
        feitas = chatllm._llm_run_tool("list_rows", {"state": "done", "limit": 1},
                                    self.ctx, "pt")
        self.assertIn("50 linha(s)", feitas)

    def test_listar_linhas_paradas_usa_a_regra_da_app(self):
        paradas = chatllm._llm_run_tool("list_rows", {"stale": True, "limit": 1},
                                     self.ctx, "pt")
        # por fechar e sem mexer há stale_days (5): as 100 em curso menos as de
        # idade 0..4
        self.assertIn("97 linha(s)", paradas)

    def test_posicao_fora_da_lista_nao_rebenta(self):
        out = chatllm._llm_run_tool("list_rows", {"offset": 5000}, self.ctx, "pt")
        self.assertIn("nada a partir da posição 5000", out)

    def test_listar_itens(self):
        self.assertIn("Fechar CTAD", chatllm._llm_run_tool("list_items", {"kind": "todos"},
                                                        self.ctx, "pt"))
        self.assertIn("CCR-1", chatllm._llm_run_tool("list_items", {"kind": "ccrs"},
                                                  self.ctx, "pt"))
        self.assertIn("Plano", chatllm._llm_run_tool("list_items", {"kind": "notes"},
                                                  self.ctx, "pt"))

    def test_contas_sao_as_mesmas_do_motor_local(self):
        das_ferramentas = chatllm._llm_run_tool("counts", {}, self.ctx, "pt")
        do_motor = chat._do_stats("", self.ctx, "pt")["reply"]
        self.assertEqual(das_ferramentas, do_motor)

    def test_teto_por_chamada(self):
        out = chatllm._llm_run_tool("list_rows", {"limit": 999}, self.ctx, "pt")
        self.assertEqual(out.count("\n- "), chatllm.LLM_TOOL_MAX)

    def test_ferramenta_desconhecida_e_um_erro_com_nome(self):
        self.assertIn("desconhecida", chatllm._llm_run_tool("voar", {}, self.ctx, "pt"))

    def test_as_ferramentas_declaradas_tem_o_que_a_api_pede(self):
        for ferramenta in chatllm.LLM_TOOLS:
            self.assertTrue(ferramenta["name"])
            self.assertTrue(ferramenta["description"])
            self.assertEqual(ferramenta["input_schema"]["type"], "object")

    def test_sem_nada_aberto_responde_sem_rebentar(self):
        vazio = chat.normalize_context({})
        for nome in ("counts", "list_items", "list_rows"):
            self.assertTrue(chatllm._llm_run_tool(nome, {"kind": "todos"}, vazio, "pt"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
