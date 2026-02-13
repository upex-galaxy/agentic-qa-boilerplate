# Ambientes de Desarrollo - Guía para QA Engineers

> **Idioma:** Español
> **Nivel:** Introductorio
> **Audiencia:** QA Engineers que necesitan entender los ambientes de desarrollo

---

## ¿Qué son los ambientes?

Un ambiente es una **copia independiente de tu aplicación** donde se ejecuta el código. Cada ambiente tiene su propia base de datos, configuración y propósito específico.

Los ambientes te permiten probar cambios sin afectar a usuarios reales. Son como ensayar una obra de teatro antes de la noche de estreno.

---

## Los 4 Ambientes Estándar de la Industria

### 1. Development (dev)

**Propósito:** Desarrollo activo de código.

Aquí es donde los desarrolladores escriben nuevas funcionalidades, experimentan y hacen cambios frecuentes. El código puede romperse varias veces al día.

**Características:**

- Cambios constantes
- Tests básicos (unitarios, integración)
- Datos de prueba simples
- Puede estar temporalmente "roto"

**Quién lo usa:** Principalmente desarrolladores

**Ejemplo real:** Un dev está creando un nuevo formulario de login. Lo prueba aquí primero antes de compartirlo.

---

### 2. Staging (stage/pre-prod)

**Propósito:** Testing formal antes de producción.

Es una **réplica casi exacta de producción**. Aquí se ejecutan todas las pruebas de QA, validaciones y ensayos finales.

**Características:**

- Réplica de producción (mismo SO, versiones, configuración)
- Datos similares a producción (pero no reales)
- Tests completos de QA
- La estabilidad es importante

**Quién lo usa:** QA Engineers, Product Owners, Stakeholders

**Ejemplo real:** Terminaste de automatizar tests de checkout. Los ejecutas en staging porque imita exactamente cómo funciona producción.

---

### 3. Production (prod)

**Propósito:** Usuarios reales usando la aplicación.

El ambiente que ven tus clientes. **Nunca hagas tests aquí**, solo monitoreo.

**Características:**

- Usuarios reales
- Datos reales
- Máxima estabilidad requerida
- Monitoreo 24/7
- Rollback rápido si algo falla

**Quién lo usa:** Usuarios finales

**Ejemplo real:** Tu e-commerce procesando compras reales de clientes reales.

---

### 4. Local (tu computadora)

**Propósito:** Desarrollo y testing individual.

Técnicamente no es un "ambiente compartido", pero es donde pasas la mayor parte de tu tiempo como QA.

**Características:**

- Solo tú lo ves
- Puedes romper todo sin consecuencias
- Iteración rápida
- Datos de prueba personalizados

**Quién lo usa:** Cada desarrollador/QA en su máquina

**Ejemplo real:** Estás escribiendo un test de Playwright. Lo ejecutas localmente 20 veces hasta que funciona perfectamente.

---

## Flujo Típico del Código

```
Local → Development → Staging → Production
  ↓          ↓           ↓           ↓
 Dev       Devs         QA       Usuarios
tests    integran    validan       usan
```

**Paso a paso:**

1. **Local:** Escribes código/tests en tu computadora
2. **Development:** Commit y push, se integra con el código de otros
3. **Staging:** El equipo valida que todo funcione correctamente
4. **Production:** Si staging pasa, se despliega a usuarios reales

---

## Variaciones en Empresas

No todas las empresas usan los mismos nombres o cantidad de ambientes.

### Empresas pequeñas (startup)

```
Local → Staging → Production
```

Solo 2 ambientes compartidos. Development y staging están combinados.

### Empresas medianas (más común)

```
Local → Development → Staging → Production
```

El estándar de la industria.

### Empresas grandes (enterprise)

```
Local → Development → QA → Staging → Production
```

Ambiente QA separado para testing extensivo. Staging solo para validación final.

### Empresas muy grandes (tech giants)

```
Local → Dev → QA → Staging → Canary → Production
```

Múltiples ambientes intermedios. "Canary" despliega a un pequeño % de usuarios reales primero.

---

## Ambientes en Este Template

Para este proyecto educativo, usamos **3 ambientes**:

### Local (tu máquina)

Aquí desarrollas y pruebas tus tests de automatización.

### Staging (branch `staging`)

Ambiente de integración donde todos los cambios son validados antes de producción.

**Este es tu ambiente principal de trabajo como QA.**

### Production (branch `main`)

Código estable y aprobado.

---

## Por Qué NO Usamos "qa" Como Nombre de Branch

Aunque algunas empresas tienen ambientes llamados "qa", **staging es el término estándar** que encontrarás en:

