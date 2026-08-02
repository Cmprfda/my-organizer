import re
from datetime import datetime
from pathlib import Path

ACTIVE_TASKS = Path("tasks/active.md")
ARCHIVE_TASKS = Path("tasks/archive.md")

def archive_completed_tasks():
    if not ACTIVE_TASKS.exists():
        print(f"Error: {ACTIVE_TASKS} not found.")
        return

    content = ACTIVE_TASKS.read_text(encoding="utf-8").splitlines()

    active_lines = []
    completed_lines = []

    for line in content:
        # Matches "- [x]" or "* [x]" (case-insensitive)
        if re.match(r"^\s*[\-\*]\s*\[[xX]\]", line):
            completed_lines.append(line)
        else:
            active_lines.append(line)

    if not completed_lines:
        print("No completed tasks found to archive.")
        return

    # Write back remaining active tasks
    ACTIVE_TASKS.write_text("\n".join(active_lines) + "\n", encoding="utf-8")

    # Append completed tasks to archive with timestamp
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    archive_header = f"\n\n### Archived on {timestamp}\n"
    archive_content = archive_header + "\n".join(completed_lines)

    with open(ARCHIVE_TASKS, "a", encoding="utf-8") as f:
        f.write(archive_content)

    print(f"Archived {len(completed_lines)} completed task(s) to {ARCHIVE_TASKS}.")

if __name__ == "__main__":
    archive_completed_tasks()
