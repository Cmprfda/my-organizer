# -*- coding: utf-8 -*-
"""As esperas em que o cobrado sou EU (cswaios/team.py team_waiting_on) e o
teste de nome partilhado (cswaios/text.py person_matcher).

Corre offline: a "pasta partilhada" é uma pasta temporária e nada aqui toca no
OneDrive nem no estado de quem usa a app.
"""
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import statefile, team, updates
from cswaios.text import person_matcher


class TestTesteDeNome(unittest.TestCase):
    """O mesmo teste que as colunas da folha usam, agora partilhado."""

    def test_o_nome_todo_dentro_da_celula(self):
        sou_eu = person_matcher("Carlos Andrade")
        self.assertTrue(sou_eu("Carlos Andrade"))
        self.assertTrue(sou_eu("rev: Carlos Andrade (V&V)"))

    def test_so_um_dos_nomes(self):
        # a folha escreve "Mariana" num sítio e "Mariana Ribeiro" noutro
        self.assertTrue(person_matcher("Mariana Ribeiro")("Mariana"))
        self.assertTrue(person_matcher("Carlos Andrade")("andrade"))

    def test_nome_curto_nao_conta_como_um_dos_nomes(self):
        # menos de 4 letras dava falsos positivos por todo o lado
        self.assertFalse(person_matcher("Ana Paula Silva")("Ana"))

    def test_acentos_e_maiusculas_nao_estorvam(self):
        self.assertTrue(person_matcher("Inês Gonçalves")("INES GONCALVES"))

    def test_outra_pessoa_nao_passa(self):
        sou_eu = person_matcher("Carlos Andrade")
        self.assertFalse(sou_eu("Mariana Ribeiro"))
        self.assertFalse(sou_eu(""))

    def test_sem_pessoa_serve_tudo(self):
        # é o que a leitura da folha espera: sem pessoa escolhida não se filtra
        # nada. Quem precisa do contrário trata o caso vazio (ver team_waiting_on)
        self.assertTrue(person_matcher("")("qualquer coisa"))


class TestEsperasPorMim(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.partilha = os.path.join(self.tmp, "releases")
        os.makedirs(self.partilha, exist_ok=True)
        self.real_find = updates.find_releases_dir
        self.real_cfg = team.TEAM_CONFIG_FILE
        updates.find_releases_dir = lambda: self.partilha
        team.TEAM_CONFIG_FILE = os.path.join(self.tmp, "team_config.json")
        team.forget_team_waiting()

    def tearDown(self):
        updates.find_releases_dir = self.real_find
        team.TEAM_CONFIG_FILE = self.real_cfg
        team.forget_team_waiting()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def publica_de(self, pessoa, marcas, quando=None):
        pasta = os.path.join(self.partilha, team.TEAM_SUBDIR)
        os.makedirs(pasta, exist_ok=True)
        quando = quando or datetime.now().strftime("%Y-%m-%d %H:%M")
        statefile.write_json(os.path.join(pasta, f"waiting-{team._slug(pessoa)}.json"),
                             {"person": pessoa, "updated": quando, "waiting": marcas},
                             backup=False)
        team.forget_team_waiting()

    def test_a_marca_de_um_colega_em_mim_aparece(self):
        self.publica_de("Nuno Silva", {
            "reworks||FN_A||rework": {"who": "Carlos Andrade", "since": "2026-08-15"}})
        minhas = team.team_waiting_on("Carlos Andrade")
        self.assertEqual(len(minhas), 1)
        self.assertEqual(minhas[0]["by"], "Nuno Silva")
        self.assertEqual(minhas[0]["key"], "reworks||FN_A||rework")
        self.assertEqual(minhas[0]["since"], "2026-08-15")

    def test_so_um_dos_nomes_tambem_conta(self):
        # o colega escreveu só "Carlos" na marca
        self.publica_de("Nuno Silva", {
            "reworks||FN_A||rework": {"who": "Carlos", "since": "2026-08-15"}})
        self.assertEqual(len(team.team_waiting_on("Carlos Andrade")), 1)

    def test_o_que_cobram_a_outro_nao_e_meu(self):
        self.publica_de("Nuno Silva", {
            "reworks||FN_B||rework": {"who": "Mariana Ribeiro", "since": "2026-08-15"}})
        self.assertEqual(team.team_waiting_on("Carlos Andrade"), [])

    def test_a_minha_propria_marca_nao_conta(self):
        """Eu à espera de mim não é o gargalo de ninguém — e o load_team_waiting
        já me deixa de fora como quem publica."""
        self.publica_de("Carlos Andrade", {
            "reworks||FN_C||rework": {"who": "Carlos Andrade", "since": "2026-08-15"}})
        self.assertEqual(team.team_waiting_on("Carlos Andrade"), [])

    def test_sem_nome_nao_se_afirma_nada(self):
        self.publica_de("Nuno Silva", {
            "reworks||FN_A||rework": {"who": "Carlos Andrade", "since": "2026-08-15"}})
        self.assertEqual(team.team_waiting_on(""), [])
        self.assertEqual(team.team_waiting_on(None), [])

    def test_a_mais_antiga_vem_primeiro(self):
        self.publica_de("Nuno Silva", {
            "a||FN_A||x": {"who": "Carlos", "since": "2026-08-18"},
            "a||FN_B||x": {"who": "Carlos", "since": "2026-08-10"}})
        ordem = [m["key"] for m in team.team_waiting_on("Carlos Andrade")]
        self.assertEqual(ordem, ["a||FN_B||x", "a||FN_A||x"])

    def test_sem_partilha_ao_alcance_responde_vazio(self):
        updates.find_releases_dir = lambda: None
        team.forget_team_waiting()
        self.assertEqual(team.team_waiting_on("Carlos Andrade"), [])

    def test_marca_de_uma_instalacao_parada_nao_conta(self):
        """O corte do load_team_waiting (TEAM_TTL_DAYS) continua a valer."""
        self.publica_de("Nuno Silva",
                        {"a||FN_A||x": {"who": "Carlos", "since": "2020-01-01"}},
                        quando="2020-01-01 10:00")
        self.assertEqual(team.team_waiting_on("Carlos Andrade"), [])


if __name__ == "__main__":
    unittest.main()
