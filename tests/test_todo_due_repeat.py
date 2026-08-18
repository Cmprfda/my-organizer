# -*- coding: utf-8 -*-
"""Data-limite, repetição e registo diário do cronómetro dos itens do TODO.

Corre offline: nada de Excel, de rede ou de ficheiros do utilizador — só as
funções de cswaios.todos sobre dicionários feitos aqui.
"""
import os
import sys
import unittest
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios.todos import (add_timer_segments, merge_segments, next_due,
                           normalize_due, normalize_repeat, normalize_todo_item,
                           spawn_repeat, split_by_day, stop_todo_timer,
                           timer_ms_in_period)

HOJE = date.today()


def ms_do_dia(dia, hora, minuto=0):
    """Instante (ms) de um dia/hora local — o cronómetro fala em ms locais."""
    return int(datetime(dia.year, dia.month, dia.day, hora, minuto).timestamp() * 1000)


class TestData(unittest.TestCase):
    def test_so_aceita_datas_com_forma_de_dia(self):
        self.assertEqual(normalize_due("2026-08-18"), "2026-08-18")
        self.assertEqual(normalize_due("18/08/2026"), "")
        self.assertEqual(normalize_due(None), "")

    def test_repeticao_invalida_e_como_nao_repetir(self):
        self.assertEqual(normalize_repeat("WEEKLY"), "weekly")
        self.assertEqual(normalize_repeat("de vez em quando"), "")

    def test_item_antigo_fica_sem_data_e_sem_repeticao(self):
        out = normalize_todo_item({"id": "t1", "title": "x", "col": "todo"})
        self.assertNotIn("due", out)
        self.assertNotIn("repeat", out)
        self.assertNotIn("segments", out)

    def test_data_e_repeticao_estragadas_sao_deitadas_fora(self):
        out = normalize_todo_item({"id": "t1", "title": "x", "col": "todo",
                                   "due": "amanhã", "repeat": "sempre"})
        self.assertNotIn("due", out)
        self.assertNotIn("repeat", out)


class TestProximaData(unittest.TestCase):
    def test_anda_sempre_para_a_frente_de_hoje(self):
        """Um item semanal esquecido três semanas dá a PRÓXIMA, não três em atraso."""
        atrasado = (HOJE - timedelta(days=21)).isoformat()
        seguinte = next_due(atrasado, "weekly")
        self.assertGreater(date.fromisoformat(seguinte), HOJE)
        self.assertLessEqual((date.fromisoformat(seguinte) - HOJE).days, 7)

    def test_dias_uteis_nunca_caem_ao_fim_de_semana(self):
        for salto in range(0, 7):
            base = (HOJE + timedelta(days=salto)).isoformat()
            seguinte = date.fromisoformat(next_due(base, "weekdays"))
            self.assertLess(seguinte.weekday(), 5, seguinte)

    def test_mensal_mantem_o_dia_do_mes_do_original(self):
        seguinte = next_due("2026-01-31", "monthly", today=date(2026, 2, 15))
        self.assertEqual(seguinte, "2026-02-28")     # fevereiro não tem 31
        depois = next_due("2026-01-31", "monthly", today=date(2026, 3, 1))
        self.assertEqual(depois, "2026-03-31")       # e março volta ao 31

    def test_sem_repeticao_nao_ha_data_seguinte(self):
        self.assertEqual(next_due("2026-08-18", ""), "")


