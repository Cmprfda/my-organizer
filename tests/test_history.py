# -*- coding: utf-8 -*-
"""Histórico das linhas da folha e o relatório que dele sai.

Corre offline: nem Excel, nem COM, nem rede. O ficheiro do histórico é
redirecionado para uma pasta temporária — o history.json real do utilizador
nunca é tocado (é dados dele, como o todo.json ou as notas).
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import history, report, tasks, todos
from cswaios.excel import _RAW_CACHE

LIVRO = "C:/qualquer/livro_de_teste.xlsx"
ABA = "PRJ_CFG1_reworks_julho"


def linha(xlrow, fn, tc="In progress", tp="", obs="", todo="rework"):
    return {"xlrow": xlrow, "fn": fn, "todo": todo,
            "cols": {"Status TC": tc, "Status TP": tp, "OBS": obs,
                     "Function/TC": fn, "To Do": todo}}


class TestHistorico(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = history.HISTORY_FILE
        history.HISTORY_FILE = os.path.join(self.tmp, "history.json")
        history._APP_WRITES.clear()

    def tearDown(self):
        history.HISTORY_FILE = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_primeira_leitura_so_semeia(self):
        """Sem retrato anterior não há alterações: a folha inteira pareceria nova."""
        n = history.record_read(LIVRO, ABA, [linha(2, "FN_A"), linha(3, "FN_B")])
        self.assertEqual(n, 0)
        h = history.sheet_history(LIVRO, ABA)
        self.assertEqual(len(h["rows"]), 2)
        self.assertEqual(h["events"], [])
        # nenhuma foi vista a mudar: a idade que sai daqui é "pelo menos isto"
        self.assertTrue(all(r["estimated"] for r in h["rows"].values()))

    def test_anota_o_que_mudou_coluna_a_coluna(self):
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="In progress")])
        n = history.record_read(LIVRO, ABA,
                                [linha(2, "FN_A", tc="Ready for review", obs="feito")])
        self.assertEqual(n, 2)          # Status TC e OBS
        eventos = history.sheet_history(LIVRO, ABA)["events"]
        mudou = {(e["col"], e["from"], e["to"]) for e in eventos}
        self.assertIn(("Status TC", "In progress", "Ready for review"), mudou)
        self.assertIn(("OBS", "", "feito"), mudou)
        # já foi vista a mudar: a idade passa a ser exata
        self.assertFalse(history.sheet_history(LIVRO, ABA)["rows"]["2"]["estimated"])

    def test_leitura_igual_nao_anota_nada(self):
        rows = [linha(2, "FN_A")]
        history.record_read(LIVRO, ABA, rows)
        self.assertEqual(history.record_read(LIVRO, ABA, rows), 0)
        self.assertEqual(history.sheet_history(LIVRO, ABA)["events"], [])

    def test_escrita_da_app_fica_identificada(self):
        """O Push desta app e alguém a mexer na folha não são a mesma coisa."""
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="In progress")])
        history.mark_app_write(LIVRO, ABA, 2, "Status TC", "Done")
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="Done")])
        self.assertEqual(history.sheet_history(LIVRO, ABA)["events"][0]["via"], "app")

    def test_alteracao_de_fora_fica_identificada(self):
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="In progress")])
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="Done")])
        self.assertEqual(history.sheet_history(LIVRO, ABA)["events"][0]["via"], "sheet")

    def test_marca_de_escrita_nao_serve_para_outro_valor(self):
        """A marca vale para o valor que foi escrito, não para o próximo que vier."""
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="In progress")])
        history.mark_app_write(LIVRO, ABA, 2, "Status TC", "Done")
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="In rework")])
        self.assertEqual(history.sheet_history(LIVRO, ABA)["events"][0]["via"], "sheet")

    def test_linha_inserida_nao_mexe_com_as_outras(self):
        """O retrato é pela identidade da linha: inserir uma linha empurra o
        número de todas as de baixo sem lhes tocar na história."""
        base = [linha(i, f"FN_{i}") for i in range(2, 32)]
        history.record_read(LIVRO, ABA, base)
        # uma delas muda de estado, para deixar de ser uma idade estimada
        mudada = [linha(i, f"FN_{i}", tc="Done" if i == 5 else "In progress")
                  for i in range(2, 32)]
        self.assertEqual(history.record_read(LIVRO, ABA, mudada), 1)
        # linha nova no topo: todas as outras descem uma posição
        empurradas = ([linha(2, "FN_NOVA")]
                      + [linha(i + 1, f"FN_{i}", tc="Done" if i == 5 else "In progress")
                         for i in range(2, 32)])
        self.assertEqual(history.record_read(LIVRO, ABA, empurradas), 0)
        h = history.sheet_history(LIVRO, ABA)
        self.assertEqual(len(h["events"]), 1)      # só a alteração verdadeira
        # a linha que já se viu mudar continua com a idade exata, na posição nova
        self.assertFalse(h["rows"]["6"]["estimated"])
        # a linha inserida é que é nova, e essa sim é uma estimativa
        self.assertTrue(h["rows"]["2"]["estimated"])

    def test_linha_renomeada_nao_perde_o_historico(self):
        """A app escreve o Function/TC: a linha muda de nome mas é a mesma."""
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="In progress")])
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="Done")])
        n = history.record_read(LIVRO, ABA, [linha(2, "FN_A_v2", tc="Done")])
        self.assertEqual(n, 1)                     # só a coluna Function/TC
        h = history.sheet_history(LIVRO, ABA)
        self.assertEqual(h["events"][0]["col"], "Function/TC")
        self.assertEqual(len(h["rows"]), 1)        # não nasceu uma linha nova
        self.assertFalse(h["rows"]["2"]["estimated"])

    def test_retrato_antigo_por_numero_de_linha_e_migrado(self):
        """Quem atualiza a app não volta a "≥ N dias": as entradas antigas já
        guardavam o nome da linha, e é dele que sai a identidade."""
        antigo = {"version": 1, "events": [], "snapshots": {f"{LIVRO}||{ABA}": {
            "seeded": "2026-01-01T00:00:00",
            "rows": {"2": {"fn": "FN_A", "todo": "rework", "changes": 3,
                           "first": "2026-01-01T00:00:00",
                           "changed": "2026-01-02T00:00:00",
                           "cols": {"Status TC": "In progress", "Status TP": "",
                                    "OBS": "", "Function/TC": "FN_A", "To Do": "rework"}}},
        }}}
        with open(history.HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(antigo, f)
        # a mesma linha, agora mais abaixo na folha: continua a ser a mesma
        self.assertEqual(history.record_read(LIVRO, ABA, [linha(7, "FN_A", tc="Done")]), 1)
        h = history.sheet_history(LIVRO, ABA)
        self.assertEqual(list(h["rows"]), ["7"])
        self.assertFalse(h["rows"]["7"]["estimated"])

    def test_poucas_alteracoes_juntas_continuam_a_contar(self):
        """O corte do deslocamento não pode engolir trabalho real: três estados
        mudados na mesma leitura são três alterações, não um deslocamento."""
        base = [linha(i, f"FN_{i}") for i in range(2, 32)]
        history.record_read(LIVRO, ABA, base)
        mudadas = [linha(i, f"FN_{i}", tc="Done" if i < 5 else "In progress")
                   for i in range(2, 32)]
        self.assertEqual(history.record_read(LIVRO, ABA, mudadas), 3)

    def test_muitas_linhas_novas_de_uma_vez_nao_inventam_historia(self):
        """Um nome trocado em muitas linhas ao mesmo tempo (uma coluna colada por
        cima, por exemplo) não se distingue de linhas novas: não se adivinha."""
        base = [linha(i, f"FN_{i}") for i in range(2, 32)]
        history.record_read(LIVRO, ABA, base)
        outras = [linha(i, f"XX_{i}") for i in range(2, 32)]
        self.assertEqual(history.record_read(LIVRO, ABA, outras), 0)
        h = history.sheet_history(LIVRO, ABA)
        self.assertEqual(h["events"], [])
        self.assertTrue(all(r["estimated"] for r in h["rows"].values()))

    def test_linha_apagada_sai_do_retrato(self):
        history.record_read(LIVRO, ABA, [linha(2, "FN_A"), linha(3, "FN_B")])
        history.record_read(LIVRO, ABA, [linha(2, "FN_A")])
        self.assertEqual(sorted(history.sheet_history(LIVRO, ABA)["rows"]), ["2"])

    def test_o_envio_fica_identificado_nos_eventos(self):
        """Cada Push leva uma etiqueta: é o que permite desfazer o envio inteiro
        em vez de célula a célula (ver /api/history/undo)."""
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="In progress"),
                                         linha(3, "FN_B", tc="In progress")])
        history.mark_app_write(LIVRO, ABA, 2, "Status TC", "Done", "p1")
        history.mark_app_write(LIVRO, ABA, 3, "Status TC", "Done", "p1")
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="Done"),
                                         linha(3, "FN_B", tc="Done")])
        h = history.sheet_history(LIVRO, ABA)
        self.assertEqual(h["batches"], {"p1": 2})
        do_lote = history.batch_events("p1")
        self.assertEqual(len(do_lote), 2)
        # o antes e o depois de cada célula, que é o que o desfazer usa
        self.assertEqual({(e["fn"], e["from"], e["to"]) for e in do_lote},
                         {("FN_A", "In progress", "Done"), ("FN_B", "In progress", "Done")})

    def test_alteracao_de_fora_nao_pertence_a_envio_nenhum(self):
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="In progress")])
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="Done")])
        self.assertEqual(history.sheet_history(LIVRO, ABA)["batches"], {})
        self.assertEqual(history.batch_events(""), [])
        self.assertEqual(history.batch_events("p_que_nao_existe"), [])

    def test_eventos_tem_teto(self):
        """O histórico não pode crescer para sempre dentro do ficheiro."""
        history.MAX_EVENTS, teto = 5, history.MAX_EVENTS
        try:
            history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="s0")])
            for i in range(1, 12):
                history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc=f"s{i}")])
            with open(history.HISTORY_FILE, encoding="utf-8") as f:
                guardado = json.load(f)
            self.assertEqual(len(guardado["events"]), 5)
            # os que ficam são os mais recentes
            self.assertEqual(guardado["events"][-1]["to"], "s11")
        finally:
            history.MAX_EVENTS = teto

    def test_livros_diferentes_nao_se_misturam(self):
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="In progress")])
        history.record_read("outro.xlsx", ABA, [linha(2, "FN_A", tc="In progress")])
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="Done")])
        self.assertEqual(len(history.sheet_history(LIVRO, ABA)["events"]), 1)
        self.assertEqual(len(history.sheet_history("outro.xlsx", ABA)["events"]), 0)

    def test_ficheiro_corrompido_nao_rebenta(self):
        with open(history.HISTORY_FILE, "w", encoding="utf-8") as f:
            f.write("{isto nao e json")
        self.assertEqual(history.record_read(LIVRO, ABA, [linha(2, "FN_A")]), 0)
        self.assertEqual(len(history.sheet_history(LIVRO, ABA)["rows"]), 1)


class TestLeituraDaFolhaNaoAnotaDaCache(unittest.TestCase):
    """Com o Excel a bloquear o ficheiro, a app serve a última leitura crua. Essas
    linhas são as MESMAS de propósito: anotá-las outra vez só sujava o histórico
    (e, pior, com a data errada)."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = history.HISTORY_FILE
        history.HISTORY_FILE = os.path.join(self.tmp, "history.json")
        cabecalhos = ["Function/TC", "To Do", "Status TC", "Status TP",
                      "Author TC", "Reviewer TC", "Author TP", "Reviewer TP", "OBS"]
        linhas = [cabecalhos,
                  ["FN_A", "rework", "In progress", "N/A",
                   "Carlos Andrade", "", "", "", "obs"]]
        self.ficheiro = os.path.join(self.tmp, "__nao_existe__", "livro.xlsx")
        _RAW_CACHE[(self.ficheiro, ABA.lower())] = (datetime.now(), ABA, [ABA], linhas)

    def tearDown(self):
        _RAW_CACHE.pop((self.ficheiro, ABA.lower()), None)
        history.HISTORY_FILE = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_nao_escreve_historico(self):
        resultado = tasks.read_sheet(self.ficheiro, ABA, "Carlos Andrade", False)
        self.assertIn("warning", resultado)
        self.assertTrue(resultado["warning"])          # está a servir da cache
        self.assertFalse(os.path.exists(history.HISTORY_FILE))


