"""Persistent device-local credentials protected with current-user Windows DPAPI."""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import re
import tempfile
import threading

from bupt_sync import SyncError

ROOT = Path(__file__).resolve().parent
VAULT_PATH = ROOT / ".local" / "account.dpapi"
LOCK = threading.RLock()
MAGIC = b"KETIME-DPAPI-1\n"


class Blob(ctypes.Structure):
    _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]


def crypt(data, decrypt=False):
    if os.name != "nt":
        raise SyncError("此版本的账号永久保存需要 Windows 用户级加密。", "SETTINGS_PLATFORM")
    library = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    method = library.CryptUnprotectData if decrypt else library.CryptProtectData
    method.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    method.restype = wintypes.BOOL
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    output = Blob()
    # UI_FORBIDDEN only; do NOT use LOCAL_MACHINE, which permits other users.
    if not method(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output)):
        raise SyncError("无法解密或保存账号。请使用原 Windows 用户，或重新填写设置。", "SETTINGS_CRYPTO")
    try:
        return ctypes.string_at(output.data, output.size)
    finally:
        ctypes.memset(buffer, 0, len(data))
        if decrypt:
            ctypes.memset(output.data, 0, output.size)
        kernel.LocalFree(ctypes.cast(output.data, ctypes.c_void_p))


def read_settings():
    with LOCK:
        if not VAULT_PATH.exists():
            return {"account": "", "password": "", "cloudPassword": "", "termStart": ""}
        try:
            encoded = VAULT_PATH.read_bytes()
            if not encoded.startswith(MAGIC) or len(encoded) > 65536:
                raise ValueError
            result = json.loads(crypt(encoded[len(MAGIC):], decrypt=True))
            if not isinstance(result, dict) or any(not isinstance(result.get(key, ""), str) for key in ("account", "password", "cloudPassword", "termStart")):
                raise ValueError
            return {key: result.get(key, "") for key in ("account", "password", "cloudPassword", "termStart")}
        except SyncError:
            raise
        except (OSError, ValueError, UnicodeError):
            raise SyncError("本机账号文件损坏或不可读取，请重新设置账号。", "SETTINGS_FILE") from None


def public_settings():
    data = read_settings()
    return {"account": data["account"], "hasPassword": bool(data["password"]), "hasCloudPassword": bool(data["cloudPassword"]), "termStart": data["termStart"], "encrypted": True}


def save_settings(payload):
    with LOCK:
        if payload.get("clear") is True:
            result = {"account": "", "password": "", "cloudPassword": "", "termStart": ""}
        else:
            previous = read_settings()
            account = str(payload.get("account", previous["account"])).strip()
            if not re.fullmatch(r"[A-Za-z0-9._-]{4,32}", account):
                raise SyncError("请填写有效账号。", "SETTINGS_INPUT")
            changed = account != previous["account"]
            result = {"account": account}
            for key in ("password", "cloudPassword"):
                value = payload.get(key, "")
                if not isinstance(value, str) or len(value) > 256:
                    raise SyncError("密码格式不正确。", "SETTINGS_INPUT")
                if changed and not value:
                    raise SyncError("更换账号时请同时填写两种密码，避免使用旧账号凭据。", "SETTINGS_INPUT")
                result[key] = value or previous[key]
            start = str(payload.get("termStart", previous["termStart"]))
            if start:
                from datetime import date
                try:
                    valid = date.fromisoformat(start)
                except ValueError:
                    raise SyncError("学期开始日期无效。", "SETTINGS_INPUT") from None
                if valid.weekday() != 0:
                    raise SyncError("第一教学周开始日期必须为周一。", "SETTINGS_INPUT")
            result["termStart"] = start
        encoded = MAGIC + crypt(json.dumps(result, ensure_ascii=False).encode("utf-8"))
        temporary = None
        try:
            VAULT_PATH.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=VAULT_PATH.parent, prefix="account-", suffix=".tmp", delete=False) as output:
                temporary = Path(output.name)
                output.write(encoded)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, VAULT_PATH)
        except OSError:
            raise SyncError("本机账号保存失败，原设置未更改。", "SETTINGS_WRITE") from None
        finally:
            if temporary and temporary.exists():
                temporary.unlink()
        return public_settings()


def stored_credentials(cloud=False):
    settings = read_settings()
    password = settings["cloudPassword" if cloud else "password"]
    if not settings["account"] or not password:
        raise SyncError("请先在右上角设置中保存账号及密码。", "SETTINGS_REQUIRED")
    return settings["account"], password, settings["termStart"]
