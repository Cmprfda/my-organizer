# -*- coding: utf-8 -*-
"""Gravação do estado local: atómica, com cópias e com trinco.

Corre offline e nunca toca no estado do utilizador: tudo se passa numa pasta
temporária (as cópias ficam ao lado do ficheiro, ver backup_file).
"""
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import statefile


class TestGravacaoAtomica(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.ficheiro = os.path.join(self.tmp, "todo.json")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_grava_e_le(self):
        statefile.write_json(self.ficheiro, [{"id": "a"}])
        self.assertEqual(statefile.read_json(self.ficheiro), [{"id": "a"}])

    def test_nao_deixa_temporarios_atras(self):
        statefile.write_json(self.ficheiro, {"x": 1})
        self.assertEqual([n for n in os.listdir(self.tmp) if n.endswith(".tmp")], [])

    def test_ficheiro_ilegivel_devolve_o_valor_de_recurso(self):
        with open(self.ficheiro, "w", encoding="utf-8") as f:
            f.write("{isto não é json")
        self.assertEqual(statefile.read_json(self.ficheiro, []), [])

    def test_o_ficheiro_antigo_sobrevive_a_uma_gravacao_falhada(self):
        statefile.write_json(self.ficheiro, {"bom": True})
        # um objeto que o json não sabe escrever: a gravação parte a meio
        with self.assertRaises(TypeError):
            statefile.write_json(self.ficheiro, {"mau": object()})
        self.assertEqual(statefile.read_json(self.ficheiro), {"bom": True})

    def test_uma_copia_por_dia(self):
        statefile.write_json(self.ficheiro, {"v": 1})       # não há nada a copiar ainda
        statefile.write_json(self.ficheiro, {"v": 2})       # copia o {"v": 1}
        statefile.write_json(self.ficheiro, {"v": 3})       # já há a cópia de hoje
        copias = sorted(os.listdir(os.path.join(self.tmp, "backups")))
        self.assertEqual(len(copias), 1)
        with open(os.path.join(self.tmp, "backups", copias[0]), encoding="utf-8") as f:
            self.assertEqual(json.load(f), {"v": 1})

    def test_guardar_agora_acrescenta_outra_copia(self):
        statefile.write_json(self.ficheiro, {"v": 1})
        statefile.write_json(self.ficheiro, {"v": 2})
        statefile.backup_file(self.ficheiro, force=True)
        self.assertEqual(len(os.listdir(os.path.join(self.tmp, "backups"))), 2)

    def test_o_trinco_e_o_mesmo_para_o_mesmo_ficheiro(self):
        self.assertIs(statefile.lock_for(self.ficheiro),
                      statefile.lock_for(os.path.join(self.tmp, ".", "todo.json")))
        self.assertIsNot(statefile.lock_for(self.ficheiro),
                         statefile.lock_for(os.path.join(self.tmp, "notes.json")))

    def test_gravacoes_ao_mesmo_tempo_nao_partem_o_ficheiro(self):
        """Vários pedidos a gravar em paralelo: o ficheiro fica sempre legível."""
        erros = []

        def grava(n):
            try:
                for _ in range(20):
                    statefile.write_json(self.ficheiro, [{"id": f"t{n}"} for _ in range(50)])
                    if statefile.read_json(self.ficheiro) is None:
                        erros.append("ficheiro ilegível a meio")
            except Exception as exc:                        # pragma: no cover
                erros.append(repr(exc))

        fios = [threading.Thread(target=grava, args=(i,)) for i in range(4)]
        [f.start() for f in fios]
        [f.join() for f in fios]
        self.assertEqual(erros, [])
        self.assertEqual(len(statefile.read_json(self.ficheiro)), 50)


class TestReporUmaCopia(unittest.TestCase):
    """Repor uma cópia é uma coisa séria: só ficheiros de estado conhecidos, e o
    que estava em vigor não se perde."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real_here = statefile.HERE
        self.real_dir = statefile.BACKUP_DIR
        statefile.HERE = self.tmp
        statefile.BACKUP_DIR = os.path.join(self.tmp, "backups")
        self.ficheiro = os.path.join(self.tmp, "todo.json")

    def tearDown(self):
        statefile.HERE = self.real_here
        statefile.BACKUP_DIR = self.real_dir
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_repor_volta_ao_conteudo_antigo(self):
        statefile.write_json(self.ficheiro, [{"id": "antigo"}])
        statefile.write_json(self.ficheiro, [{"id": "novo"}])      # gera a cópia
        copia = [b for b in statefile.list_backups() if b["target"] == "todo.json"][0]
        feito = statefile.restore_backup(copia["file"])
        self.assertEqual(feito["target"], "todo.json")
        self.assertEqual(statefile.read_json(self.ficheiro), [{"id": "antigo"}])
        # o que estava em vigor foi guardado antes da troca: dá para desfazer
        self.assertGreaterEqual(len(statefile.list_backups()), 2)

    def test_nome_de_fora_e_recusado(self):
        for nome in ("graph_token.20260819.json", "../todo.20260819.json",
                     "todo.json", "seja_o_que_for"):
            with self.assertRaises(ValueError):
                statefile.restore_backup(nome)

    def test_copia_que_nao_existe_e_recusada(self):
        with self.assertRaises(ValueError):
            statefile.restore_backup("todo.20200101.json")

    def test_lista_diz_a_que_ficheiro_pertence_cada_copia(self):
        statefile.write_json(self.ficheiro, {"v": 1})
        statefile.write_json(self.ficheiro, {"v": 2})
        alvos = {b["target"] for b in statefile.list_backups()}
        self.assertEqual(alvos, {"todo.json"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
