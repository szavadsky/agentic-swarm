"""Empirically choose a non-hex, secrets-clean digest encoding for the tracked cache.

Consumes the repository's own `.secrets.baseline` plugins/filters.  The
`^\\.factory/` filename filter is avoided by scanning absolute paths; the
eventual artifact lives at the consumer project root anyway, outside
`.factory/`.  Every candidate encodes the same full 256-bit SHA-256 digest;
truncation is rejected because cache identity must be collision-safe.
"""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
from typing import Callable

from detect_secrets.core.scan import scan_file
from detect_secrets.settings import transient_settings

REPO_ROOT = Path(__file__).resolve().parents[6]
BASELINE = REPO_ROOT / ".secrets.baseline"
POC = Path(__file__).resolve().parent
OUT = POC / "out"
TMP = POC / "tmp" / "encoding_lab"

DIGEST = hashlib.sha256(b"justification\x00W9704\x00fake-backend rev test prompt-v1").digest()


def _b32(data: bytes) -> str:
    return base64.b32encode(data).decode("ascii").rstrip("=").lower()


def _b32_upper(data: bytes) -> str:
    return base64.b32encode(data).decode("ascii").rstrip("=")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b58(data: bytes) -> str:
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    number = int.from_bytes(data, "big")
    encoded = ""
    while number:
        number, rem = divmod(number, 58)
        encoded = alphabet[rem] + encoded
    return encoded or "1"


def _b36(data: bytes) -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    number = int.from_bytes(data, "big")
    encoded = ""
    while number:
        number, rem = divmod(number, 36)
        encoded = alphabet[rem] + encoded
    return encoded or "0"


def _decimal(data: bytes) -> str:
    return str(int.from_bytes(data, "big"))


def _group(text: str, size: int, sep: str) -> str:
    return sep.join(text[i : i + size] for i in range(0, len(text), size))


CANDIDATES: dict[str, Callable[[bytes], str]] = {
    "hex_full": lambda d: d.hex(),
    "hex_short12": lambda d: d.hex()[:12],
    "hex_dashed8": lambda d: "d1-" + _group(d.hex(), 8, "-"),
    "base32_lower": _b32,
    "base32_lower_prefixed": lambda d: "dk1_" + _b32(d),
    "base32_lower_dashed8": lambda d: "dk1-" + _group(_b32(d), 8, "-"),
    "base32_lower_dotted8": lambda d: "dk1." + _group(_b32(d), 8, "."),
    "base32_upper": _b32_upper,
    "base32_upper_dashed8": lambda d: "DK1-" + _group(_b32_upper(d), 8, "-"),
    "base32_upper_dotted8": lambda d: "DK1." + _group(_b32_upper(d), 8, "."),
    "base64url": _b64url,
    "base58": _b58,
    "base36": _b36,
    "decimal": _decimal,
    "decimal_prefixed": lambda d: "dk1:" + _decimal(d),
}


def scan(path: Path) -> list[dict[str, str]]:
    return [
        {
            "type": secret.type,
            "line": secret.secret_value,
        }
        for secret in scan_file(str(path))
    ]


def make_entry(value: str) -> dict[str, object]:
    return {
        "decision": True,
        "files": ["src/app.py"],
        "justification": "retry loop must not swallow keyboard interrupt",
        "last_seen": "2026-11-08",
        "model": "fake-backend rev test prompt-v1",
        "prompt_hash": value,
        "rule": "W9704",
        "version": 1,
    }


def main() -> None:
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    TMP.mkdir(parents=True, exist_ok=True)
    results: dict[str, object] = {}
    with transient_settings(baseline):
        for name, encoder in CANDIDATES.items():
            value = encoder(DIGEST)
            path = TMP / f"{name}.json"
            path.write_text(json.dumps(make_entry(value), indent=2, sort_keys=True) + "\n", encoding="utf-8")
            results[name] = {
                "length": len(value),
                "value": value,
                "filename_findings": scan(path),
            }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "encoding_lab.json").write_text(json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    for name, data in results.items():
        findings = data["filename_findings"]  # type: ignore[index]
        print(f"{name:26} len={data['length']:>3} findings={len(findings)} {findings}")  # type: ignore[index]


if __name__ == "__main__":
    main()
