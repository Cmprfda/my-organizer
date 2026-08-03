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
manifest = []

#
# Clean previously generated files
#
for f in OUT.glob("*.md"):
    f.unlink()

for f in OUT.glob("*.json"):
    f.unlink()


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
        end = (
            matches[i + 1].start()
            if i + 1 < len(matches)
            else len(content)
        )

        title = match.group(1)
        body = content[start:end].strip()

        sections.append((title, body))

    return sections


#
# Keeps track of filenames already used during this run
#
generated_names = {}

for md_file in ROOT.rglob("*.md"):

    #
    # Skip generated docs
    #
    if OUT in md_file.parents:
        continue

    content = md_file.read_text(
        encoding="utf-8",
        errors="ignore"
    )

    sections = split_sections(content)

    for title, body in sections:

        if len(body) < SECTION_MIN_SIZE:
            continue

        digest = hashlib.md5(
            body.encode("utf-8")
        ).hexdigest()

        #
        # Skip duplicate content
        #
        if digest in section_map:
            continue

        base_name = slugify(
            re.sub(r"^#+\s*", "", title)
        )

        if not base_name:
            base_name = "untitled"

        #
        # Only create -2/-3 when there are duplicate
        # section titles in the SAME execution
        #
        count = generated_names.get(base_name, 0)

        if count == 0:
            filename = f"{base_name}.md"
        else:
            filename = f"{base_name}-{count + 1}.md"

        generated_names[base_name] = count + 1

        out_file = OUT / filename

        out_file.write_text(
            body,
            encoding="utf-8"
        )

        section_map[digest] = filename

        manifest.append({
            "source": str(md_file),
            "section": title,
            "file": filename,
            "chars": len(body)
        })


#
# Build root document indexes
#
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

    (OUT / f"{root_doc}.index.md").write_text(
        "\n".join(content),
        encoding="utf-8"
    )


#
# Build context index
#
context_index = [
    "# Context Index",
    "",
    "Load only the required file.",
    ""
]

for item in sorted(manifest, key=lambda x: x["file"]):
    context_index.append(
        f"- {item['section']} -> {item['file']}"
    )

(OUT / "context-index.md").write_text(
    "\n".join(context_index),
    encoding="utf-8"
)


#
# Save manifest
#
(OUT / "manifest.json").write_text(
    json.dumps(
        manifest,
        indent=2,
        ensure_ascii=False
    ),
    encoding="utf-8"
)

print()
print("========== Documentation Split Report ==========")
print(f"Generated sections : {len(manifest)}")
print(f"Generated files    : {len(list(OUT.glob('*.md')))}")
print(f"Manifest           : {OUT / 'manifest.json'}")
print(f"Index              : {OUT / 'context-index.md'}")
print()
print("Done.")