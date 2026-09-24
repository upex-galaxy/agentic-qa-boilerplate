# Documentación del Proyecto

> **Idioma:** Español

Bienvenido a la documentación del **AI-Driven Test Automation Boilerplate**.

Esta documentación está orientada a **humanos** - para aprender conceptos, entender metodologías y seguir guías paso a paso.

> **Nota**: Para documentación **orientada a AI**, consulta las skills en `.agents/skills/` (cada skill trae su propio `references/`).

---

## Empieza Aquí

| Documento | Descripción |
|-----------|-------------|
| [agentic-quality-engineering.md](agentic-quality-engineering.md) | **El documento por excelencia** — qué es esta práctica, cómo funciona, y qué entrega. Estrategia, arquitectura, skills, modelo de orquestación, KATA y quality gate en un solo lugar. |
| [Una fuente, tres harnesses](https://upex-galaxy.github.io/agentic-qa-boilerplate/harnesses.es.html) | Cómo el mismo repositorio corre en Claude Code, OpenCode y Codex desde una sola fuente: qué es canónico, qué se genera, y qué pasa al actualizar un proyecto creado antes del cambio. Página publicada, con diagramas. |
| [Harnesses del dev boilerplate](https://upex-galaxy.github.io/agentic-dev-boilerplate/harnesses.es.html) | La misma arquitectura vista desde el boilerplate de desarrollo: release del updater y tabla de paridad contra este repositorio. Página publicada. |
| [CONTEXT.md](../CONTEXT.md) | Estrategia de estructuración de contexto para AI (docs/ vs .context/ vs .agents/skills/). |

---

## Estructura de Documentos

```
docs/
├── methodology/              # Metodologías de testing
│   └── late-game-testing.md  # Fase de regresión
│
├── testing/                  # Guías de testing por tipo
│   ├── api/                  # Testing de APIs
│   └── database/             # Testing de base de datos
│
├── setup/                    # Guías de configuración
│   ├── mcp-dbhub.md          # Configuración de DBHub MCP
│   └── mcp-openapi.md        # Configuración de OpenAPI MCP
│
├── workflows/                # Flujos de trabajo
│   ├── environments.md       # Ambientes dev, staging, prod
│   ├── git-flow.md           # Flujo Git para desarrollo AI
│   ├── test-manual-lifecycle.md   # Flujo TMLC
│   └── test-automation-lifecycle.md # Flujo TALC
│
└── architectures/            # Guías específicas por stack
    └── supabase-nextjs/      # Configuración Supabase + Next.js
```

---

## Metodología

La metodología de testing está basada en **IQL (Integrated Quality Lifecycle)** con tres fases:

| Documento | Descripción |
|-----------|-------------|
| [Metodología IQL (sitio oficial)](https://upexgalaxy.com/metodologia) | Vista completa de IQL ([EN](https://upexgalaxy.com/en/methodology)) |
| [stage-gates.md](../.agents/skills/agentic-qa-core/references/stage-gates.md) | Las etapas con nombre, qué firma la persona y el Definition of Done de cada una |
| [late-game-testing.md](./methodology/late-game-testing.md) | Producción (Steps 10-15) |
| [kata-architecture.md](../.agents/skills/test-automation/references/kata-architecture.md) | Arquitectura KATA: capas, fixtures, ATCs |

---

## Guías de Testing

### [API Testing](./testing/api/)

| Documento | Descripción | Estado |
|-----------|-------------|--------|
| [postman-testing.md](./testing/api/postman-testing.md) | Testing con Postman | ✅ Disponible |
| [api-testing-doctrine.md](../.agents/skills/agentic-qa-core/references/api-testing-doctrine.md) | Maniobra canónica: schema por OpenAPI MCP, token con `bun run api:login`, ejecución con curl | ✅ Disponible |

### [Database Testing](./testing/database/)

| Documento | Descripción | Estado |
|-----------|-------------|--------|
| [data-validation-testing.md](./testing/database/data-validation-testing.md) | Validación de datos en DB | ✅ Disponible |
| [db-testing-doctrine.md](../.agents/skills/agentic-qa-core/references/db-testing-doctrine.md) | Maniobra canónica: DBHub MCP, `dbhub.toml`, cookbook de queries, troubleshooting | ✅ Disponible |

### Test Automation

La guía de automatización vive en las referencias del skill `/test-automation`, que es lo que la AI carga al escribir tests:

| Documento | Descripción |
|-----------|-------------|
| [kata-architecture.md](../.agents/skills/test-automation/references/kata-architecture.md) | Capas KATA, fixtures, ATCs, Steps, migración de una suite existente |
| [ci-integration.md](../.agents/skills/test-automation/references/ci-integration.md) | `playwright.config.ts`, proyectos, reporters, comandos |
| [api-patterns.md](../.agents/skills/test-automation/references/api-patterns.md) | API testing con Playwright + KATA |
| [test-data-management.md](../.agents/skills/test-automation/references/test-data-management.md) | `DataFactory`, fixtures JSON, datos por test |

---

## Guías de Configuración

| Documento | Descripción |
|-----------|-------------|
| [mcp-dbhub.md](./setup/mcp-dbhub.md) | DBHub MCP para exploración de base de datos |
| [mcp-openapi.md](./setup/mcp-openapi.md) | OpenAPI MCP para schema de APIs |

---

## Workflows

| Documento | Descripción | Estado |
|-----------|-------------|--------|
| [environments.md](./workflows/environments.md) | Guía de ambientes de desarrollo | ✅ Disponible |
| [git-flow.md](./workflows/git-flow.md) | Flujo Git para desarrollo AI | ✅ Disponible |
| [test-manual-lifecycle.md](./workflows/test-manual-lifecycle.md) | TMLC - Flujo de testing manual | ✅ Disponible |
| [test-automation-lifecycle.md](./workflows/test-automation-lifecycle.md) | TALC - Flujo de automatización | ✅ Disponible |

---

## Guías Específicas por Arquitectura

Guías para stacks tecnológicos específicos:

| Arquitectura | Descripción | Ruta |
|--------------|-------------|------|

> **Nota**: Los conceptos genéricos de testing pertenecen a `testing/`. Solo las configuraciones específicas de cada stack van en `architectures/`.

---

## Inicio Rápido

### 1. Entender la Metodología

Lee la [Metodología IQL](https://upexgalaxy.com/metodologia) para entender las fases de testing.

### 2. Configurar Tus Herramientas

Configura los MCPs que necesites:
- Acceso a base de datos: [mcp-dbhub.md](./setup/mcp-dbhub.md)
- Schema de API: [mcp-openapi.md](./setup/mcp-openapi.md)

### 3. Aprender Patrones de Testing

Elige según tus necesidades de testing:
- Testing de APIs → [testing/api/](./testing/api/)
- Testing de base de datos → [testing/database/](./testing/database/)
- Automatización de tests → [kata-architecture.md](../.agents/skills/test-automation/references/kata-architecture.md)

### 4. Seguir los Workflows

- [Flujo Git](./workflows/git-flow.md) para control de versiones
- [Ambientes](./workflows/environments.md) para etapas de deployment

---

## Relación con `.context/`

| Directorio | Audiencia | Propósito |
|------------|-----------|-----------|
| `docs/` | Humanos | Aprendizaje, tutoriales, referencia |
| `.context/` | AI | Guidelines, memoria persistente, instrucciones |

**Regla general**:

- Si necesitas **aprender** algo → `docs/`
- Si la AI necesita **recordar** algo → skills en `.agents/skills/`

---

## Contribuir

Para agregar documentación:

1. **Educacional/Tutorial** → Agregar al subdirectorio apropiado de `docs/`
2. **Guidelines/flujos para AI** → Agregar como skill o reference en `.agents/skills/`

### Agregar Nuevas Arquitecturas

1. Crear carpeta: `docs/architectures/{nombre-stack}/`
2. Agregar `README.md` con overview de la arquitectura
3. Agregar guías de configuración específicas
4. Mantener conceptos genéricos en `docs/testing/`

---

**Última actualización**: 2026-02-12
