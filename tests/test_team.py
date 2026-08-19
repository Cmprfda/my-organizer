# -*- coding: utf-8 -*-
"""Esperas partilhadas com a equipa (cswaios/team.py).

Corre offline: a "pasta partilhada" é uma pasta temporária, e nada aqui toca no
OneDrive nem no estado do utilizador.
"""
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import statefile, team, updates


class TestPartilhaDasEsperas(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.partilha = os.path.join(self.tmp, "releases")
        os.makedirs(self.partilha, exist_ok=True)
        self.real_find = updates.find_releases_dir
        self.real_cfg = team.TEAM_CONFIG_FILE
        updates.find_releases_dir = lambda: self.partilha
        team.TEAM_CONFIG_FILE = os.path.join(self.tmp, "team_config.json")

    def tearDown(self):
        updates.find_releases_dir = self.real_find
        team.TEAM_CONFIG_FILE = self.real_cfg
        shutil.rmtree(self.tmp, ignore_errors=True)

    def esperas(self):
        return {"livro.xlsx||reworks||FN_A||rework":
                {"who": "Nuno", "since": "2026-08-15", "until": "2026-08-20"}}

    def publica_de(self, pessoa, marcas, quando=None):
        """Escreve o ficheiro de outra pessoa na partilha, à mão."""
        pasta = os.path.join(self.partilha, team.TEAM_SUBDIR)
        os.makedirs(pasta, exist_ok=True)
        quando = quando or datetime.now().strftime("%Y-%m-%d %H:%M")
        statefile.write_json(os.path.join(pasta, f"waiting-{team._slug(pessoa)}.json"),
                             {"person": pessoa, "updated": quando, "waiting": marcas},
                             backup=False)

    # ---------------------------------------------------------------- publicar
    def test_desligada_nada_sai_da_maquina(self):
        self.assertFalse(team.load_team_config()["share_waiting"])
        self.assertIsNone(team.publish_waiting("Carlos Andrade", self.esperas()))
        self.assertFalse(os.path.isdir(os.path.join(self.partilha, team.TEAM_SUBDIR)))

    def test_ligada_publica_um_ficheiro_por_pessoa(self):
        team.save_team_config(True)
        destino = team.publish_waiting("Carlos Andrade", self.esperas())
        self.assertTrue(destino and os.path.isfile(destino))
        self.assertEqual(os.path.basename(destino), "waiting-carlos-andrade.json")

    def test_a_chave_publicada_nao_leva_o_livro(self):
        """O caminho do ficheiro é diferente em cada máquina: sem ele na chave, a
        linha é reconhecida por todos."""
        team.save_team_config(True)
        destino = team.publish_waiting("Carlos Andrade", self.esperas())
        marcas = statefile.read_json(destino)["waiting"]
        self.assertEqual(list(marcas), ["reworks||FN_A||rework"])

    def test_sem_nome_nao_se_publica(self):
        team.save_team_config(True)
        self.assertIsNone(team.publish_waiting("", self.esperas()))

    def test_desligar_apaga_a_minha_publicacao(self):
        team.save_team_config(True)
        destino = team.publish_waiting("Carlos Andrade", self.esperas())
        team.save_team_config(False)
        self.assertTrue(team.unpublish_waiting("Carlos Andrade"))
        self.assertFalse(os.path.isfile(destino))

    def test_marcas_vazias_publicam_uma_lista_vazia(self):
        """Deixar de esperar tem de chegar à equipa, não ficar a marca antiga."""
        team.save_team_config(True)
        team.publish_waiting("Carlos Andrade", self.esperas())
        destino = team.publish_waiting("Carlos Andrade", {})
        self.assertEqual(statefile.read_json(destino)["waiting"], {})

    # ------------------------------------------------------------------- ler
    def test_le_as_esperas_dos_outros(self):
        self.publica_de("Nuno Silva", {"reworks||FN_B||rework":
                                       {"who": "Gustavo", "since": "2026-08-18"}})
        lidas = team.load_team_waiting("Carlos Andrade")
        self.assertEqual(lidas["reworks||FN_B||rework"]["who"], "Gustavo")
        self.assertEqual(lidas["reworks||FN_B||rework"]["by"], "Nuno Silva")

    def test_as_minhas_nao_voltam_a_entrar(self):
        self.publica_de("Carlos Andrade", {"reworks||FN_C||x": {"who": "Nuno"}})
        self.assertEqual(team.load_team_waiting("Carlos Andrade"), {})
        # sem excluir ninguém, aparecem (é o que a linha de comandos veria)
        self.assertEqual(len(team.load_team_waiting("")), 1)

    def test_instalacao_parada_deixa_de_cobrar(self):
        velho = (datetime.now() - timedelta(days=team.TEAM_TTL_DAYS + 1)).strftime("%Y-%m-%d %H:%M")
        self.publica_de("Nuno Silva", {"reworks||FN_D||x": {"who": "Gustavo"}}, quando=velho)
        self.assertEqual(team.load_team_waiting("Carlos Andrade"), {})

    def test_duas_pessoas_na_mesma_linha_fica_a_mais_recente(self):
        chave = "reworks||FN_E||x"
        self.publica_de("Ana", {chave: {"who": "Gustavo"}}, quando="2026-08-18 09:00")
        self.publica_de("Nuno", {chave: {"who": "Mariana"}},
                        quando=datetime.now().strftime("%Y-%m-%d %H:%M"))
        lidas = team.load_team_waiting("Carlos Andrade")
        self.assertEqual(lidas[chave]["who"], "Mariana")
        self.assertEqual(lidas[chave]["by"], "Nuno")

    def test_ficheiro_estragado_na_partilha_nao_parte_a_leitura(self):
        pasta = os.path.join(self.partilha, team.TEAM_SUBDIR)
        os.makedirs(pasta, exist_ok=True)
        with open(os.path.join(pasta, "waiting-zzz.json"), "w", encoding="utf-8") as f:
            f.write("{isto não é json")
        self.publica_de("Nuno", {"reworks||FN_F||x": {"who": "Gustavo"}})
        self.assertEqual(len(team.load_team_waiting("Carlos Andrade")), 1)

    def test_sem_pasta_partilhada_a_app_funciona_como_sempre(self):
        updates.find_releases_dir = lambda: None
        self.assertIsNone(team.team_dir())
        self.assertEqual(team.load_team_waiting("Carlos Andrade"), {})
        team.save_team_config(True)
        self.assertIsNone(team.publish_waiting("Carlos Andrade", self.esperas()))


if __name__ == "__main__":
    unittest.main(verbosity=2)
