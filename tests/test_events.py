# -*- coding: utf-8 -*-
"""Avisos do servidor (SSE) e a janela que o assistente tem para o servidor.

Corre offline e não abre servidor nenhum: o que se prova é o comportamento do
distribuidor de avisos (uma fila por janela pendurada, o teto, a janela que não
lê) e o das ferramentas que leem o que o servidor já leu.
"""
import os
import queue
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import events, tasks


class TestDistribuidor(unittest.TestCase):
    def setUp(self):
        events._filas.clear()
        events.set_origin(None)

    def tearDown(self):
        events._filas.clear()
        events.set_origin(None)

    def test_quem_esta_pendurado_recebe_o_aviso(self):
        fila = events.subscribe()
        events.publish("state", file="todo.json")
        evento = fila.get_nowait()
        self.assertEqual(evento["kind"], "state")
        self.assertEqual(evento["file"], "todo.json")
        self.assertIsNone(evento["from"])

    def test_o_aviso_leva_a_janela_que_pediu(self):
        fila = events.subscribe()
        events.set_origin("w123")
        events.publish("state", file="notes.json")
        self.assertEqual(fila.get_nowait()["from"], "w123")

    def test_todas_as_janelas_recebem_a_mesma_coisa(self):
        filas = [events.subscribe() for _ in range(3)]
        events.publish("sheet", file="livro.xlsx")
        seqs = {f.get_nowait()["seq"] for f in filas}
        self.assertEqual(len(seqs), 1)      # é o MESMO evento, não três

    def test_sem_ninguem_pendurado_publicar_nao_falha(self):
        evento = events.publish("state", file="todo.json")
        self.assertEqual(evento["kind"], "state")

    def test_ha_um_teto_de_ouvintes(self):
        for _ in range(events.MAX_OUVINTES):
            self.assertIsNotNone(events.subscribe())
        # cheio: a janela seguinte fica a perguntar, como antes de isto existir
        self.assertIsNone(events.subscribe())
        self.assertEqual(events.listeners(), events.MAX_OUVINTES)

    def test_uma_janela_que_nao_le_nao_enche_a_memoria(self):
        fila = events.subscribe()
        for n in range(events.MAX_FILA + 50):
            events.publish("state", file=f"f{n}.json")
        self.assertLessEqual(fila.qsize(), events.MAX_FILA)
        # o que sobra é o MAIS RECENTE: é o que interessa a quem volta ao ecrã
        ultimos = []
        while True:
            try:
                ultimos.append(fila.get_nowait())
            except queue.Empty:
                break
        self.assertEqual(ultimos[-1]["file"], f"f{events.MAX_FILA + 49}.json")

    def test_deixar_de_ouvir_liberta_o_lugar(self):
        fila = events.subscribe()
        self.assertEqual(events.listeners(), 1)
        events.unsubscribe(fila)
        self.assertEqual(events.listeners(), 0)
        events.unsubscribe(fila)            # duas vezes não parte nada
        self.assertEqual(events.listeners(), 0)

    def test_o_texto_do_evento_e_sse_valido(self):
        texto = events.frame({"seq": 7, "kind": "state", "at": 1, "from": None,
                              "file": "todo.json"})
        self.assertIn("id: 7", texto)
        self.assertIn("event: state", texto)
        self.assertIn('"file": "todo.json"', texto)
        self.assertTrue(texto.endswith("\n\n"))     # o evento fecha com linha vazia
        self.assertTrue(events.ping_frame().startswith(":"))   # comentário, não evento

    def test_a_ligacao_serve_e_sai_quando_o_cliente_fecha(self):
        fila = events.subscribe()
        events.publish("state", file="todo.json")
        escrito = []

        def escreve(data):
            escrito.append(data)
            if len(escrito) >= 3:           # o cliente fechou a ligação
                raise OSError("cliente fechou")

        events.stream(fila, escreve, vivo=lambda: True)
        self.assertTrue(escrito[0].startswith(b"retry:"))
        self.assertIn(b"hello", escrito[1])
        self.assertIn(b"todo.json", escrito[2])
        self.assertEqual(events.listeners(), 0)     # o stream arruma-se ao sair