class TestRepetir(unittest.TestCase):
    def base(self):
        return {"id": "t1", "title": "Ver o nightly", "kind": "manual",
                "col": "done", "done": True, "repeat": "daily",
                "priority": "high", "detail": "ver o Jenkins",
                "elapsed_ms": 900000, "segments": [{"d": HOJE.isoformat(), "ms": 900000}],
                "subtasks": [{"id": "s1", "title": "abrir o job", "done": True}]}

    def test_fechar_faz_nascer_o_seguinte_limpo(self):
        todos = []
        item = self.base()
        todos.append(item)
        novo = spawn_repeat(todos, item)
        self.assertIsNotNone(novo)
        self.assertEqual(novo["title"], item["title"])
        self.assertEqual(novo["col"], "todo")
        self.assertFalse(novo["done"])
        self.assertEqual(novo["elapsed_ms"], 0)
        self.assertNotIn("segments", novo)
        self.assertEqual(novo["priority"], "high")
        self.assertEqual([s["done"] for s in novo["subtasks"]], [False])
        self.assertIn(novo, todos)

    def test_o_fechado_deixa_de_repetir(self):
        """Senão marcá-lo outra vez (ou reabri-lo e fechá-lo) fazia nascer um terceiro."""
        todos = []
        item = self.base()
        todos.append(item)
        spawn_repeat(todos, item)
        self.assertNotIn("repeat", item)
        self.assertIsNone(spawn_repeat(todos, item))
        self.assertEqual(len(todos), 2)

    def test_item_por_fechar_nao_repete(self):
        item = self.base()
        item["done"] = False
        item["col"] = "todo"
        self.assertIsNone(spawn_repeat([item], item))


class TestRegistoDiario(unittest.TestCase):
    def test_intervalo_dentro_do_mesmo_dia(self):
        ontem = HOJE - timedelta(days=1)
        pedacos = split_by_day(ms_do_dia(ontem, 9), ms_do_dia(ontem, 11))
        self.assertEqual(pedacos, [{"d": ontem.isoformat(), "ms": 2 * 3600 * 1000}])

    def test_cronometro_esquecido_a_noite_reparte_se_pelos_dois_dias(self):
        ontem = HOJE - timedelta(days=1)
        pedacos = split_by_day(ms_do_dia(ontem, 23), ms_do_dia(HOJE, 1))
        self.assertEqual([p["d"] for p in pedacos], [ontem.isoformat(), HOJE.isoformat()])
        self.assertEqual([p["ms"] for p in pedacos], [3600 * 1000, 3600 * 1000])

    def test_o_mesmo_dia_fica_numa_entrada_so_e_por_ordem(self):
        junto = merge_segments([{"d": "2026-08-18", "ms": 60},
                                {"d": "2026-08-17", "ms": 30},
                                {"d": "2026-08-18", "ms": 40}])
        self.assertEqual(junto, [{"d": "2026-08-17", "ms": 30},
                                 {"d": "2026-08-18", "ms": 60 + 40}])

    def test_parar_o_cronometro_escreve_o_total_e_o_dia(self):
        ontem = HOJE - timedelta(days=1)
        item = {"elapsed_ms": 0, "timer_started": ms_do_dia(ontem, 14)}
        stop_todo_timer(item, ms_do_dia(ontem, 15))
        self.assertEqual(item["elapsed_ms"], 3600 * 1000)
        self.assertEqual(item["segments"], [{"d": ontem.isoformat(), "ms": 3600 * 1000}])
        self.assertIsNone(item["timer_started"])

    def test_o_total_e_a_soma_dos_dias(self):
        item = {"elapsed_ms": 0, "timer_started": None}
        ontem = HOJE - timedelta(days=1)
        add_timer_segments(item, ms_do_dia(ontem, 9), ms_do_dia(ontem, 10))
        add_timer_segments(item, ms_do_dia(HOJE, 9), ms_do_dia(HOJE, 11))
        self.assertEqual(sum(s["ms"] for s in item["segments"]), 3 * 3600 * 1000)

    def test_tempo_do_periodo_ignora_o_que_esta_fora(self):
        item = {"segments": [{"d": "2026-08-10", "ms": 1000},
                             {"d": "2026-08-17", "ms": 2000},
                             {"d": "2026-08-20", "ms": 4000}]}
        self.assertEqual(timer_ms_in_period(item, "2026-08-15", "2026-08-18"), 2000)
        self.assertEqual(timer_ms_in_period(item), 7000)

    def test_item_sem_registo_nao_inventa_tempo_no_periodo(self):
        """Itens anteriores a esta versão só têm o total: não se sabe de que dia é."""
        self.assertEqual(timer_ms_in_period({"elapsed_ms": 999999}, "2026-08-01"), 0)


if __name__ == "__main__":
    unittest.main()
