# -*- coding: utf-8 -*-
"""A bitola, o dia suspeito, a âncora da reunião — e a tabela de rotas.

As três primeiras são contas sobre o que já está gravado. A última é uma
verificação da tabela de rotas: desde a v155 os caminhos são nomes de métodos
num dicionário, e um nome mal escrito lá dentro só se descobre quando alguém
clica (o servidor responde 500 em vez de nunca compilar). Um teste apanha-o
antes de sair da máquina.

Corre offline: pastas temporárias, nada de Excel nem de rede.
"""
import os
import shutil
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import report, server, todos

HORA = 3600 * 1000


def _dia(dias_atras):
    return (date.today() - timedelta(days=dias_atras)).isoformat()


class TestDiaSuspeito(unittest.TestCase):
    def test_um_dia_enorme_e_marcado(self):
        item = {"id": "a", "segments": [{"d": _dia(3), "ms": 13 * HORA}]}
        linhas = [{"id": "a", "day": _dia(3), "ms": 13 * HORA, "title": "x"}]
        saida = report.timesheet_anomalies([item], linhas)
        self.assertIn("big_day", saida[0]["warnings"])

    def test_uma_linha_fora_do_costume_daquele_item(self):
        # o costume do item são 30 min por dia; esta linha traz 4 horas
        item = {"id": "a", "segments": [{"d": _dia(d), "ms": HORA // 2}
                                        for d in range(5, 10)]}
        linhas = [{"id": "a", "day": _dia(3), "ms": 4 * HORA, "title": "x"}]
        saida = report.timesheet_anomalies([item], linhas)
        self.assertIn("unusual", saida[0]["warnings"])
        self.assertEqual(saida[0]["typical_ms"], HORA // 2)

    def test_tres_vezes_dez_minutos_nao_e_um_erro(self):
        item = {"id": "a", "segments": [{"d": _dia(9), "ms": 10 * 60 * 1000}]}
        linhas = [{"id": "a", "day": _dia(3), "ms": 30 * 60 * 1000, "title": "x"}]
        self.assertEqual(report.timesheet_anomalies([item], linhas)[0]["warnings"], [])

    def test_tempo_a_serio_num_domingo_e_para_olhar(self):
        domingo = date(2026, 8, 16)          # domingo
        self.assertEqual(domingo.weekday(), 6)
        linhas = [{"id": "a", "day": domingo.isoformat(), "ms": 3 * HORA, "title": "x"}]
        saida = report.timesheet_anomalies([{"id": "a", "segments": []}], linhas)
        self.assertEqual(saida[0]["warnings"], ["weekend"])

    def test_um_dia_normal_nao_leva_avisos(self):
        item = {"id": "a", "segments": [{"d": _dia(d), "ms": 3 * HORA}
                                        for d in range(5, 10)]}
        linhas = [{"id": "a", "day": _dia(3), "ms": 3 * HORA, "title": "x"}]
        saida = report.timesheet_anomalies([item], linhas)
        self.assertEqual(saida[0]["warnings"], [])
        self.assertEqual(saida[0]["day_ms"], 3 * HORA)


class TestAncoraDaReuniao(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = report.MEETING_FILE
        report.MEETING_FILE = os.path.join(self.tmp, "meeting_anchor.json")

    def tearDown(self):
        report.MEETING_FILE = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_sem_ancora_e_a_primeira_vez(self):
        self.assertEqual(report.meeting_anchor(), "")

    def test_marcar_e_ler_de_volta(self):
        at = report.set_meeting_anchor()
        self.assertEqual(report.meeting_anchor(), at)
        # a âncora dada à mão manda (é o que permite "desde segunda")
        report.set_meeting_anchor("2026-08-10T09:00:00")
        self.assertEqual(report.meeting_anchor(), "2026-08-10T09:00:00")


class TestVoltasDeUmItemQueSeRepete(unittest.TestCase):
    def test_um_item_que_nao_se_repete_nao_tem_voltas(self):
        item = {"id": "a", "occurrences": [{"day": _dia(3), "state": "done"}],
                "segments": [{"d": _dia(3), "ms": HORA}]}
        self.assertIsNone(todos.occurrence_durations(item))

    def test_as_voltas_fechadas_com_tempo_contado_dao_a_mediana(self):
        item = {"id": "a", "repeat": "daily",
                "occurrences": [{"day": _dia(5), "state": "done"},
                                {"day": _dia(4), "state": "done"},
                                {"day": _dia(3), "state": "done"}],
                "segments": [{"d": _dia(5), "ms": HORA},
                             {"d": _dia(4), "ms": 2 * HORA},
                             {"d": _dia(3), "ms": 3 * HORA}]}
        out = todos.occurrence_durations(item)
        self.assertEqual(out["n"], 3)
        self.assertEqual(out["median_ms"], 2 * HORA)
        self.assertEqual(out["max_ms"], 3 * HORA)

    def test_uma_volta_fechada_sem_cronometro_nao_durou_zero(self):
        item = {"id": "a", "repeat": "weekly",
                "occurrences": [{"day": _dia(5), "state": "done"},
                                {"day": _dia(3), "state": "done"}],
                "segments": [{"d": _dia(3), "ms": 2 * HORA}]}
        out = todos.occurrence_durations(item)
        self.assertEqual(out["n"], 1)          # a volta sem tempo fica de fora
        self.assertEqual(out["median_ms"], 2 * HORA)

    def test_as_voltas_falhadas_nao_contam(self):
        item = {"id": "a", "repeat": "daily",
                "occurrences": [{"day": _dia(5), "state": "missed"}],
                "segments": [{"d": _dia(5), "ms": HORA}]}
        self.assertIsNone(todos.occurrence_durations(item))


class TestPalavraDada(unittest.TestCase):
    def test_sem_datas_nao_ha_calibracao(self):
        self.assertEqual(todos.due_accuracy([{"id": "a", "done_at": "2026-08-10 10:00"}]),
                         {"n": 0, "repeats": 0})

    def test_cumpridas_e_atrasadas(self):
        itens = [{"due": "2026-08-10", "done_at": "2026-08-10 17:00"},   # no dia
                 {"due": "2026-08-10", "done_at": "2026-08-08 17:00"},   # antes
                 {"due": "2026-08-10", "done_at": "2026-08-14 17:00"},   # 4 dias
                 {"due": "2026-08-10", "done_at": "2026-08-12 17:00"}]   # 2 dias
        out = todos.due_accuracy(itens)
        self.assertEqual(out["n"], 4)
        self.assertEqual(out["kept"], 2)
        self.assertEqual(out["kept_pct"], 50)
        self.assertEqual(out["median_late_days"], 3)      # 2 e 4
        self.assertEqual(out["weekdays"]["0"], {"n": 4, "late": 2})   # 10/08 é 2ª

    def test_os_que_se_repetem_contam_a_parte(self):
        itens = [{"due": "2026-08-10", "done_at": "2026-08-14 17:00",
                  "repeat": "weekly"},
                 {"due": "2026-08-10", "done_at": "2026-08-10 17:00"}]
        out = todos.due_accuracy(itens)
        self.assertEqual(out["n"], 1)
        self.assertEqual(out["repeats"], 1)
        self.assertEqual(out["kept_pct"], 100)


class TestTabelaDeRotas(unittest.TestCase):
    def test_todos_os_caminhos_apontam_para_um_metodo_que_existe(self):
        for tabela in (server.Handler.GET_ROUTES, server.Handler.POST_ROUTES):
            for caminho, nome in tabela.items():
                self.assertTrue(hasattr(server.Handler, nome),
                                f"{caminho} aponta para {nome}, que não existe")
                self.assertTrue(callable(getattr(server.Handler, nome)))

    def test_nao_ha_dois_caminhos_com_o_mesmo_nome_de_metodo_por_engano(self):
        # dois caminhos podem partilhar um método de propósito; o que isto
        # apanha é o nome copiado e não mudado ao acrescentar uma rota nova
        for tabela in (server.Handler.GET_ROUTES, server.Handler.POST_ROUTES):
            for nome, caminhos in _por_metodo(tabela).items():
                if len(caminhos) > 1:
                    self.assertTrue(all(c.rstrip("/") == caminhos[0].rstrip("/")
                                        for c in caminhos),
                                    f"{nome} serve {caminhos} — é de propósito?")


def _por_metodo(tabela):
    saida = {}
    for caminho, nome in tabela.items():
        saida.setdefault(nome, []).append(caminho)
    return saida


if __name__ == "__main__":
    unittest.main()
