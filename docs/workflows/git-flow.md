# GitFlow Simplificado - Proyecto AI-Driven

> **Idioma:** Español
> **Nivel:** Introductorio
> **Audiencia:** QA Engineers trabajando con herramientas AI

---

## Filosofía del Flujo

Este proyecto usa un GitFlow adaptado para trabajar con inteligencia artificial. La AI genera código y lo commitea inteligentemente, pero **tú mantienes el control** en los puntos clave.

---

## Estructura de Branches

### main

Código de producción. Solo recibe merges desde `staging` a través de pull requests aprobados.

### staging

Branch de integración y testing. Aquí la AI commitea cambios agrupados mientras trabajas. Representa tu ambiente de QA/pre-producción.

### feature/nombre-tarea

Una branch por funcionalidad específica. La AI crea estas branches cuando inicias una nueva tarea.

**Ejemplos de nombres:**

- `feature/login-validation`
- `feature/dashboard-analytics`
- `feature/payment-integration`

---

## Ciclo Típico de Trabajo

### 1. Iniciar Nueva Tarea

```bash
# Desde staging
git checkout staging
git pull origin staging
git checkout -b feature/nombre-tarea
```

### 2. Desarrollo con AI

- Das instrucciones a la AI sobre qué construir
- La AI genera código y lo agrupa en commits semánticos
- Cada commit es pequeño, funcional e independiente

### 3. Commits Agrupados

La AI analiza cambios y propone commits separados:

**feat:** Nueva funcionalidad

```
feat: agregar validación de email en formulario
```

**fix:** Corrección de bugs

```
fix: corregir cálculo de descuento en checkout
```

**refactor:** Mejoras de código existente

```
refactor: optimizar queries de base de datos
```

**test:** Tests nuevos o modificados

```
test: agregar casos de prueba para login
```

**docs:** Documentación

```
docs: actualizar README con nuevas variables de entorno
```

### 4. Push Opcional

Después de cada grupo de commits, tú decides:

- **Push ahora:** Subir cambios al repo remoto
- **Continuar local:** Seguir iterando sin push

### 5. Pull Request

Cuando la feature está completa:

- Haces push final de la branch
- Creas PR desde `feature/nombre` hacia `staging` o `main`
- Revisas cambios en GitHub
- Apruebas y haces merge

---

## Ventajas de Este Sistema

| Ventaja | Descripción |
|---------|-------------|
| **Historial limpio** | Cada commit cuenta una historia clara de qué problema resolvió |
| **Reversibilidad** | Puedes revertir cambios específicos sin destruir todo el trabajo |
| **Control humano** | La AI ejecuta, pero tú decides cuándo y qué se sube |
| **Iteración rápida** | Trabajas localmente sin "contaminar" el repo hasta estar satisfecho |

---

## Flujo Visual

```
main ─────────────●─────────────●─────────────●
                   ↑             ↑             ↑
                   PR            PR            PR
                   │             │             │
staging ───●───●───●───●───●─────●───●───●─────●
            ↑   ↑       ↑   ↑
            │   │       │   │
feature/x ──●───●       │   │
                        │   │
feature/y ──────────────●───●
```

---

## Comandos Útiles

### Ver Estado Actual

```bash
git status
git log --oneline -10
```

### Ver Diferencias Antes de Commit

```bash
git diff
git diff --stat
```

### Revertir Último Commit (mantiene cambios)

```bash
git reset HEAD~1
```

### Ver Historial de Branches

```bash
git log --graph --oneline --all
```

---

## Buenas Prácticas

1. **Un commit = una responsabilidad:** No mezcles fix con features
2. **Mensajes claros:** Alguien debería entender qué hace sin ver el código
3. **Push frecuente en features largas:** No acumules días de trabajo sin backup
4. **PRs pequeños:** Más fáciles de revisar y aprobar
5. **Tests antes de merge:** Asegura que nada se rompe

---

## Integración con GitHub

Este flujo se potencia con GitHub MCP, que permite a la AI:

- Ver pull requests existentes
- Crear nuevos PRs con descripción automática
- Listar issues y vincularlos a commits
- Revisar estado de checks automáticos

Sin GitHub MCP configurado, el flujo funciona pero pierdes automatización en la parte de PRs.

---

## Convenciones de Commits

### Formato Estándar

```
<tipo>: <descripción breve>

[cuerpo opcional]

[footer opcional]
```

### Tipos de Commits

| Tipo | Uso |
|------|-----|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `refactor` | Reestructuración sin cambio de comportamiento |
| `test` | Agregar o modificar tests |
| `docs` | Solo documentación |
| `chore` | Tareas de mantenimiento |
| `style` | Formato, espacios, etc. (sin cambio de lógica) |

### Ejemplos Buenos vs Malos

```
✅ feat: implementar filtro de búsqueda por fecha
✅ fix: corregir validación de email vacío
✅ test: agregar casos edge para calculadora de precios

❌ update code
❌ fix stuff
❌ WIP
```

---

## Navegación

- [Ambientes](docs/workflows/environments.md) - Entender dev, staging, production
- [TMLC](docs/workflows/test-manual-lifecycle.md) - Ciclo de vida del testing manual
- [TALC](docs/workflows/test-automation-lifecycle.md) - Ciclo de vida de la automatización
