"""Small TOML writing helpers for simple generated config files."""

from __future__ import annotations

# TOML basic strings must escape backslash, double-quote, and control characters
# (newline, CR, etc.). Tab is allowed literally. Anything generated from
# untrusted input (e.g. the external provider catalog) is run through this so a
# stray control character can't corrupt the file it's written into.
_TOML_BASIC_ESCAPES = {
    "\\": "\\\\",
    '"': '\\"',
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
}


def toml_escape(value: str) -> str:
    out = []
    for ch in value:
        mapped = _TOML_BASIC_ESCAPES.get(ch)
        if mapped is not None:
            out.append(mapped)
        elif ch != "\t" and (ch < "\x20" or ch == "\x7f"):
            out.append(f"\\u{ord(ch):04x}")
        else:
            out.append(ch)
    return "".join(out)


def toml_value(value) -> str:
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (int, float)):
        return str(value)
    return f'"{toml_escape(str(value))}"'


def dump_simple_toml(data: dict[str, dict]) -> str:
    chunks = []
    for table, values in data.items():
        lines = [f"[{table}]"]
        for key, value in values.items():
            lines.append(f"{key} = {toml_value(value)}")
        chunks.append("\n".join(lines))
    return "\n\n".join(chunks) + ("\n" if chunks else "")
