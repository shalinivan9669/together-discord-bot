# AGENTS.md

## Encoding safety (mandatory)
- Always preserve UTF-8 encoding for all text and code files.
- Never use locale-dependent encodings (cp1251/ANSI/Windows-1252) for reads/writes.
- In PowerShell, never use `Set-Content` or `Out-File` without explicit `-Encoding UTF8`.
- In Node.js, always read/write files with explicit `utf8` encoding.
- After edits in files that may contain Cyrillic, run a mojibake check before finishing:
  - `rg "РЎ|РЏ|Рђ|вЂ|Ѓ|�" scripts src`
- If mojibake is detected, stop and fix encoding issues before finalizing changes.
