# -*- coding: utf-8 -*-
"""Recados numa linha, bola passada, recibos e o kit de chegada.

Quatro coisas que viajam pela pasta partilhada, cada uma num ficheiro de quem a
escreve — é isso que faz duas instalações a gravar ao mesmo tempo nunca se
pisarem. Aqui a "pasta partilhada" é uma pasta temporária.

Corre offline: nada de Excel, de rede ou de ficheiros do utilizador.
"""
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import team
from cswaios.statefile import read_json, write_json


class _ComPartilha(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.pasta = os.path.join(self.tmp, "team")
        os.makedirs(self.pasta, exist_ok=True)
        self.real = team.team_dir
        team.team_dir = lambda create=False: self.pasta

    def tearDown(self):
        team.team_dir = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _envelhecer(self, nome, dias):
        """Faz um ficheiro publicado parecer velho (instalação parada)."""
        caminho = os.path.join(self.pasta, nome)
        data = read_json(caminho, {})
        data["updated"] = (datetime.now() - timedelta(days=dias)).strftime("%Y-%m-%d %H:%M")
        write_json(caminho, data, backup=False)


class TestRecados(_ComPartilha):
    def test_um_recado_publicado_le_se_de_volta(self):
        n = team.publish_messages("Carlos", [
            {"id": "m1", "key": "livro||BSP||fn_a||rework", "to": "Rita",
             "text": "falha no ramo do componente", "label": "fn_a"}])
        self.assertEqual(n, 1)
        # a Rita vê o recado que é para ela
        dela = team.load_team_messages("Rita")
        self.assertEqual(len(dela), 1)
        self.assertEqual(dela[0]["from"], "Carlos")
        # e a chave viaja SEM o livro (o caminho é diferente em cada máquina)
        self.assertEqual(dela[0]["key"], "BSP||fn_a||rework")

    def test_um_recado_para_outra_pessoa_nao_me_aparece(self):
        team.publish_messages("Carlos", [
            {"id": "m1", "key": "l||BSP||fn_a||x", "to": "Rita", "text": "olá"}])
        self.assertEqual(team.load_team_messages("João"), [])
        # sem destinatário é para quem passar pela linha: esse vê
        team.publish_messages("Carlos", [
            {"id": "m2", "key": "l||BSP||fn_b||x", "to": "", "text": "cuidado"}])
        joao = team.load_team_messages("João")
        self.assertEqual([m["id"] for m in joao], ["m2"])

    def test_os_meus_recados_vem_sempre_para_eu_ver_se_foram_lidos(self):
        team.publish_messages("Carlos", [
            {"id": "m1", "key": "l||BSP||fn_a||x", "to": "Rita", "text": "olá"}])
        meus = team.load_team_messages("Carlos")
        self.assertEqual(len(meus), 1)
        self.assertTrue(meus[0]["mine"])
        self.assertEqual(meus[0]["seen"], [])

    def test_o_recibo_de_leitura_aparece_a_quem_mandou(self):
        team.publish_messages("Carlos", [
            {"id": "m1", "key": "l||BSP||fn_a||x", "to": "Rita", "text": "olá"}])
        team.ack_seen("Rita", message_ids=["m1"])
        meus = team.load_team_messages("Carlos")
        self.assertEqual([s["who"] for s in meus[0]["seen"]], ["Rita"])

    def test_publicar_substitui_a_minha_lista(self):
        team.publish_messages("Carlos", [
            {"id": "m1", "key": "l||BSP||a||x", "to": "", "text": "um"},
            {"id": "m2", "key": "l||BSP||b||x", "to": "", "text": "dois"}])
        team.publish_messages("Carlos", [
            {"id": "m2", "key": "l||BSP||b||x", "to": "", "text": "dois"}])
        self.assertEqual([m["id"] for m in team.load_team_messages("João")], ["m2"])

    def test_publicar_nada_apaga_o_meu_ficheiro(self):
        team.publish_messages("Carlos", [
            {"id": "m1", "key": "l||BSP||a||x", "to": "", "text": "um"}])
        self.assertEqual(team.publish_messages("Carlos", []), 0)
        self.assertEqual(team.load_team_messages("João"), [])
        self.assertFalse(os.path.exists(os.path.join(self.pasta, "messages-carlos.json")))

    def test_uma_instalacao_parada_deixa_de_falar(self):
        team.publish_messages("Carlos", [
            {"id": "m1", "key": "l||BSP||a||x", "to": "", "text": "um"}])
        self._envelhecer("messages-carlos.json", team.MESSAGES_TTL_DAYS + 1)
        self.assertEqual(team.load_team_messages("João"), [])

    def test_um_recado_sem_texto_nao_e_um_recado(self):
        self.assertIsNone(team.normalize_message({"id": "m", "key": "k", "text": "  "}))
        self.assertIsNone(team.normalize_message({"id": "", "key": "k", "text": "x"}))
        self.assertIsNone(team.normalize_message("nem um dicionário"))


class TestBolaPassada(_ComPartilha):
    def test_a_bola_chega_a_quem_foi_passada(self):
        n = team.publish_handoffs("Carlos", [
            {"key": "l||BSP||fn_a||x", "to": "Rita", "col": "Status TC",
             "value": "Implemented", "label": "fn_a"}])
        self.assertEqual(n, 1)
        dela = team.load_team_handoffs("Rita")
        self.assertEqual(len(dela), 1)
        self.assertEqual(dela[0]["from"], "Carlos")
        self.assertEqual(dela[0]["taken"], [])

    def test_mexer_na_linha_marca_a_bola_como_aceite(self):
        team.publish_handoffs("Carlos", [
            {"key": "l||BSP||fn_a||x", "to": "Rita", "col": "Status TC",
             "value": "Implemented"}])
        # é o que o cliente manda quando o Envio da Rita mexe naquela linha
        team.ack_seen("Rita", taken_keys=["carlos||BSP||fn_a||x"])
        minha = team.load_team_handoffs("Carlos")
        self.assertEqual([x["who"] for x in minha[0]["taken"]], ["Rita"])

    def test_uma_bola_sem_destinatario_nao_e_uma_bola(self):
        self.assertIsNone(team.normalize_handoff({"key": "k", "to": ""}))
        self.assertEqual(team.publish_handoffs("Carlos", [{"key": "k"}]), 0)


class TestKitDeChegada(_ComPartilha):
    def test_publicar_e_trazer_um_kit(self):
        ok = team.publish_capsule("Carlos", {
            "name": "kit do Carlos",
            "sets": [{"name": "As minhas", "filters": [{"a": 1}]}],
            "prefs": {"stale_days": 7, "lang": "pt"},
            "brief": "## Estado\nvai andando"})
        self.assertTrue(ok)
        kits = team.load_capsules()
        self.assertEqual(len(kits), 1)
        self.assertEqual(kits[0]["person"], "Carlos")
        self.assertEqual(kits[0]["prefs"]["stale_days"], 7)
        self.assertIn("Estado", kits[0]["brief"])

    def test_o_kit_nao_leva_estruturas_que_ninguem_sabe_validar(self):
        team.publish_capsule("Carlos", {
            "prefs": {"stale_days": 7, "lixo": {"nested": True}}, "brief": "x"})
        prefs = team.load_capsules()[0]["prefs"]
        self.assertIn("stale_days", prefs)
        self.assertNotIn("lixo", prefs)

    def test_um_kit_vazio_nao_se_publica(self):
        self.assertIsNone(team.publish_capsule("Carlos", {}))
        self.assertIsNone(team.publish_capsule("", {"brief": "x"}))
        self.assertEqual(team.load_capsules(), [])


class TestSemPartilhaAoAlcance(unittest.TestCase):
    """Sem a pasta partilhada nesta máquina, nada disto pode falhar com erro."""

    def setUp(self):
        self.real = team.team_dir
        team.team_dir = lambda create=False: None

    def tearDown(self):
        team.team_dir = self.real

    def test_publicar_diz_que_nao_conseguiu_em_vez_de_rebentar(self):
        self.assertIsNone(team.publish_messages("Carlos", [
            {"id": "m", "key": "k", "text": "x"}]))
        self.assertIsNone(team.publish_handoffs("Carlos", [
            {"key": "k", "to": "Rita"}]))
        self.assertIsNone(team.publish_capsule("Carlos", {"brief": "x"}))
        self.assertFalse(team.ack_seen("Rita", ["m1"]))

    def test_ler_devolve_vazio(self):
        self.assertEqual(team.load_team_messages("Carlos"), [])
        self.assertEqual(team.load_team_handoffs("Carlos"), [])
        self.assertEqual(team.load_capsules(), [])


if __name__ == "__main__":
    unittest.main()
