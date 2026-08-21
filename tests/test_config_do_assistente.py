# -*- coding: utf-8 -*-
"""Configurar o assistente (cswaios/chat.py save_chat_config/chat_config_view).

O motor do assistente era um ficheiro escrito à mão ao lado da app: quem não
editasse JSON não tinha acesso a uma funcionalidade que já estava toda feita.
O que se prova aqui é o essencial e o delicado: a chave da API nunca sai na
resposta, e um "gravar" sem chave no campo não apaga a que já lá está.

Corre offline: o `chat_config.json` vai para uma pasta temporária.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cswaios import chat


class TestConfigDoAssistente(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.real = chat.CHAT_CONFIG_FILE
        chat.CHAT_CONFIG_FILE = os.path.join(self.tmp, "chat_config.json")

    def tearDown(self):
        chat.CHAT_CONFIG_FILE = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _ficheiro(self):
        with open(chat.CHAT_CONFIG_FILE, encoding="utf-8") as f:
            return json.load(f)

    # ------------------------------------------------------------- o essencial
    def test_gravar_o_motor_local(self):
        vista = chat.save_chat_config("local")
        self.assertEqual(self._ficheiro()["engine"], "local")
        self.assertEqual(vista["engine"], "local")
        self.assertFalse(vista["hasKey"])

    def test_gravar_o_motor_do_modelo_com_chave(self):
        chat.save_chat_config("llm", "claude-opus-5", "sk-ant-secreta")
        cfg = self._ficheiro()
        self.assertEqual(cfg["engine"], "llm")
        self.assertEqual(cfg["llm"]["provider"], "anthropic")
        self.assertEqual(cfg["llm"]["model"], "claude-opus-5")
        self.assertEqual(cfg["llm"]["api_key"], "sk-ant-secreta")

    def test_motor_invalido_e_recusado(self):
        with self.assertRaises(ValueError):
            chat.save_chat_config("magia")
        with self.assertRaises(ValueError):
            chat.save_chat_config("")

    # ------------------------------------------------------------- a chave
    def test_a_vista_nunca_leva_a_chave(self):
        """A resposta da rota atravessa a LAN e vai aos registos."""
        chat.save_chat_config("llm", "claude-opus-5", "sk-ant-secreta")
        vista = chat.chat_config_view()
        self.assertTrue(vista["hasKey"])
        self.assertNotIn("api_key", vista)
        self.assertNotIn("sk-ant-secreta", json.dumps(vista))

    def test_gravar_sem_chave_no_campo_mantem_a_que_la_esta(self):
        # o campo vem vazio porque a interface nunca a mostrou: vazio quer dizer
        # "não mexer", não "apagar"
        chat.save_chat_config("llm", "claude-opus-5", "sk-ant-secreta")
        chat.save_chat_config("llm", "claude-sonnet-5", None)
        cfg = self._ficheiro()
        self.assertEqual(cfg["llm"]["api_key"], "sk-ant-secreta")
        self.assertEqual(cfg["llm"]["model"], "claude-sonnet-5")

    def test_campo_com_espacos_tambem_conta_como_nao_mexer(self):
        chat.save_chat_config("llm", "claude-opus-5", "sk-ant-secreta")
        chat.save_chat_config("llm", "claude-opus-5", "   ")
        self.assertEqual(self._ficheiro()["llm"]["api_key"], "sk-ant-secreta")

    def test_chave_nova_substitui_a_antiga(self):
        chat.save_chat_config("llm", "claude-opus-5", "sk-ant-velha")
        chat.save_chat_config("llm", "claude-opus-5", "sk-ant-nova")
        self.assertEqual(self._ficheiro()["llm"]["api_key"], "sk-ant-nova")

    def test_sem_chave_nenhuma_nao_se_inventa_o_campo(self):
        # o SDK ainda encontra a credencial no ambiente ou num perfil: exigir
        # aqui uma chave era fechar uma porta que funciona
        chat.save_chat_config("llm", "claude-opus-5", None)
        self.assertNotIn("api_key", self._ficheiro()["llm"])
        self.assertFalse(chat.chat_config_view()["hasKey"])

    def test_modelo_vazio_mantem_o_que_la_estava(self):
        chat.save_chat_config("llm", "claude-opus-5", "k")
        chat.save_chat_config("llm", "", None)
        self.assertEqual(self._ficheiro()["llm"]["model"], "claude-opus-5")

    def test_passar_pelo_motor_local_nao_perde_a_chave(self):
        """Experimentar o motor local e voltar atrás não pode obrigar a
        reescrever a chave: a interface nunca a mostra, quem a perdesse tinha de
        a ir buscar a outro sítio.

        O teste TEM de voltar ao motor do modelo para o confirmar — parar no
        `hasKey` do motor local dava verdade em qualquer dos casos, e foi assim
        que este erro passou pela primeira versão do teste.
        """
        chat.save_chat_config("llm", "claude-opus-5", "sk-ant-secreta")
        chat.save_chat_config("local")
        self.assertEqual(self._ficheiro()["engine"], "local")
        # a chave continua guardada (o `hasKey` diz que ela existe, não que está
        # em uso: com o motor local o campo dela nem aparece na interface)
        self.assertTrue(chat.chat_config_view()["hasKey"])
        # e volta a valer ao voltar ao modelo, sem se reescrever nada
        chat.save_chat_config("llm", "", None)
        self.assertTrue(chat.chat_config_view()["hasKey"])
        self.assertEqual(self._ficheiro()["llm"]["api_key"], "sk-ant-secreta")
        self.assertEqual(self._ficheiro()["llm"]["model"], "claude-opus-5")

    def test_o_motor_local_nunca_devolve_a_chave(self):
        # guardada, sim; devolvida, nunca — nem com o motor local
        chat.save_chat_config("llm", "claude-opus-5", "sk-ant-secreta")
        chat.save_chat_config("local")
        vista = chat.chat_config_view()
        self.assertEqual(vista["engine"], "local")
        self.assertNotIn("api_key", vista)
        self.assertNotIn("sk-ant-secreta", json.dumps(vista))

    # ------------------------------------------------------------- leitura
    def test_sem_ficheiro_a_vista_e_o_motor_local(self):
        vista = chat.chat_config_view()
        self.assertEqual(vista["engine"], "local")
        self.assertFalse(vista["hasKey"])
        self.assertEqual(vista["model"], "")

    def test_ficheiro_estragado_le_se_como_local(self):
        with open(chat.CHAT_CONFIG_FILE, "w", encoding="utf-8") as f:
            f.write("{isto não é json}")
        self.assertEqual(chat.chat_config_view()["engine"], "local")


if __name__ == "__main__":
    unittest.main()
