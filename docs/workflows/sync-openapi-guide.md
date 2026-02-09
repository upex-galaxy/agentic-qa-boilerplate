# Sync OpenAPI - Usage Guide

This guide explains how to use the `sync-openapi.ts` script to synchronize OpenAPI specifications from remote repositories.

---

## When to use this script

Use `sync-openapi.ts` when:

- Your backend team maintains the OpenAPI spec in their repository
- You need to keep the spec synchronized with your testing project
- You want to generate TypeScript types from the spec

**Don't use this script if:**

- You define your schemas with Zod (use `zod-to-openapi` instead)
- You use Supabase (has auto-spec at `/rest/v1/?apikey=...`)

---

## Initial Setup

### 1. Verify GitHub CLI

```bash
gh --version
gh auth status
```

If not authenticated:

```bash
gh auth login
```

### 2. Verify repository access

```bash
gh repo view owner/backend-repo
```

---

## Script Usage

### Interactive Mode (first time)

```bash
bun run api:sync
```

The script will ask you:

1. **Repository (owner/repo):** E.g. `myorg/backend-api`
2. **Branch:** E.g. `main` or `develop`
3. **Path to OpenAPI file:** E.g. `docs/openapi.yaml`

The configuration is saved in `api/.openapi-config.json` for future executions.

### Use saved configuration

```bash
bun run api:sync --config
# or
bun run api:sync -c
```

### Synchronize and generate TypeScript types

```bash
bun run api:sync -c --generate-types
# or
bun run api:sync -c -t
```

This generates `api/types.ts` using `openapi-typescript`.

---

## Generated files

| File                       | Description                  |
| -------------------------- | ---------------------------- |
| `api/.openapi-config.json` | Saved configuration          |
| `api/openapi.yaml`         | Downloaded spec              |
| `api/types.ts`             | TypeScript types (with `-t`) |

---

## Configuration example

```json
{
  "repo": "myorg/backend-api",
  "branch": "main",
  "filePath": "docs/openapi.yaml",
  "lastSync": "2025-01-29T10:30:00.000Z"
}
```

---

## Next steps

After syncing, you can:

### Option A: Configure MCP for AI testing

Use the downloaded spec with `@ivotoby/openapi-mcp-server`:

```json
{
  "mcpServers": {
    "api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server"],
      "env": {
        "OPENAPI_SPEC_PATH": "./api/openapi.yaml",
        "API_BASE_URL": "https://your-api.com",
        "API_HEADERS": "Authorization:Bearer YOUR_TOKEN"
      }
    }
  }
}
```

See: [MCP OpenAPI Configuration](../testing/database-guide/mcp-openapi.md)

### Option B: Use types in Playwright tests

```typescript
import type { paths } from '../api/types';

type UserResponse = paths['/users/{id}']['get']['responses']['200']['content']['application/json'];
```

### Option C: Contract testing with Zod

See: [OpenAPI + Zod Contract Testing](../testing/api-guide/openapi-zod-contract-testing.md)

---

## Troubleshooting

### "gh: command not found"

```bash
# Mac
brew install gh

# Windows
winget install GitHub.cli

# Linux
sudo apt install gh
```

### "authentication required"

```bash
gh auth login
```

### "Not Found" when downloading

Verify:

1. The repository exists and you have access
2. The branch is correct
3. The file path is correct

```bash
# Verify the file exists
gh api /repos/owner/repo/contents/path/to/openapi.yaml
```

---

## Related flows

| Flow                | When to use it                 | Document                                                                                |
| ------------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| **sync-openapi.ts** | External backend has the spec  | This document                                                                           |
| **Zod-to-OpenAPI**  | You define schemas with Zod    | [openapi-zod-contract-testing.md](../testing/api-guide/openapi-zod-contract-testing.md) |
| **MCP OpenAPI**     | AI testing with any spec       | [mcp-openapi.md](../testing/database-guide/mcp-openapi.md)                              |

---

**See also:**

- [MCP Builder Strategy](../mcp/builder-strategy.md)
- [Update Prompts Guide](./update-prompts-guide.md)