- 90% de las ofertas de trabajo
- Documentación de CI/CD (GitHub Actions, GitLab CI, Jenkins)
- Tutoriales y cursos
- Convenciones de la industria

Los QA engineers **trabajan en staging**, no necesitan un ambiente separado llamado "qa".

---

## Cómo Se Relacionan las Branches de Git con los Ambientes

Cada branch usualmente tiene un ambiente asociado:

```
Git Branch           Ambiente           Auto-deploy?
─────────────────────────────────────────────────────
feature/login    →    Local              No
staging          →    Staging            Sí (automático)
main             →    Production         Sí (con aprobación)
```

**Auto-deploy:** Cuando haces push a `staging`, automáticamente se despliega al ambiente staging via CI/CD.

---

## Configuración por Ambiente

Cada ambiente tiene su propia configuración:

**Development/Staging:**

```
DATABASE_URL=postgres://staging-db.empresa.com
API_KEY=test_key_12345
DEBUG_MODE=true
```

**Production:**

```
DATABASE_URL=postgres://prod-db.empresa.com
API_KEY=live_key_67890
DEBUG_MODE=false
```

Esto se maneja con archivos `.env` o variables de entorno en el servidor.

---

## Testing en Cada Ambiente

### Local

- Tests unitarios
- Tests de componentes
- Debugging de tests

### Staging

- Suites completas de tests (E2E)
- Testing de regresión
- Testing básico de rendimiento
- Validación de nuevas features

### Production

- **NO se ejecutan tests**
- Solo monitoreo y alertas
- Smoke tests post-deploy (verificación rápida)

---

## Datos en Cada Ambiente

### Local

Datos ficticios que tú creas. Puedes resetearlos cuando quieras.

### Staging

Datos de prueba realistas pero no reales. Usuarios ficticios con nombres como "Usuario Test 1".

**Importante:** Nunca uses datos reales de clientes en staging.

### Production

Datos reales de usuarios reales. Protegidos por leyes (GDPR, etc).

---

## Errores Comunes a Evitar

**❌ Hacer tests en producción**
Nunca ejecutes tests experimentales en producción. Siempre usa staging.

**❌ Usar datos de producción en staging**
Violarías la privacidad de usuarios y posibles regulaciones legales.

**❌ Hacer push directamente a main**
Siempre pasa por staging primero.

**❌ Asumir que staging = producción**
Aunque son similares, pueden tener diferencias sutiles. Monitorea producción post-deploy.

---

## Vocabulario que Escucharás

| Término | Significado |
|---------|-------------|
| **Deploy** | Subir código a un ambiente |
| **Rollback** | Volver a versión anterior si algo falla |
| **Hotfix** | Corrección urgente que va directo a producción |
| **Smoke test** | Test rápido de funcionalidad básica |
| **Sanity test** | Similar a smoke test, verifica que el sistema está "sano" |

---

## Preguntas Frecuentes

**¿Por qué no puedo hacer tests en producción?**
Porque afectarías a usuarios reales. Un bug en un test puede borrar datos, crashear la app, o crear una mala experiencia.

**¿Staging siempre es idéntico a producción?**
Idealmente sí, pero a veces hay diferencias en recursos (staging usa servidores más pequeños para ahorrar costos).

**¿Cuántos ambientes son suficientes?**
Para aprender: Local + Staging + Production es perfecto. En trabajo real, depende del tamaño de la empresa.

**¿Qué pasa si encuentro un bug en producción?**
Se crea un hotfix inmediato. Algunos equipos lo prueban rápidamente en staging primero, otros van directo a producción si es urgente.

---

## Recursos para Profundizar

- **The Twelve-Factor App** - Best practices para aplicaciones modernas
- **GitFlow Workflow** - Estrategia de branching más detallada
- **CI/CD Pipelines** - Automatización de deploys entre ambientes

---

## Resumen Ejecutivo

Los ambientes te protegen de errores costosos. Pruebas localmente, integras en staging, despliegas a producción solo cuando todo está validado.

**Como QA Engineer, tu ambiente principal es staging.** Ahí ejecutas tus suites de tests, validas features, y aseguras calidad antes de que el código llegue a usuarios reales.

El mercado usa principalmente: Local → Dev → Staging → Production.

Este template usa: Local → Staging → Production (simplificado para aprendizaje).

---

## Navegación

- [Git Flow](./git-flow.md) - Flujo de trabajo con Git
- [TMLC](./test-manual-lifecycle.md) - Ciclo de vida del testing manual
- [TALC](./test-automation-lifecycle.md) - Ciclo de vida de la automatización
