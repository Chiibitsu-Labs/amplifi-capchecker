#!/usr/bin/env python3
"""Assert that a plain-text pg_dump actually contains the records it exists to protect.

A backup job can run nightly, succeed, encrypt cleanly, and store a dump with no
rows in it — a schema change, a wrong connection string, or a `--schema-only`
typo all produce a file that looks fine and restores to nothing. An absence of
evidence is not a pass, so this fails loudly at zero.

Usage:
    verify_dump.py DUMP.sql schema.table[:min_rows] [schema.table[:min_rows] ...]

`min_rows` defaults to 1. Exit 0 if every named table has a CREATE TABLE and at
least `min_rows` data rows in its COPY block; exit 1 otherwise.
"""

from __future__ import annotations

import re
import sys

# COPY "public"."capchecker_checkins" ("id", ...) FROM stdin;
# COPY public.capchecker_checkins (id, ...) FROM stdin;
COPY_RE = re.compile(
    r'^COPY\s+"?(?P<schema>[^".\s]+)"?\."?(?P<table>[^".\s(]+)"?\s*\(.*\)\s+FROM\s+stdin;',
    re.IGNORECASE,
)
CREATE_RE = re.compile(
    r'^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(?P<schema>[^".\s]+)"?\.'
    r'"?(?P<table>[^".\s(]+)"?',
    re.IGNORECASE,
)


def parse_requirements(args: list[str]) -> dict[str, int]:
    """Turn ['public.foo', 'public.bar:5'] into {'public.foo': 1, 'public.bar': 5}."""
    required: dict[str, int] = {}
    for spec in args:
        name, _, minimum = spec.partition(":")
        name = name.strip()
        if "." not in name:
            sys.exit(f"error: '{spec}' must be qualified as schema.table")
        try:
            required[name] = int(minimum) if minimum else 1
        except ValueError:
            sys.exit(f"error: '{spec}' has a non-numeric row minimum")
    return required


def scan(path: str) -> tuple[dict[str, int], set[str]]:
    """Return per-table COPY row counts and the set of tables with a CREATE TABLE."""
    counts: dict[str, int] = {}
    created: set[str] = set()
    current: str | None = None

    with open(path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if current is not None:
                # A lone backslash-dot terminates the COPY data block.
                if line.rstrip("\n") == r"\.":
                    current = None
                else:
                    counts[current] += 1
                continue

            if line.startswith("COPY "):
                match = COPY_RE.match(line)
                if match:
                    current = f"{match['schema']}.{match['table']}"
                    counts.setdefault(current, 0)
            elif line.startswith("CREATE TABLE"):
                match = CREATE_RE.match(line)
                if match:
                    created.add(f"{match['schema']}.{match['table']}")

    if current is not None:
        # The file ended mid-COPY: the dump was cut short.
        sys.exit(f"error: dump ends inside the COPY block for {current} — truncated file")

    return counts, created


def main() -> int:
    if len(sys.argv) < 3:
        sys.exit(__doc__)

    dump_path = sys.argv[1]
    required = parse_requirements(sys.argv[2:])
    counts, created = scan(dump_path)

    failures: list[str] = []
    width = max(len(name) for name in required)

    print(f"Checking {len(required)} critical table(s) in {dump_path}:")
    for name, minimum in sorted(required.items()):
        rows = counts.get(name)
        if name not in created:
            failures.append(f"{name}: no CREATE TABLE in the dump (table missing or excluded)")
            status = "MISSING SCHEMA"
        elif rows is None:
            failures.append(f"{name}: no COPY block in the dump (schema-only dump?)")
            status = "NO DATA BLOCK"
        elif rows < minimum:
            failures.append(f"{name}: {rows} row(s), expected at least {minimum}")
            status = f"FAIL {rows} < {minimum}"
        else:
            status = f"ok  {rows} row(s)"
        print(f"  {name:<{width}}  {status}")

    other = {k: v for k, v in counts.items() if k not in required and v > 0}
    print(f"\n{len(counts)} table(s) with a COPY block; {len(other)} non-empty table(s) beyond the critical list.")

    if failures:
        print("\nThe dump does NOT contain the records it exists to protect:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1

    print("\nAll critical tables present and non-empty.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
