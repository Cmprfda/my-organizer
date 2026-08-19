# -*- coding: utf-8 -*-
"""Repetição pelo calendário e recomeço do cronómetro.

Dois casos que a versão anterior tratava mal:

- um item que se repete andava ao ritmo de quem o fechava (um item diário três
  dias por fazer dava UMA ocorrência seguinte, não três);
- recomeçar o tempo contado de um item apagava o registo diário e a folha de
  horas perdia dias já trabalhados.

Corre offline: nada aqui abre Excel nem toca no estado do utilizador.
"""
import os
import shutil
import sys
import tempfile
import unittest
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import todos


def item(**kw):
    base = {"id": "t1", "title": "Correr os testes", "done": False, "col": "todo",
            "elapsed_ms": 0, "timer_started": None}
    base.update(kw)
    return base


class TestRepeticaoPeloCalendario(unittest.TestCase):
    def test_item_diario_por_fazer_ha_tres_dias(self):
        hoje = date(2026, 8, 19)
        lista = [item(due="2026-08-16", repeat="daily")]
        self.assertEqual(todos.catch_up_repeats(lista, hoje), 1)
        # a data passa a ser a ocorrência de hoje...
        self.assertEqual(lista[0]["due"], "2026-08-19")
        # ... e as que passaram ficam contadas, para a interface o poder dizer
        self.assertEqual(lista[0]["missed"], 3)

    def test_nao_nascem_copias(self):
        lista = [item(due="2026-08-01", repeat="daily")]
        todos.catch_up_repeats(lista, date(2026, 8, 19))
        self.assertEqual(len(lista), 1)

    def test_item_em_dia_fica_quieto(self):
        hoje = date(2026, 8, 19)
        lista = [item(due="2026-08-19", repeat="daily"),
                 item(due="2026-08-25", repeat="weekly")]
        self.assertEqual(todos.catch_up_repeats(lista, hoje), 0)
        self.assertNotIn("missed", lista[0])

    def test_dias_uteis_nao_contam_o_fim_de_semana(self):
        # 14/08/2026 é sexta; 19/08 é quarta. Ocorrências: 17, 18, 19 (3)
        lista = [item(due="2026-08-14", repeat="weekdays")]
        todos.catch_up_repeats(lista, date(2026, 8, 19))
        self.assertEqual(lista[0]["due"], "2026-08-19")
        self.assertEqual(lista[0]["missed"], 3)

    def test_ao_sabado_a_ocorrencia_certa_e_a_de_sexta(self):
        # 22/08/2026 é sábado: a última ocorrência vencida é a de sexta, 21
        lista = [item(due="2026-08-19", repeat="weekdays")]
        todos.catch_up_repeats(lista, date(2026, 8, 22))
        self.assertEqual(lista[0]["due"], "2026-08-21")

    def test_mensal_mantem_o_dia_do_mes(self):
        lista = [item(due="2026-05-31", repeat="monthly")]
        todos.catch_up_repeats(lista, date(2026, 8, 19))
        # 30/06, 31/07 já passaram; 31/08 ainda não
        self.assertEqual(lista[0]["due"], "2026-07-31")
        self.assertEqual(lista[0]["missed"], 2)

    def test_sem_repeticao_ou_sem_data_nao_se_mexe(self):
        lista = [item(due="2026-08-01"), item(repeat="daily")]
        self.assertEqual(todos.catch_up_repeats(lista, date(2026, 8, 19)), 0)
        self.assertEqual(lista[0]["due"], "2026-08-01")

    def test_item_fechado_nao_se_mexe(self):
        lista = [item(due="2026-08-01", repeat="daily", done=True, col="done")]
        self.assertEqual(todos.catch_up_repeats(lista, date(2026, 8, 19)), 0)

    def test_as_falhadas_acumulam_entre_leituras(self):
        lista = [item(due="2026-08-17", repeat="daily")]
        todos.catch_up_repeats(lista, date(2026, 8, 18))
        todos.catch_up_repeats(lista, date(2026, 8, 19))
        self.assertEqual(lista[0]["due"], "2026-08-19")
        self.assertEqual(lista[0]["missed"], 2)

    def test_fechar_o_item_da_a_ocorrencia_seguinte_em_dia(self):
        amanha = (date.today() + timedelta(days=1)).isoformat()
        alvo = item(due=date.today().isoformat(), repeat="daily", done=True,
                    col="done", missed=3)
        lista = [alvo]
        novo = todos.spawn_repeat(lista, alvo)
        self.assertIsNotNone(novo)
        self.assertEqual(novo["due"], amanha)
        self.assertNotIn("missed", novo)      # a nova nasce em dia
        self.assertNotIn("missed", alvo)      # e o fechado deixa de cobrar

    def test_o_normalize_nao_guarda_falhadas_num_item_feito(self):
        limpo = todos.normalize_todo_item(item(done=True, col="done", missed=2))
        self.assertNotIn("missed", limpo)
        vivo = todos.normalize_todo_item(item(missed=2, due="2026-08-19", repeat="daily"))
        self.assertEqual(vivo["missed"], 2)


class TestRecomecarOCronometro(unittest.TestCase):
    def test_o_registo_diario_sobrevive(self):
        alvo = item(col="inprogress", elapsed_ms=3600000, jiraLoggedFromTimerMs=600000,
                    segments=[{"d": "2026-08-18", "ms": 1200000},
                              {"d": "2026-08-19", "ms": 2400000}])
        todos.restart_todo_timer(alvo, now_ms=1_755_000_000_000)
        self.assertEqual(alvo["elapsed_ms"], 0)
        self.assertEqual(alvo["jiraLoggedFromTimerMs"], 0)
        # a folha de horas é sobre os DIAS: aquelas horas foram trabalhadas
        self.assertEqual(len(alvo["segments"]), 2)
        self.assertTrue(alvo["restarted_at"])
        # em curso, o cronómetro volta a contar já
        self.assertEqual(alvo["timer_started"], 1_755_000_000_000)

    def test_fora_de_em_curso_nao_recomeca_a_contar(self):
        alvo = item(col="todo", elapsed_ms=1000)
        todos.restart_todo_timer(alvo)
        self.assertIsNone(alvo["timer_started"])

    def test_o_relatorio_continua_a_ver_os_dias(self):
        """O que este recomeço não pode fazer é passar horas trabalhadas para
        "não se sabe quando" (ver build_report)."""
        alvo = item(elapsed_ms=3600000, segments=[{"d": "2026-08-18", "ms": 3600000}])
        todos.restart_todo_timer(alvo)
        self.assertEqual(todos.timer_ms_in_period(alvo, "2026-08-18", "2026-08-18"),
                         3600000)


class TestOsItensGravadosSaoOsLidos(unittest.TestCase):
    """A leitura da lista põe as repetições em dia e regrava (load_todo)."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = todos.TODO_FILE
        todos.TODO_FILE = os.path.join(self.tmp, "todo.json")

    def tearDown(self):
        todos.TODO_FILE = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_ler_a_lista_poe_as_repeticoes_em_dia(self):
        antiga = (date.today() - timedelta(days=3)).isoformat()
        todos.save_todo([item(due=antiga, repeat="daily")])
        lidos = todos.load_todo()
        self.assertEqual(lidos[0]["due"], date.today().isoformat())
        self.assertEqual(lidos[0]["missed"], 3)
        # e ficou gravado: a leitura seguinte não volta a contar as mesmas
        self.assertEqual(todos.load_todo()[0]["missed"], 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
