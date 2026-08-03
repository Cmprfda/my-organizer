#!/usr/bin/env python3

import re
import json
import hashlib
from pathlib import Path

ROOT = Path(".")
OUT = ROOT / "docs"

OUT.mkdir(exist_ok=True)

SECTION_MIN_SIZE = 500

section_map = {}
section_refs = {}
manifest = []

def slugify(text):
    text = re.sub(r"[^\w\s-]", "", text)
    text = text.strip().lower()
    return re.sub(r"[-\s]+", "-", text)

def split_sections(content):
    pattern = re.compile(r"^(#{1,2}\s+.+)$", re.MULTILINE)

    matches = list(pattern.finditer(content))

    if not matches:
        return [("root", content)]

    sections = []

    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)

        title = match.group(1)
        body = content[start:end].strip()

        sections.append((title, body))

    return sections

for md_file in ROOT.rglob("*.md"):

    if "docs" in md_file.parts:
        continue

    content = md_file.read_text(
        encoding="utf-8",
        errors="ignore"
    )

    sections = split_sections(content)

    links = []

    for title, body in sections:

        if len(body) < SECTION_MIN_SIZE:
            continue

        digest = hashlib.md5(
            body.encode("utf-8")
        ).hexdigest()

        if digest in section_map:
            section_refs[digest] = section_map[digest]
            continue

        name = slugify(
            re.sub(r"^#+\s*", "", title)
        )

        out_file = OUT / f"{name}.md"

        counter = 1
        while out_file.exists():
            counter += 1
            out_file = OUT / f"{name}-{counter}.md"

        out_file.write_text(
            body,
            encoding="utf-8"
        )

        section_map[digest] = out_file.name

        links.append(out_file.name)

        manifest.append({
            "source": str(md_file),
            "section": title,
            "file": out_file.name,
            "chars": len(body)
        })

for root_doc in [
    "CLAUDE.md",
    "CONTEXT.md",
    "AGENTS.md"
]:

    path = ROOT / root_doc

    if not path.exists():
        continue

    content = [
        f"# {root_doc}",
        "",
        "Optimized for retrieval.",
        "",
        "Load only the required document:",
        ""
    ]

    for m in manifest:
        if m["source"].endswith(root_doc):
            content.append(
                f"- {m['section']} -> docs/{m['file']}"
            )

    new_file = OUT / f"{root_doc}.index.md"

    new_file.write_text(
        "\n".join(content),
        encoding="utf-8"
    )

(OUT / "manifest.json").write_text(
    json.dumps(
        manifest,
        indent=2,
        ensure_ascii=False
    ),
    encoding="utf-8"
)

print(f"{len(manifest)} documents created.")