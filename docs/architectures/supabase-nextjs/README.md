# Arquitectura Supabase + Next.js

> **Idioma:** Español
> Guías de configuración específicas para proyectos Supabase (PostgreSQL + PostgREST) y Next.js.

---

## Vista General de la Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js App                          │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   API Routes    │    │   React/Pages   │                │
│  │  /api/custom/*  │    │   SSR/SSG/CSR   │                │
│  └────────┬────────┘    └────────┬────────┘                │
│           │                      │                          │
└───────────┼──────────────────────┼──────────────────────────┘
            │                      │
            ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     Plataforma Supabase                     │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │    PostgREST    │    │   Supabase Auth │                │
│  │  REST API auto  │    │   JWT tokens    │                │
│  └────────┬────────┘    └────────┬────────┘                │
│           │                      │                          │
│           ▼                      ▼                          │
│  ┌─────────────────────────────────────────┐               │
│  │              PostgreSQL                  │               │
│  │        (con políticas RLS)               │               │
│  └─────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

---

## Contenido

| Documento | Descripción | Estado |
|-----------|-------------|--------|
| [connection-setup.md](docs/architectures/supabase-nextjs/connection-setup.md) | Strings de conexión Supabase, config de pooler | ✅ Disponible |
| [auth-tokens.md](docs/architectures/supabase-nextjs/auth-tokens.md) | Cómo obtener tokens de autenticación Supabase | ✅ Disponible |
| [troubleshooting.md](docs/architectures/supabase-nextjs/troubleshooting.md) | Problemas comunes y soluciones | ✅ Disponible |

---

## Conceptos Clave

### Dos APIs en Un Proyecto

1. **Supabase REST API** (PostgREST)
   - Auto-generada desde el schema de la base de datos
   - URL: `https://<proyecto>.supabase.co/rest/v1/`
   - Usa `apikey` + JWT para autenticación

2. **Next.js API Routes**
   - Lógica de negocio personalizada
   - URL: `https://tu-app.com/api/`
   - Puede usar el mismo JWT o autenticación custom

### Flujo de Autenticación

```
Login Usuario → Supabase Auth → JWT Token → Usar para ambas APIs
```

---

## Inicio Rápido

1. **Obtener string de conexión:** Ver [connection-setup.md](docs/architectures/supabase-nextjs/connection-setup.md)
2. **Obtener tokens de auth:** Ver [auth-tokens.md](docs/architectures/supabase-nextjs/auth-tokens.md)
3. **¿Tienes problemas?** Revisa [troubleshooting.md](docs/architectures/supabase-nextjs/troubleshooting.md)

---

**Ver También:**
- `docs/testing/api/authentication.md` - Patrones genéricos de autenticación
- `docs/setup/mcp-dbhub.md` - Configuración de DBHub MCP (genérico)
