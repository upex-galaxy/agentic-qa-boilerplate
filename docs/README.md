# Project Documentation

Welcome to the **AI-Driven Software Project Template** documentation.

This documentation is oriented to **humans** - to learn concepts, understand architectures, and follow step-by-step guides.

> **Note**: For **AI-oriented** documentation, consult `.context/guidelines/`.

---

## Document Structure

```
docs/
├── architecture/          # Project architecture
│   └── ai-driven-blueprint.md
│
├── workflows/             # Workflows
│   ├── ambientes.md       # Development environments (dev, staging, prod)
│   └── git-flow-guide.md  # Git Flow guide
│
├── mcp/                   # Model Context Protocol
│   ├── README.md          # General MCP concepts
│   ├── builder-strategy.md
│   ├── claude-code.md
│   ├── gemini-cli.md
│   ├── copilot-cli.md
│   └── vscode.md
│
└── testing/               # Testing and QA
    ├── api-guide/         # API Testing (Supabase + Next.js)
    ├── database-guide/    # Database Testing with MCPs
    └── test-architecture/ # Testing architectures (KATA)
```

---

## Architecture

### [AI-Driven Software Project Blueprint](./architecture/ai-driven-blueprint.md)

Complete documentation of the methodology and project structure. Includes the 13 phases of AI-driven development (3 synchronous + 10 asynchronous).

---

## Workflows

### [Development Environments](./workflows/ambientes.md)

Educational guide on development environments:

- Local, Development, Staging, Production
- Differences between companies
- Relationship between Git branches and environments

### [Git Flow Guide](./workflows/git-flow-guide.md)

Tutorial on simplified Git Flow for working with AI:

- Branch structure (main, staging, feature/\*)
- Typical work cycle
- Semantic commits
- Pull Requests

---

## MCP (Model Context Protocol)

### [General Concepts](./mcp/README.md)

Introduction to MCP:

- What MCP is and how it works
- Types of transport (stdio, SSE, HTTP)
- Security and authentication
- Common use cases

### [MCP Builder Strategy](./mcp/builder-strategy.md)

Dynamic MCP configuration system:

- The "Token Hell" problem
- Session-based MCP loading
- Token usage optimization (80-90% reduction)

### Configuration by Tool

| Tool               | Document                               |
| ------------------ | -------------------------------------- |
| Claude Code        | [claude-code.md](./mcp/claude-code.md) |
| Gemini CLI         | [gemini-cli.md](./mcp/gemini-cli.md)   |
| GitHub Copilot CLI | [copilot-cli.md](./mcp/copilot-cli.md) |
| VS Code            | [vscode.md](./mcp/vscode.md)           |

---

## Testing

### [API Testing Guide](./testing/api-guide/README.md)

Complete API Testing guide for Supabase + Next.js projects:

| Document                                                       | Description                      |
| -------------------------------------------------------------- | -------------------------------- |
| [architecture.md](./testing/api-guide/architecture.md)         | Overview of the 2 APIs           |
| [authentication.md](./testing/api-guide/authentication.md)     | How to use tokens for both APIs  |
| [devtools-testing.md](./testing/api-guide/devtools-testing.md) | Manual testing with DevTools     |
| [postman-testing.md](./testing/api-guide/postman-testing.md)   | Testing with Postman             |
| [mcp-testing.md](./testing/api-guide/mcp-testing.md)           | AI-assisted testing              |
| [playwright-testing.md](./testing/api-guide/playwright-testing.md) | Automated testing            |

### [Database Testing Guide](./testing/database-guide/README.md)

Database testing guide with MCPs:

| Document                                                      | Description                    |
| ------------------------------------------------------------- | ------------------------------ |
| [concepts.md](./testing/database-guide/concepts.md)           | API vs DB testing concepts     |
| [mcp-dbhub.md](./testing/database-guide/mcp-dbhub.md)         | DBHub MCP configuration        |
| [mcp-openapi.md](./testing/database-guide/mcp-openapi.md)     | OpenAPI MCP configuration      |
| [troubleshooting.md](./testing/database-guide/troubleshooting.md) | Troubleshooting            |

### [Test Architecture](./testing/test-architecture/)

Conceptual documentation of testing architectures:

| Document                                                             | Description                             |
| -------------------------------------------------------------------- | --------------------------------------- |
| [kata-fundamentals.md](./testing/test-architecture/kata-fundamentals.md) | KATA Framework philosophy and concepts |

---

## Quick Start

### 1. Choose your AI tool

- Claude Code → [Configuration](./mcp/claude-code.md)
- Gemini CLI → [Configuration](./mcp/gemini-cli.md)
- GitHub Copilot CLI → [Configuration](./mcp/copilot-cli.md)
- VS Code → [Configuration](./mcp/vscode.md)

### 2. Configure MCP Builder

```bash
# Read the strategy
cat docs/mcp/builder-strategy.md

# Copy template
cp templates/mcp/gemini.template.json .gemini/settings.catalog.json

# Add your API keys to the copied file

# Run the builder
node scripts/mcp-builder.js backend
```

### 3. Start developing

- Follow the [Blueprint](./architecture/ai-driven-blueprint.md)
- Read the [workflows](./workflows/)
- Implement tests following the [testing guides](./testing/)

---

## Relationship with `.context/`

| Directory   | Audience | Purpose                                    |
| ----------- | -------- | ------------------------------------------ |
| `docs/`     | Humans   | Learning, tutorials, reference             |
| `.context/` | AI       | Guidelines, persistent memory, instructions |

**General rule**:

- If you need to **learn** something → `docs/`
- If AI needs to **remember** something → `.context/guidelines/`

---

## Contributing

To add documentation:

1. **Educational/Tutorial** → Add to appropriate `docs/`
2. **Guidelines for AI** → Add to `.context/guidelines/`
3. **Executable prompts** → Add to `.prompts/`

---

**Last updated**: 2025-01-29
