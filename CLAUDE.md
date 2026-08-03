# My Organizer (CSW.AI.OS)

## Purpose

Local web application used by V&V engineers to manage Excel workbooks, tasks, CCRs, TODOs, notes, and feedback.

## Core Rules

- Respond in English unless the user explicitly requests another language.
- Read only the documentation required for the current task.
- Keep changes minimal and focused.
- Reuse existing code and utilities whenever possible.
- Do not refactor unrelated areas.

## Critical Safety Rules

### Excel
- Never write to Excel using openpyxl.
- All workbook writes must use Excel COM.
- Never test against the production workbook.
- Use a dedicated test copy for Excel write validation.

### Environment
- Development work is performed only in the DEV workspace.
- Do not modify the stable user installation.
- Do not modify Windows Firewall or security configuration.

### Data
- Treat JSON state files as user data.
- Read before deleting or resetting data files.
- Do not include local state files in releases.

### Git
- Never force-push unless explicitly required by the release procedure.
- Never rewrite published history.
- Review changes before committing.

## Documentation Router

### Architecture
docs/architecture-overview.md

### Environment
docs/environment-folder-locations.md

### Excel & COM
docs/excel-com-integration.md

### Graph / OneDrive
docs/graph-integration.md

### Jira
docs/jira-integration.md

### Release Process
docs/release-procedure.md

### Feedback Workflow
docs/feedback-workflow.md

### Testing
docs/testing.md

### UI / Theme
docs/theme.md

### Coding Standards
docs/coding-standards.md

## Retrieval Strategy

Only load the document(s) required for the current task.

Examples:

- Excel synchronization issue:
  - docs/excel-com-integration.md

- Microsoft Graph problem:
  - docs/graph-integration.md

- Jira integration work:
  - docs/jira-integration.md

- Release preparation:
  - docs/release-procedure.md

- UI styling:
  - docs/theme.md

- General code changes:
  - docs/coding-standards.md

## Priority

1. User request
2. CLAUDE.md
3. Task-specific document(s)
4. AGENTS.md
5. CONTEXT.md