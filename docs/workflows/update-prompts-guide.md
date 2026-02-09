# Update Template - Usage Guide

This guide explains how to use the `update-prompts.js` script to keep your project synchronized with the UPEX template.

---

## Initial Setup (one time only)

### 1. Install GitHub CLI

```bash
# Mac
brew install gh

# Windows
winget install GitHub.cli

# Linux (Ubuntu/Debian)
sudo apt install gh
```

### 2. Authenticate in GitHub CLI

```bash
gh auth login
```

Select:

- GitHub.com
- HTTPS
- Login with web browser
- Copy the 8-digit code
- Paste it in the browser

### 3. Verify template access

```bash
gh repo view upex-galaxy/ai-driven-project-starter
```

If you see the repo info, all set.

### 4. Install dependencies

```bash
bun install
```

### 5. Add script to package.json

```json
{
  "scripts": {
    "up": "bun scripts/update-prompts.js"
  }
}
```

### 6. Add .backups to .gitignore

```
.backups
```

---

## Script Usage

### Interactive Menu (recommended)

```bash
bun up
```

Opens a menu where you can select what to update:

- All (all)
- Prompts (.prompts/)
- Documentation (docs/)
- Context (.context/)
- MCP Templates (templates/mcp/)
- Update scripts

### Direct Commands

```bash
bun up all                    # Update everything
bun up prompts                # Menu to choose phases
bun up docs                   # Update docs/
bun up context                # Update .context/ (formerly 'guidelines')
bun up templates              # Update templates/mcp/
bun up scripts                # Update scripts
bun up help                   # Show help
```

### Multiple Components

```bash
bun up prompts docs context   # Update the 3 components
```

---

## Options for Prompts

When you use `bun up prompts`, you can specify which phases to update:

### By Role (presets)

```bash
bun up prompts --rol qa       # Phases 5, 10, 11, 12 (Testing)
bun up prompts --rol qa-full  # Phases 4, 5, 10, 11, 12 (Testing + Specification)
bun up prompts --rol dev      # Phases 6, 7, 8 (Development)
bun up prompts --rol devops   # Phases 3, 9, 13, 14 (Infrastructure)
bun up prompts --rol po       # Phases 1, 2, 4 (Product)
bun up prompts --rol setup    # Phases 1, 2, 3 (Initial setup)
```

### By Specific Phases

```bash
bun up prompts --fase 5       # Only phase 5
bun up prompts --fase 5,10,12 # Phases 5, 10, and 12
```

### Other Options

```bash
bun up prompts --all          # All phases (1-14) + standalone
bun up prompts --standalone   # Only standalone files (git-flow, workflows)
```

---

## Available Roles

| Role      | Phases           | Description                                        |
| --------- | ---------------- | -------------------------------------------------- |
| `qa`      | 5, 10, 11, 12    | Shift-Left, Exploratory, Documentation, Automation |
| `qa-full` | 4, 5, 10, 11, 12 | QA + Specification (business context)              |
| `dev`     | 6, 7, 8          | Planning, Implementation, Code Review              |
| `devops`  | 3, 9, 13, 14     | Infrastructure, Staging, Production, Monitoring    |
| `po`      | 1, 2, 4          | Constitution, Architecture, Specification          |
| `setup`   | 1, 2, 3          | Initial synchronous phases                         |

---

## Smart Merge

The script uses **smart merge**:

- **Only updates template files** - If a file exists in the template, it gets updated
- **Preserves your files** - If you created your own files/folders, they're not touched
- **Never deletes** - Only adds or updates, never removes

### Example

If you have in `docs/testing/`:

```
docs/testing/
├── api-guide/           # From template - GETS UPDATED
├── database-guide/      # From template - GETS UPDATED
├── my-custom-guide.md   # Yours - NOT TOUCHED
└── my-tests/            # Yours - NOT TOUCHED
```

---

## What Gets Updated

### Updated (merge)

| Component                | Content                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `.prompts/`              | Selected phases + standalone files                           |
| `docs/`                  | architecture/, mcp/, testing/, workflows/, README.md         |
| `.context/`              | system-prompt.md, README.md, guidelines/ (DEV, QA, TAE, MCP) |
| `templates/mcp/`         | All MCP configuration templates                              |
| `scripts/`               | update-prompts.js, mcp-builder.js, email-checker.js          |
| `context-engineering.md` | Template architecture documentation                          |

### NOT touched (your work)

| Directory        | Description                       |
| ---------------- | --------------------------------- |
| `.context/idea/` | Your business documentation       |
| `.context/PRD/`  | Your product requirements         |
| `.context/SRS/`  | Your technical specifications     |
| `.context/PBI/`  | Your product backlog              |
| `src/`           | Your code                         |
| `.env`           | Your credentials                  |
| Custom files     | Any files/folders you have created |

---

## Backup System

Each execution creates an automatic backup:

- Format: `.backups/update-YYYY-MM-DD-HHMMSS/`
- Backups are NOT overwritten, they accumulate
- Useful for comparing versions or reverting changes

### Restore a Backup

```bash
# View available backups
ls -la .backups/

# Restore (replace the date)
cp -r .backups/update-2025-XX-XX-XXXXXX/.prompts .
cp -r .backups/update-2025-XX-XX-XXXXXX/docs .
cp -r .backups/update-2025-XX-XX-XXXXXX/.context .
```

---

## Troubleshooting

### "gh: command not found"

```bash
# Install GitHub CLI according to your OS
brew install gh        # Mac
winget install GitHub.cli  # Windows
sudo apt install gh    # Linux
```

### "authentication required"

```bash
gh auth login
```

### "repository not found"

Verify that you have access to UPEX Galaxy's private repository.

### "Cannot find module '@inquirer/prompts'"

```bash
bun install
# Or specifically:
bun add @inquirer/prompts
```

---

## Tips

- Use `bun up` without arguments for the interactive menu
- The script **preserves your personalized files**
- Backups are saved automatically
- Use `bun up help` to see all options

---

**See also:**

- [Git Flow Guide](./git-flow-guide.md)
- [Environments](./ambientes.md)