class TestRelatorio(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real_hist = history.HISTORY_FILE
        self.real_todo = report.load_todo
        self.real_arquivo = report.load_done_archive
        history.HISTORY_FILE = os.path.join(self.tmp, "history.json")
        history._APP_WRITES.clear()
        report.load_done_archive = lambda: []

    def tearDown(self):
        history.HISTORY_FILE = self.real_hist
        report.load_todo = self.real_todo
        report.load_done_archive = self.real_arquivo
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_separa_o_que_eu_fiz_do_que_a_equipa_fez(self):
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="In progress"),
                                         linha(3, "FN_B", tc="In progress")])
        history.mark_app_write(LIVRO, ABA, 2, "Status TC", "Done")
        history.record_read(LIVRO, ABA, [linha(2, "FN_A", tc="Done"),
                                         linha(3, "FN_B", tc="In rework")])
        report.load_todo = lambda: []
        dados = report.build_report(days=7, lang="pt")
        self.assertEqual(len(dados["app_changes"]), 1)
        self.assertEqual(dados["app_changes"][0]["fn"], "FN_A")
        self.assertEqual(dados["team_changes"], 1)
        self.assertIn("FN_A", dados["markdown"])
        self.assertFalse(dados["empty"])

    def test_conta_o_que_se_fechou_na_semana(self):
        agora = datetime.now()
        report.load_todo = lambda: [
            {"id": "a", "title": "Fechado ontem", "done": True, "col": "done",
             "elapsed_ms": 3600000, "jiraLoggedSeconds": 0,
             "done_at": (agora - timedelta(days=1)).isoformat()},
            {"id": "b", "title": "Fechado no mês passado", "done": True, "col": "done",
             "elapsed_ms": 0, "jiraLoggedSeconds": 0,
             "done_at": (agora - timedelta(days=40)).isoformat()},
            {"id": "c", "title": "Sem data de fecho (versão antiga)", "done": True,
             "col": "done", "elapsed_ms": 0, "jiraLoggedSeconds": 0},
            {"id": "d", "title": "Ainda em curso", "done": False, "col": "inprogress",
             "elapsed_ms": 1800000, "jiraLoggedSeconds": 0},
        ]
        dados = report.build_report(days=7, lang="pt")
        self.assertEqual([x["title"] for x in dados["todo_done"]], ["Fechado ontem"])
        self.assertEqual([x["title"] for x in dados["todo_doing"]], ["Ainda em curso"])
        self.assertIn("1h", dados["markdown"])

    def test_soma_o_esforco_por_issue(self):
        report.load_todo = lambda: [
            {"id": "a", "title": "T1", "done": False, "col": "todo", "elapsed_ms": 0,
             "jiraLoggedSeconds": 3600, "jiraIssues": [{"key": "BSP-1", "summary": "x"}]},
            {"id": "b", "title": "T2", "done": False, "col": "todo", "elapsed_ms": 0,
             "jiraLoggedSeconds": 1800, "jiraIssues": [{"key": "BSP-1", "summary": "x"}]},
        ]
        dados = report.build_report(days=7, lang="pt")
        self.assertEqual(dados["jira"], [{"key": "BSP-1", "seconds": 5400}])
        self.assertIn("1h 30m", dados["markdown"])

    def test_relatorio_vazio_continua_a_ser_valido(self):
        report.load_todo = lambda: []
        for lang in ("pt", "en"):
            dados = report.build_report(days=7, lang=lang)
            self.assertTrue(dados["empty"])
            self.assertTrue(dados["markdown"].startswith("#"))


