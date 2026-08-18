# -*- coding: utf-8 -*-
"""Assistente: reconhecimento das perguntas/ordens e as propostas que devolve.

Corre offline: nem Excel, nem COM, nem rede — o motor do assistente só olha
para o contexto que o cliente manda, e é isso que estes testes lhe dão. O
`chat_config.json` é redirecionado para uma pasta temporária: a configuração
real do utilizador nunca é tocada.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import chat

LIVRO = "C:/qualquer/livro_de_teste.xlsx"
ABA = "PRJ_CFG1_reworks_julho"


def linha(fn, xlrow, tc="In progress", tp="", todo="rework", mine=True,
          over=None, age=None, est=False, obs=""):
    return {"fn": fn, "todo": todo, "xlrow": xlrow, "tc": tc, "tp": tp, "obs": obs,
            "people": "Carlos Andrade", "mine": mine, "over": over or [],
            "age_days": age, "age_est": est,
            "text": " ".join([fn, todo, tc, tp, obs])}


def contexto(rows=None, todos=None, ccrs=None, notes=None, pending=0, stale_days=5):
    return {
        "person": "Carlos Andrade", "stale_days": stale_days, "pending": pending,
        "books": [{"name": "livro_de_teste.xlsx", "sheet": ABA, "file": LIVRO,
                   "active": True, "view": "wb:x",
                   "statuses": ["Ready to start", "In progress", "Done", "N/A"],
                   "rows": rows if rows is not None else [linha("FN_A", 2)]}],
        "todos": todos or [], "ccrs": ccrs or [], "notes": notes or [],
    }


class TestAssistente(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = chat.CHAT_CONFIG_FILE
        chat.CHAT_CONFIG_FILE = os.path.join(self.tmp, "chat_config.json")

    def tearDown(self):
        chat.CHAT_CONFIG_FILE = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    # ---------- perguntas ----------
    def test_pergunta_vazia_nao_procura_nada(self):
        out = chat.answer("   ", contexto())
        self.assertEqual(out["intent"], "empty")
        self.assertIsNone(out["action"])

    def test_sem_contexto_diz_que_nao_tem_nada(self):
        out = chat.answer("as minhas tarefas", {})
        self.assertIn("nada", out["reply"].lower())

    def test_minhas_tarefas_filtra_pela_pessoa(self):
        ctx = contexto([linha("MINHA", 2), linha("DOUTRO", 3, mine=False)])
        out = chat.answer("as minhas tarefas", ctx)
        self.assertEqual(out["intent"], "tasks")
        self.assertEqual([i["title"] for i in out["items"]], ["MINHA"])

    def test_estado_filtra_por_classe_nao_por_texto_exato(self):
        ctx = contexto([linha("A", 2, tc="In progress"),
                        linha("B", 3, tc="Done"),
                        linha("C", 4, tc="Blocked")])
        emcurso = chat.answer("tarefas em curso", ctx)
        self.assertEqual([i["title"] for i in emcurso["items"]], ["A"])
        # "por fechar" é tudo o que não está concluído (as duas vertentes)
        abertas = chat.answer("tarefas por fechar", ctx)
        self.assertEqual({i["title"] for i in abertas["items"]}, {"A", "C"})

    def test_paradas_pedem_historico(self):
        # sem idade nenhuma o assistente diz que ainda não sabe medir
        semhist = chat.answer("tarefas paradas", contexto([linha("A", 2)]))
        self.assertEqual(semhist["intent"], "stale")
        self.assertEqual(semhist["items"], [])
        ctx = contexto([linha("VELHA", 2, age=9), linha("NOVA", 3, age=1),
                        linha("FEITA", 4, tc="Done", age=30)])
        out = chat.answer("tarefas paradas", ctx)
        # as concluídas nunca contam como paradas
        self.assertEqual([i["title"] for i in out["items"]], ["VELHA"])

    def test_pendentes_contam_as_do_servidor_que_nao_estao_a_vista(self):
        ctx = contexto([linha("A", 2, over=["Status TC"])], pending=3)
        out = chat.answer("alterações por enviar", ctx)
        self.assertEqual(out["intent"], "pending")
        self.assertEqual(len(out["items"]), 1)
        self.assertIn("3", out["reply"])

    def test_contagens(self):
        ctx = contexto([linha("A", 2, tc="In progress"), linha("B", 3, tc="Done")],
                       todos=[{"id": "t1", "title": "x", "col": "todo", "done": False},
                              {"id": "t2", "title": "y", "col": "done", "done": True}])
        self.assertEqual(chat.answer("quantas tarefas em curso?", ctx)["intent"], "count")
        self.assertIn("1", chat.answer("quantas tarefas em curso?", ctx)["reply"])
        self.assertIn("2", chat.answer("quantos itens por fazer", ctx)["reply"])

    def test_ccrs_prontas_a_fechar(self):
        ctx = contexto(ccrs=[{"id": "1", "note": "", "ready": True, "closed": False},
                             {"id": "2", "note": "", "ready": False, "closed": False}])
        out = chat.answer("ccrs prontas a fechar", ctx)
        self.assertEqual([i["title"] for i in out["items"]], ["CCR 1"])

    def test_procura_e_a_ultima_rede(self):
        ctx = contexto([linha("FN_ESPECIAL", 2)])
        out = chat.answer("fn_especial", ctx)
        self.assertEqual(out["intent"], "search")
        self.assertEqual([i["title"] for i in out["items"]], ["FN_ESPECIAL"])
        self.assertIsNone(out["action"])

    def test_itens_sabem_para_onde_saltar(self):
        out = chat.answer("as minhas tarefas", contexto([linha("FN_A", 2)]))
        src = out["items"][0]["source"]
        self.assertEqual((src["view"], src["sheet"], src["fn"]), ("wb:x", ABA, "FN_A"))

    # ---------- ordens (propostas) ----------
    def test_ordens_nunca_escrevem_so_propoem(self):
        out = chat.answer("adiciona à lista: rever o TC-42", contexto())
        self.assertEqual(out["action"], {"kind": "todo_add", "title": "rever o TC-42"})
        # a confirmação é o próprio texto mostrado ao utilizador
        self.assertTrue(out["confirm"])

    def test_marcar_feito_encontra_o_item_pelo_titulo(self):
        ctx = contexto(todos=[{"id": "t1", "title": "rever o TC-42", "col": "todo",
                               "done": False}])
        out = chat.answer("marca como feito: rever o TC-42", ctx)
        self.assertEqual(out["action"], {"kind": "todo_done", "id": "t1",
                                         "title": "rever o TC-42"})

    def test_marcar_feito_sem_item_nao_propoe_nada(self):
        out = chat.answer("marca como feito: coisa que nao existe", contexto(todos=[]))
        self.assertIsNone(out["action"])

    def test_estado_usa_o_nome_exato_da_lista_da_aba(self):
        out = chat.answer("estado de FN_A para done", contexto([linha("FN_A", 2)]))
        self.assertEqual(out["action"]["column"], "Status TC")
        self.assertEqual(out["action"]["value"], "Done")     # e não "done"
        self.assertEqual(out["action"]["ref"]["xlrow"], 2)

    def test_estado_tp_e_a_outra_vertente(self):
        out = chat.answer("estado tp de FN_A para in progress", contexto([linha("FN_A", 2)]))
        self.assertEqual(out["action"]["column"], "Status TP")

    def test_linha_ambigua_pede_para_ser_mais_especifico(self):
        ctx = contexto([linha("FN_A", 2, todo="primeiro"), linha("FN_A", 3, todo="segundo")])
        out = chat.answer("estado de FN_A para done", ctx)
        self.assertIsNone(out["action"])
        self.assertEqual(len(out["items"]), 2)

    def test_nota_nao_se_parte_no_hifen_do_nome(self):
        out = chat.answer("nota em TC-42: falhou no run 7", contexto([linha("TC-42", 7)]))
        self.assertEqual(out["action"]["kind"], "note_add")
        self.assertEqual(out["action"]["note"], "falhou no run 7")
        self.assertEqual(out["action"]["ref"]["fn"], "TC-42")

    # ---------- motores ----------
    def test_motor_llm_nao_configurado_cai_no_local_com_aviso(self):
        """Sem SDK/credencial, uma pergunta livre e respondida pelo motor local
        — e diz-se que foi (senao parecia que o LLM tinha respondido)."""
        with open(chat.CHAT_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump({"engine": "llm", "llm": {"api_key": "sk-ant-invalida"}}, f)
        out = chat.answer("em que pe e que isto esta afinal?", contexto())
        self.assertEqual(out["engine"], "local")
        self.assertTrue(out["engine_note"])

    def test_ordens_ficam_no_motor_local_com_o_llm_ligado(self):
        """As escritas nunca passam pelo modelo: e o motor local que devolve a
        acao e a confirmacao, com ou sem LLM configurado (ver LLM_LOCAL_FIRST)."""
        with open(chat.CHAT_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump({"engine": "llm", "llm": {"api_key": "sk-ant-invalida"}}, f)
        out = chat.answer("adiciona a minha lista: rever o TP", contexto())
        self.assertEqual(out["engine"], "local")
        self.assertEqual(out["intent"], "todo_add")
        self.assertEqual(out["action"]["kind"], "todo_add")
        self.assertTrue(out["confirm"])
        # nao houve recurso a motor nenhum: nao e um aviso de falha
        self.assertNotIn("engine_note", out)

    def test_ajuda_descreve_a_app_mesmo_com_o_llm_ligado(self):
        with open(chat.CHAT_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump({"engine": "llm", "llm": {"api_key": "sk-ant-invalida"}}, f)
        out = chat.answer("ajuda", contexto())
        self.assertEqual(out["intent"], "help")
        self.assertNotIn("engine_note", out)

    def test_contexto_do_pedido_ao_modelo_so_leva_o_que_esta_aberto(self):
        """O texto que vai no pedido sai das listas do contexto — e nada mais."""
        ctx = chat.normalize_context(contexto([linha("FN_A", 2, todo="fazer isto")]))
        texto = chat._llm_context_text(ctx, "pt")
        self.assertIn("FN_A", texto)
        self.assertIn("fazer isto", texto)

    def test_contexto_do_cliente_e_cortado(self):
        muitos = [linha(f"FN_{i}", i + 2) for i in range(chat.MAX_ROWS + 50)]
        ctx = chat.normalize_context(contexto(muitos))
        self.assertEqual(len(ctx["rows"]), chat.MAX_ROWS)

    def test_responde_nas_duas_linguas(self):
        pt = chat.answer("ajuda", contexto(), lang="pt")["reply"]
        en = chat.answer("help", contexto(), lang="en")["reply"]
        self.assertIn("Perguntas", pt)
        self.assertIn("Questions", en)


if __name__ == "__main__":
    unittest.main(verbosity=2)
