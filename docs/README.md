# Documentación del Proyecto

> **Idioma:** Español

Bienvenido a la documentación del **AI-Driven Test Automation Boilerplate**.

Esta documentación está orientada a **humanos** - para aprender conceptos, entender metodologías y seguir guías paso a paso.

> **Nota**: Para documentación **orientada a AI**, consulta `.context/guidelines/`.

---

## Estructura de Documentos

```
docs/
├── methodology/              # Metodologías de testing
│   ├── IQL-methodology.md    # Integrated Quality Lifecycle
│   ├── early-game-testing.md # Fase shift-left
│   ├── mid-game-testing.md   # Fase de desarrollo activo
│   ├── late-game-testing.md  # Fase de regresión
│   └── kata-fundamentals.md  # Filosofía del framework KATA
│
├── testing/                  # Guías de testing por tipo
│   ├── api/                  # Testing de APIs
│   ├── database/             # Testing de base de datos
│   └── automation/           # Automatización de tests
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
| [IQL-methodology.md](./methodology/IQL-methodology.md) | Vista completa de IQL |
| [early-game-testing.md](./methodology/early-game-testing.md) | Testing shift-left (Steps 1-4) |
| [mid-game-testing.md](./methodology/mid-game-testing.md) | Automatización (Steps 5-9) |
| [late-game-testing.md](./methodology/late-game-testing.md) | Producción (Steps 10-15) |
| [kata-fundamentals.md](./methodology/kata-fundamentals.md) | Filosofía del framework KATA |

---

## Guías de Testing

### [API Testing](./testing/api/)

| Documento | Descripción | Estado |
|-----------|-------------|--------|
| [authentication.md](./testing/api/authentication.md) | Patrones de autenticación de APIs | ✅ Disponible |
| [contract-testing.md](./testing/api/contract-testing.md) | Contract testing con OpenAPI/Zod | ✅ Disponible |
| [devtools-testing.md](./testing/api/devtools-testing.md) | Testing manual con DevTools | ✅ Disponible |
| [postman-testing.md](./testing/api/postman-testing.md) | Testing con Postman | ✅ Disponible |

### [Database Testing](./testing/database/)

| Documento | Descripción | Estado |
|-----------|-------------|--------|
| [fundamentals.md](./testing/database/fundamentals.md) | Conceptos API vs DB testing | ✅ Disponible |

### [Test Automation](./testing/automation/)

| Documento | Descripción | Estado |
|-----------|-------------|--------|
| [dependency-injection.md](./testing/automation/dependency-injection.md) | Estrategia DI en arquitectura de tests | ✅ Disponible |
| [playwright-framework.md](./testing/automation/playwright-framework.md) | Guía de proyectos Playwright | ✅ Disponible |
| [playwright-api-testing.md](./testing/automation/playwright-api-testing.md) | API testing con Playwright + KATA | ✅ Disponible |

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
| **Supabase + Next.js** | PostgreSQL + PostgREST + Next.js | [supabase-nextjs/](./architectures/supabase-nextjs/) |

> **Nota**: Los conceptos genéricos de testing pertenecen a `testing/`. Solo las configuraciones específicas de cada stack van en `architectures/`.

---

## Inicio Rápido

### 1. Entender la Metodología

Lee la [Metodología IQL](./methodology/IQL-methodology.md) para entender las fases de testing.

### 2. Configurar Tus Herramientas

Configura los MCPs que necesites:
- Acceso a base de datos: [mcp-dbhub.md](./setup/mcp-dbhub.md)
- Schema de API: [mcp-openapi.md](./setup/mcp-openapi.md)

### 3. Aprender Patrones de Testing

Elige según tus necesidades de testing:
- Testing de APIs → [testing/api/](./testing/api/)
- Testing de base de datos → [testing/database/](./testing/database/)
- Automatización de tests → [testing/automation/](./testing/automation/)

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
- Si la AI necesita **recordar** algo → `.context/guidelines/`

---

## Contribuir

Para agregar documentación:

1. **Educacional/Tutorial** → Agregar al subdirectorio apropiado de `docs/`
2. **Guidelines para AI** → Agregar a `.context/guidelines/`
3. **Prompts ejecutables** → Agregar a `.prompts/`

### Agregar Nuevas Arquitecturas

1. Crear carpeta: `docs/architectures/{nombre-stack}/`
2. Agregar `README.md` con overview de la arquitectura
3. Agregar guías de configuración específicas
4. Mantener conceptos genéricos en `docs/testing/`

---

**Última actualización**: 2026-02-12