class TestPeriodoEscolhido(unittest.TestCase):
    """Datas escolhidas à mão na vista de métricas (since/until), em vez da
    janela relativa de N dias."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real_hist = history.HISTORY_FILE
        self.real_todo = report.load_todo
        self.real_arquivo = report.load_done_archive
        history.HISTORY_FILE = os.path.join(self.tmp, "history.json")
        report.load_todo = lambda: []
        report.load_done_archive = lambda: []

    def tearDown(self):
        history.HISTORY_FILE = self.real_hist
        report.load_todo = self.real_todo
        report.load_done_archive = self.real_arquivo
        shutil.rmtree(self.tmp, ignore_errors=True)

    def semear(self, *marcas):
        """Escreve eventos com as marcas de tempo pedidas (uma por linha da folha,
        para se distinguirem umas das outras)."""
        eventos = [{"ts": ts, "book": LIVRO, "sheet": ABA, "xlrow": 2 + i,
                    "fn": f"FN_{i}", "todo": "rework", "col": "Status TC",
                    "from": "", "to": "Done", "via": "sheet"}
                   for i, ts in enumerate(marcas)]
        with open(history.HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump({"version": 1, "snapshots": {}, "events": eventos}, f)

    def test_intervalo_inclui_os_dois_dias_inteiros(self):
        self.semear("2026-05-31T23:59:00", "2026-06-01T00:05:00",
                    "2026-06-05T22:30:00", "2026-06-06T00:01:00")
        eventos = history.recent_events(since="2026-06-01", until="2026-06-05")
        self.assertEqual([e["ts"] for e in eventos],
                         ["2026-06-05T22:30:00", "2026-06-01T00:05:00"])

    def test_um_dia_so(self):
        self.semear("2026-06-01T09:00:00", "2026-06-02T09:00:00",
                    "2026-06-03T09:00:00")
        eventos = history.recent_events(since="2026-06-02", until="2026-06-02")
        self.assertEqual([e["ts"] for e in eventos], ["2026-06-02T09:00:00"])

    def test_datas_ao_contrario_valem_o_mesmo_intervalo(self):
        self.semear("2026-06-02T09:00:00")
        self.assertEqual(len(history.recent_events(since="2026-06-05", until="2026-06-01")), 1)

    def test_data_invalida_cai_na_janela_de_dias(self):
        agora = datetime.now()
        self.semear((agora - timedelta(days=2)).isoformat(),
                    (agora - timedelta(days=40)).isoformat())
        eventos = history.recent_events(days=7, since="ontem", until="")
        self.assertEqual(len(eventos), 1)

    def test_relatorio_de_um_intervalo_passado(self):
        self.semear("2026-06-01T09:00:00", "2026-06-30T09:00:00",
                    "2026-07-01T09:00:00")
        dados = report.build_report(since="2026-06-01", until="2026-06-30", lang="pt")
        self.assertEqual(dados["days"], 30)
        self.assertTrue(dados["since"].startswith("2026-06-01T00:00"))
        self.assertTrue(dados["until"].startswith("2026-06-30T23:59"))
        self.assertEqual(dados["team_changes"], 2)
        self.assertIn("01/06", dados["markdown"])

    def test_relatorio_so_conta_o_que_se_fechou_no_intervalo(self):
        self.semear()
        report.load_todo = lambda: [
            {"id": "a", "title": "Fechado no intervalo", "done": True, "col": "done",
             "elapsed_ms": 0, "jiraLoggedSeconds": 0, "done_at": "2026-06-10T11:00:00"},
            {"id": "b", "title": "Fechado depois", "done": True, "col": "done",
             "elapsed_ms": 0, "jiraLoggedSeconds": 0, "done_at": "2026-07-10T11:00:00"},
        ]
        dados = report.build_report(since="2026-06-01", until="2026-06-30", lang="pt")
        self.assertEqual([x["title"] for x in dados["todo_done"]], ["Fechado no intervalo"])


class TestConcluidosApagados(unittest.TestCase):
    """Apagar um item concluído arruma o quadro; não apaga o trabalho do
    relatório do período (feedback de 18/08/2026)."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real_hist = history.HISTORY_FILE
        self.real_todo = report.load_todo
        self.real_arq = todos.DONE_ARCHIVE_FILE
        history.HISTORY_FILE = os.path.join(self.tmp, "history.json")
        todos.DONE_ARCHIVE_FILE = os.path.join(self.tmp, "todo_done_archive.json")
        report.load_todo = lambda: []

    def tearDown(self):
        history.HISTORY_FILE = self.real_hist
        report.load_todo = self.real_todo
        todos.DONE_ARCHIVE_FILE = self.real_arq
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_o_concluido_apagado_continua_a_contar(self):
        agora = datetime.now()
        todos.archive_done_todo(
            {"id": "a", "title": "Fechado e apagado", "done": True, "col": "done",
             "elapsed_ms": 3600000, "jiraLoggedSeconds": 1800,
             "jiraIssues": [{"key": "BSP-9", "summary": "x"}],
             "done_at": (agora - timedelta(days=1)).isoformat()})
        dados = report.build_report(days=7, lang="pt")
        self.assertEqual([x["title"] for x in dados["todo_done"]], ["Fechado e apagado"])
        self.assertEqual(dados["jira"], [{"key": "BSP-9", "seconds": 1800}])

    def test_o_que_esta_no_quadro_nao_aparece_duas_vezes(self):
        agora = datetime.now()
        item = {"id": "a", "title": "Fechado", "done": True, "col": "done",
                "elapsed_ms": 0, "jiraLoggedSeconds": 0,
                "done_at": (agora - timedelta(days=1)).isoformat()}
        todos.archive_done_todo(item)
        report.load_todo = lambda: [dict(item)]
        dados = report.build_report(days=7, lang="pt")
        self.assertEqual(len(dados["todo_done"]), 1)

    def test_por_fazer_e_sem_data_de_fecho_nao_se_arquivam(self):
        todos.archive_done_todo({"id": "a", "title": "Por fazer", "done": False,
                                 "col": "todo"})
        todos.archive_done_todo({"id": "b", "title": "Sem data", "done": True,
                                 "col": "done"})
        self.assertEqual(todos.load_done_archive(), [])

    def test_arquivo_ilegivel_nao_parte_o_relatorio(self):
        with open(todos.DONE_ARCHIVE_FILE, "w", encoding="utf-8") as f:
            f.write("{isto não é json")
        self.assertEqual(todos.load_done_archive(), [])


