# -*- coding: utf-8 -*-
"""O registo que só se apanha na hora: esperas resolvidas e datas cumpridas.

Duas contas da app precisam de dados que antes eram apagados no momento em que
aconteciam — uma espera levantada saía do `waiting.json` sem deixar rasto, e um
item arquivado perdia a data-limite que tinha. Aqui prova-se que ficam
gravados, porque nenhum dos dois se recupera depois.

Corre offline: pastas temporárias, nada de Excel, de rede ou de ficheiros do
utilizador.
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import store, todos


class TestRegistoDasEsperas(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = store.WAITING_LOG_FILE
        store.WAITING_LOG_FILE = os.path.join(self.tmp, "waiting_log.json")

    def tearDown(self):
        store.WAITING_LOG_FILE = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_sem_registo_a_lista_e_vazia(self):
        self.assertEqual(store.load_waiting_log(), [])
        self.assertEqual(store.waiting_stats(), [])

    def test_uma_espera_levantada_fica_gravada(self):
        store.log_waiting_closed("livro||aba||fn||todo",
                                 {"who": "Rui", "since": "2026-08-10"})
        registo = store.load_waiting_log()
        self.assertEqual(len(registo), 1)
        self.assertEqual(registo[0]["who"], "Rui")
        self.assertEqual(registo[0]["since"], "2026-08-10")
        self.assertTrue(registo[0]["cleared_at"])

    def test_uma_marca_sem_nome_nao_e_uma_espera(self):
        store.log_waiting_closed("k", {"since": "2026-08-10"})
        store.log_waiting_closed("k", None)
        self.assertEqual(store.load_waiting_log(), [])

    def test_a_mediana_por_pessoa_conta_os_dias_ate_ser_levantada(self):
        for desde, ate in (("2026-08-01", "2026-08-03 09:00"),
                           ("2026-08-04", "2026-08-09 09:00"),
                           ("2026-08-10", "2026-08-14 09:00")):
            store.write_json(store.WAITING_LOG_FILE,
                             store.load_waiting_log()
                             + [{"who": "Rui", "since": desde, "cleared_at": ate}])
        stats = store.waiting_stats()
        self.assertEqual(len(stats), 1)
        self.assertEqual(stats[0]["who"], "Rui")
        self.assertEqual(stats[0]["n"], 3)
        self.assertEqual(stats[0]["median_days"], 4.0)   # 2, 4, 5
        self.assertEqual(stats[0]["max_days"], 5)

    def test_a_mesma_pessoa_escrita_de_duas_maneiras_e_uma_pessoa(self):
        store.write_json(store.WAITING_LOG_FILE,
                         [{"who": "Rui", "since": "2026-08-01",
                           "cleared_at": "2026-08-02 10:00"},
                          {"who": "rui", "since": "2026-08-03",
                           "cleared_at": "2026-08-05 10:00"}])
        stats = store.waiting_stats()
        self.assertEqual(len(stats), 1)
        self.assertEqual(stats[0]["n"], 2)

    def test_datas_estragadas_nao_entram_na_conta(self):
        store.write_json(store.WAITING_LOG_FILE,
                         [{"who": "Ana", "since": "", "cleared_at": "2026-08-02"},
                          {"who": "Ana", "since": "2026-08-05",
                           "cleared_at": "2026-08-01"},   # levantada antes de existir
                          {"who": "Ana", "since": "2026-08-01",
                           "cleared_at": "2026-08-04 08:00"}])
        stats = store.waiting_stats()
        self.assertEqual(stats[0]["n"], 1)
        self.assertEqual(stats[0]["median_days"], 3.0)

    def test_o_registo_nao_cresce_para_sempre(self):
        store.write_json(store.WAITING_LOG_FILE,
                         [{"who": "Ana", "since": "2026-08-01",
                           "cleared_at": "2026-08-02"}] * store.WAITING_LOG_MAX)
        store.log_waiting_closed("k", {"who": "Zé", "since": "2026-08-01"})
        registo = store.load_waiting_log()
        self.assertEqual(len(registo), store.WAITING_LOG_MAX)
        self.assertEqual(registo[-1]["who"], "Zé")


class TestArquivoGuardaAData(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = todos.DONE_ARCHIVE_FILE
        todos.DONE_ARCHIVE_FILE = os.path.join(self.tmp, "todo_done_archive.json")

    def tearDown(self):
        todos.DONE_ARCHIVE_FILE = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_a_data_limite_e_a_repeticao_vao_com_o_item(self):
        todos.archive_done_todo({"id": "t1", "title": "x", "done": True,
                                 "done_at": "2026-08-18 17:30",
                                 "due": "2026-08-20", "repeat": "weekly",
                                 "created": "10/08 09:00"})
        arquivo = todos.load_done_archive()
        self.assertEqual(arquivo[0]["due"], "2026-08-20")
        self.assertEqual(arquivo[0]["repeat"], "weekly")
        self.assertEqual(arquivo[0]["created"], "10/08 09:00")

    def test_item_sem_data_fica_com_a_data_vazia_e_nao_estraga(self):
        todos.archive_done_todo({"id": "t2", "title": "y", "done": True,
                                 "done_at": "2026-08-18 17:30",
                                 "due": "amanhã", "repeat": "sempre"})
        arquivo = todos.load_done_archive()
        self.assertEqual(arquivo[0]["due"], "")
        self.assertEqual(arquivo[0]["repeat"], "")


if __name__ == "__main__":
    unittest.main()
