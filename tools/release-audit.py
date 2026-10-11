"""Offline package audit. Never opens the developer's credential vaults.

Checks package boundaries, known secret formats, source parity and ELF LOAD
alignment, including Python extensions hidden in Chaquopy .imy ZIP files.
This is not a substitute for a security review or 16 KB runtime testing.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = re.compile(r"(?:^|/)(?:\.local|\.git|tests|private)(?:/|$)|\.(?:dpapi|aes|p12|jks|keystore)$|(?:^|/)\.env(?:\.|$)", re.I)
SECRET_PATTERNS = {
    "private-key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{64,}\s*-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "api-key": re.compile(rb"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b"),
    "github-token": re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b"),
}


def zip_name(entry):
    # Android's Java packager can write UTF-8 names without setting ZIP bit 11.
    if not entry.flag_bits & 0x800:
        try:
            return entry.filename.encode("cp437").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return entry.filename


def elf_load_alignment(raw):
    if raw[:4] != b"\x7fELF" or raw[4] not in (1, 2) or raw[5] not in (1, 2):
        raise ValueError("Not a supported ELF")
    endian = "<" if raw[5] == 1 else ">"
    if raw[4] == 2:
        offset = struct.unpack_from(endian + "Q", raw, 32)[0]
        size, count = struct.unpack_from(endian + "HH", raw, 54)
        fmt, alignment_index = endian + "IIQQQQQQ", 7
    else:
        offset = struct.unpack_from(endian + "I", raw, 28)[0]
        size, count = struct.unpack_from(endian + "HH", raw, 42)
        fmt, alignment_index = endian + "IIIIIIII", 7
    loads = []
    for index in range(count):
        header = struct.unpack_from(fmt, raw, offset + index * size)
        if header[0] == 1:
            loads.append(header[alignment_index])
    if not loads:
        raise ValueError("No ELF LOAD segments")
    return min(loads)


def audit(apk):
    report = {"apk": apk.name, "sha256": hashlib.sha256(apk.read_bytes()).hexdigest(),
              "sizeBytes": apk.stat().st_size, "privateFiles": [], "secretFindings": [],
              "sourceMismatch": [], "nativeLibraries": [], "unknownElf": []}
    with zipfile.ZipFile(apk) as package:
        def inspect(name, raw):
            if FORBIDDEN.search(name):
                report["privateFiles"].append(name)
            for kind, pattern in SECRET_PATTERNS.items():
                if pattern.search(raw):
                    # Names and classes only: never print matched credential values.
                    report["secretFindings"].append({"file": name, "kind": kind})
            if raw.startswith(b"\x7fELF"):
                try:
                    alignment = elf_load_alignment(raw)
                    report["nativeLibraries"].append({"file": name, "minimumLoadAlignment": alignment,
                                                      "supports16KBAlignment": alignment >= 16384})
                except (ValueError, struct.error, IndexError):
                    report["unknownElf"].append(name)
        for entry in package.infolist():
            name = zip_name(entry)
            raw = package.read(entry)
            inspect(name, raw)
            if name.startswith("assets/chaquopy/") and name.endswith(".imy"):
                with zipfile.ZipFile(io.BytesIO(raw)) as nested:
                    for member in nested.infolist():
                        inspect(name + "!/" + zip_name(member), nested.read(member))
            if name.startswith("assets/web/") and not name.endswith("/"):
                relative = name[len("assets/web/"):]
                source = ROOT / relative
                if not source.is_file():
                    source = ROOT / "android/app/src/main/web" / relative
                if not source.is_file() or source.read_bytes() != raw:
                    report["sourceMismatch"].append(name)
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("apk", type=Path, nargs="?", default=ROOT / "android/dist/刻时-Android-1.0.apk")
    parser.add_argument("--require-16kb", action="store_true")
    parser.add_argument("--output", type=Path, help="Write a generated audit report (contains no matched secret values)")
    args = parser.parse_args()
    report = audit(args.apk)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True, indent=2))
    failed = bool(report["privateFiles"] or report["secretFindings"] or report["sourceMismatch"] or report["unknownElf"])
    if args.require_16kb:
        failed |= any(not lib["supports16KBAlignment"] for lib in report["nativeLibraries"])
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
