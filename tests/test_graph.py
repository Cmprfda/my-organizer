"""Teste offline da leitura/escrita pela Microsoft Graph (sem rede, sem Excel)."""
import sys, os, json, subprocess, shutil, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from cswaios import excel
from cswaios import graph as app     # o módulo em teste; `excel` só para os índices

REAL_GRAPH_TOKEN = app.graph_token
CALLS = []


def fake_http(url, data=None, headers=None, method=None, as_json=False):
    CALLS.append((method or ("POST" if data else "GET"), url, data))
    if "/shares/" in url:
        return {"id": "ITEM", "parentReference": {"driveId": "DRIVE"}}
    if url.endswith("/workbook/createSession"):
        assert data == {"persistChanges": False} and as_json, data
        return {"id": "SESSAO"}
    if url.endswith("/workbook/closeSession"):
        assert (headers or {}).get("workbook-session-id") == "SESSAO", headers
        return {}
    if url.endswith("/worksheets?$select=name"):
        assert (headers or {}).get("workbook-session-id") == "SESSAO", headers
        return {"value": [{"name": "PRJ_CFG1_reworks_julho"}, {"name": "Admin"}]}
    if "usedRange" in url:
        return {"address": "PRJ_CFG1_reworks_julho!B2:D4",
                "text": [["Function/TC", "To do", "Status TC"],
                         ["POSBSP_A", "run", "In progress"],
                         ["POSBSP_B", "", "Done"]]}
    if "range(address='B3')" in url:
        return {"text": [["POSBSP_A"]]}
    if "range(address='D3')" in url:
        return {}
    raise AssertionError("URL inesperado: " + url)


CFG = {"client_id": "x", "tenant_id": "organizations", "use_azure_cli": True,
       "file_url": "https://example.com/f.xlsx", "authority": "https://a",
       "graph_base": "https://g"}
app._http_json = fake_http
app.graph_config = lambda: dict(CFG)
app.graph_token = lambda cfg=None: "TOKEN"

# --- leitura ----------------------------------------------------------------
# sem drive/item explícitos: o livro é o que a app tiver escolhido (graph_item)
sheet, sheets, rows = app.graph_load_rows("", "", "prj_cfg1")
assert sheet == "PRJ_CFG1_reworks_julho", sheet
assert sheets == ["PRJ_CFG1_reworks_julho", "Admin"], sheets
# usedRange começa em B2: a linha 1 fica vazia e a coluna A a None
assert rows[0] == [], rows[0]
assert rows[1] == [None, "Function/TC", "To do", "Status TC"], rows[1]
assert excel.detect_header_row(rows) == 1
assert app.col_letter(1) == "A" and app.col_letter(27) == "AA" and app.col_letter(4) == "D"
assert app._range_start("Folha!B2:D4") == (2, 2)

# --- escrita com guarda: B3 tem POSBSP_A, escreve em D3 ---------------------
ok, out = app.graph_write_status("PRJ_CFG1_reworks_julho", 3, 4, 2, "POSBSP_A", "Done")
assert ok, out
assert any(m == "PATCH" for m, _u, _d in CALLS), CALLS
ok, out = app.graph_write_status("PRJ_CFG1_reworks_julho", 3, 4, 2, "OUTRA", "Done")
assert not ok and "mudou entretanto" in out, out

# --- token emprestado por uma sessão existente (Azure CLI) ------------------
app.graph_token = REAL_GRAPH_TOKEN
CLI_OUT = json.dumps({"accessToken": "CLI-TOKEN", "expires_on": time.time() + 3600,
                      "tokenType": "Bearer"}).encode()


def fake_run(cmd, **kw):
    assert cmd[1:3] == ["account", "get-access-token"], cmd
    return subprocess.CompletedProcess(cmd, 0, CLI_OUT, b"")


app._graph_load_tokens = lambda: {}          # sem login por código nesta app
shutil.which = lambda name: r"C:\fake\az.cmd" if name == "az" else None
subprocess.run = fake_run
app._cli_token.update({"token": "", "expires_at": 0.0})
assert app.graph_token() == "CLI-TOKEN"
assert app._graph_source == "cli"

# a CLI só é usada se a configuração o permitir
CFG["use_azure_cli"] = False
app._cli_token.update({"token": "", "expires_at": 0.0})
assert app.graph_token() is None
CFG["use_azure_cli"] = True

# sem CLI instalada e sem login próprio não há token (mas também não rebenta)
shutil.which = lambda name: None
app._cli_token.update({"token": "", "expires_at": 0.0})
assert app.graph_token() is None

# --- a conta das Definições segue a que ficou mesmo autenticada -------------
# ficheiro de configuração à parte: o da instalação nunca é tocado no teste
TMP_CFG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_tmp_graph_cfg.json")
app.GRAPH_CONFIG_FILE = TMP_CFG
app.graph_config = lambda: json.load(open(TMP_CFG, encoding="utf-8-sig"))
try:
    # conta antiga escrita à mão + login feito com outra: passa a valer a nova
    json.dump({"login_email": "antigo@empresa.com"}, open(TMP_CFG, "w", encoding="utf-8"))
    app._sync_login_email("novo@empresa.com")
    assert app.graph_config()["login_email"] == "novo@empresa.com", app.graph_config()
    assert app.login_hint() == "novo@empresa.com"

    # a mesma conta (só com outra caixa) não reescreve nada
    app._sync_login_email("NOVO@empresa.com")
    assert app.graph_config()["login_email"] == "novo@empresa.com", app.graph_config()

    # campo vazio fica vazio: aí quem manda é a conta da última sessão
    json.dump({}, open(TMP_CFG, "w", encoding="utf-8"))
    app._sync_login_email("novo@empresa.com")
    assert "login_email" not in app.graph_config(), app.graph_config()

    # login sem conta conhecida (o /me falhou) não apaga a escolha de ninguém
    json.dump({"login_email": "antigo@empresa.com"}, open(TMP_CFG, "w", encoding="utf-8"))
    app._sync_login_email("")
    assert app.graph_config()["login_email"] == "antigo@empresa.com", app.graph_config()
finally:
    try:
        os.remove(TMP_CFG)
    except OSError:
        pass

print("OK - leitura, indices, escrita, token da Azure CLI e conta do login validados")