class TestRelatorioDeUmDia(unittest.TestCase):
    """O botão "O meu dia" pede um período de um dia só — o título do relatório
    acompanha (feedback de 18/08/2026)."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real_hist = history.HISTORY_FILE
        self.real_todo = report.load_todo
        self.real_arquivo = report.load_done_archive
        history.HISTORY_FILE = os.path.join(self.tmp, "history.json")
        report.load_todo = lambda: []
        report.load_done_archive = lambda: []

    def tearDown(self):
        history.HISTORY_FILE = self.real_hist
        report.load_todo = self.real_todo
        report.load_done_archive = self.real_arquivo
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_titulo_do_dia_em_vez_do_da_semana(self):
        dados = report.build_report(since="2026-06-10", until="2026-06-10", lang="pt")
        self.assertEqual(dados["days"], 1)
        self.assertTrue(dados["markdown"].startswith("# O meu dia — 10/06"))
        em_ingles = report.build_report(since="2026-06-10", until="2026-06-10", lang="en")
        self.assertTrue(em_ingles["markdown"].startswith("# My day — 10/06"))

    def test_varios_dias_mantem_o_titulo_do_periodo(self):
        dados = report.build_report(since="2026-06-10", until="2026-06-12", lang="pt")
        self.assertTrue(dados["markdown"].startswith("# O meu período"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