class TestJanelaDoAssistente(unittest.TestCase):
    """As ferramentas `sheet_rows`/`counts` leem o que o servidor JÁ leu — nunca
    o disco nem a nuvem. Aqui semeia-se o cache à mão, que é o que a leitura de
    uma folha deixa lá."""

    def setUp(self):
        self.antes = dict(tasks._RAW_CACHE)
        tasks._RAW_CACHE.clear()
        from datetime import datetime
        linhas = [
            ["Function/TC", "To Do", "Status TC", "Reviewer"],
            ["FN_A", "rework do vipConfigure", "In progress", "Carlos Andrade"],
            ["FN_B", "limpar os gold files", "Done", "Gustavo Murta"],
            ["FN_C", "trace I1721 em LDRA", "Ready for review", "Carlos Andrade"],
        ]
        tasks._RAW_CACHE[("C:/livros/BSP.xlsx", "aba")] = (
            datetime(2026, 8, 20, 9, 0), "PRJ_CFG1", ["PRJ_CFG1"], linhas)

    def tearDown(self):
        tasks._RAW_CACHE.clear()
        tasks._RAW_CACHE.update(self.antes)

    def test_diz_que_folhas_tem_em_memoria(self):
        livros = tasks.cached_books()
        self.assertEqual(len(livros), 1)
        self.assertEqual(livros[0]["book"], "BSP.xlsx")
        self.assertEqual(livros[0]["sheet"], "PRJ_CFG1")
        self.assertEqual(livros[0]["rows"], 3)      # sem contar o cabeçalho

    def test_le_as_linhas_com_o_nome_de_cada_coluna(self):
        out = tasks.cached_rows(limit=10)
        self.assertEqual(out["total"], 3)
        self.assertEqual(len(out["rows"]), 3)
        primeira = out["rows"][0]
        self.assertEqual(primeira["xlrow"], 2)      # a linha 1 é o cabeçalho
        self.assertIn("Function/TC: FN_A", primeira["text"])
        self.assertIn("Status TC: In progress", primeira["text"])

    def test_procurar_nao_olha_a_acentos_nem_a_maiusculas(self):
        out = tasks.cached_rows(query="LDRA trace")
        self.assertEqual(out["total"], 1)
        self.assertIn("FN_C", out["rows"][0]["text"])

    def test_pagina_se_com_offset_e_diz_quantas_ha(self):
        primeira = tasks.cached_rows(limit=2)
        seguinte = tasks.cached_rows(limit=2, offset=2)
        self.assertEqual(len(primeira["rows"]), 2)
        self.assertEqual(len(seguinte["rows"]), 1)
        self.assertEqual(seguinte["total"], 3)      # o total é o mesmo, não o resto
        self.assertNotEqual(primeira["rows"][0]["xlrow"], seguinte["rows"][0]["xlrow"])

    def test_livro_que_nao_esta_em_memoria_nao_le_o_disco(self):
        out = tasks.cached_rows(book="livro_que_nao_existe")
        self.assertEqual(out["rows"], [])
        self.assertEqual(out["total"], 0)

    def test_a_ferramenta_do_modelo_diz_onde_procurou(self):
        from cswaios import chatllm
        vazio = chatllm._llm_run_tool("sheet_rows", {"query": "nada disto existe"},
                                      {}, "pt")
        self.assertIn("BSP.xlsx", vazio)            # diz que folhas tem em memória
        achou = chatllm._llm_run_tool("sheet_rows", {"query": "gold files"}, {}, "pt")
        self.assertIn("FN_B", achou)
        self.assertIn("L3", achou)                  # com o número da linha na folha


if __name__ == "__main__":
    unittest.main(verbosity=2)
