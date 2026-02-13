# Mid-Game Testing

> **Idioma:** Español
> **Fase IQL 2** · Continuous Testing · Agile Testing · AI-Driven

## Overview

**"¿El software cumple los requisitos?"**

Fase de **Detección** - Enfoque en detectar defectos antes del release a través de testing estructurado.

La **segunda fase del Integrated Quality Lifecycle** donde el **QA Automation Engineer** lidera la implementación técnica. Como en gaming: **consolidar la ventaja del early-game** y prepararse para el late-game.

---

## Mid-Game: Segunda Fase de IQL

**Mid-Game Testing** es la fase central del **Integrated Quality Lifecycle** donde se implementa la estrategia de testing definida en Early-Game.

### Posición en la Línea de Tiempo de IQL

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ●══════════════════════════════════════════════════════════▶   │
│                                                                 │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐│
│  │  EARLY-GAME     │──▶│   MID-GAME      │──▶│   LATE-GAME     ││
│  │  Completado     │   │   ✅ FASE ACTUAL │   │   Siguiente     ││
│  │                 │   │                 │   │                 ││
│  │  Steps 1-4      │   │   Steps 5-9     │   │   Steps 10-15   ││
│  │  QA Analyst     │   │   QA Automation │   │   QA + DevOps   ││
│  └─────────────────┘   └─────────────────┘   └─────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Características del Mid-Game

| Aspecto           | Detalle                      |
| ----------------- | ---------------------------- |
| **Steps**         | 5-9 de IQL                   |
| **Enfoques**      | Continuous, Agile, AI-Driven |
| **Rol Principal** | QA Automation Engineer       |
| **Herramientas**  | Playwright, Jenkins, CI/CD   |

> _"⚡ Mid-Game: Implementación y Automatización"_
>
> Como en los MOBAs, **el mid-game es donde consolidas la ventaja** obtenida en el early-game. En IQL, esta fase **implementa técnicamente la estrategia de testing** para crear un sistema robusto de detección continua de defectos.

---

## Los 5 Steps del Mid-Game Testing

**Mid-Game Testing** se ejecuta a través de **5 steps específicos** correspondientes a los Steps 5-9 de IQL.

> _"Transición del TMLC (Test Manual Life Cycle) al TALC (Test Automation Life Cycle) con enfoque en automatización y CI/CD."_

### Step 5: Documentación Asíncrona de Test Cases

**TMLC - Test Manual Life Cycle (4to Stage)**

Crear tickets 'Test' formales para cada escenario con script priorizado, sin bloquear la entrega de la US.

**Actividades Clave:**

- El estado normalmente comienza como 'Draft'
- QA documenta pasos de test, datos y resultados esperados en tickets 'Test'
- Cada ticket se vincula al Epic Test Repository en Jira para gestión centralizada

**Resultado Esperado:**
Un backlog saludable de test cases de alto valor, listos para ejecución manual o automatizada.

**Herramientas:** Jira, Xray, Confluence

---

### Step 6: Assessment de Tests Candidatos a Automatización

**TALC - Test Automation Life Cycle (1er Stage)**

Revisar test cases recién documentados para determinar si deben automatizarse.

**Actividades Clave:**

- El test pasa a estado 'In Review'
- QA Automation inspecciona cada ticket 'Test' para verificar factibilidad
- Si es viable, se marca como 'Candidate'; de lo contrario, permanece como 'Manual'
- El Automation Backlog se actualiza correspondientemente

**Resultado Esperado:**
Clara diferenciación entre tests manuales y candidatos a automatización.

**Herramientas:** Jira, Xray, Claude Code

---

### Step 7: Automatización de Test Cases Candidatos

**TALC - Test Automation Life Cycle (2do Stage) - Modelo TAUS**

Convertir tests candidatos en scripts automatizados para CI usando el modelo TAUS.

**Actividades Clave:**

- Transiciones de estado: Candidate → In Automation
- Se crea una nueva branch, se implementan los scripts de test
- Los cambios se pushean siguiendo el patrón TAUS

**Resultado Esperado:**
Tests con scripts listos para integración continua.

**Herramientas:** GitHub, Playwright, Cypress, Docker

---

### Step 8: Verificación de Tests Automatizados en CI

**TALC - Test Automation Life Cycle (3er Stage)**

Validar nuevos tests automatizados en el pipeline de Integración Continua.

**Actividades Clave:**

- La suite de tests automatizados corre en CI (nightly builds o cada commit)
- Confirmar que los tests pasan de forma estable (sin flakiness)
- Cualquier fallo o problema de script se corrige rápidamente

**Resultado Esperado:**
Tests automatizados estables integrados confiablemente en CI/CD.

**Herramientas:** GitHub Actions, Docker, Slack

---

### Step 9: Code Review de Tests (Pull Request)

**TALC - Test Automation Life Cycle (4to Stage)**

Crear un Pull Request detallado para revisión y aprobación de nuevos tests automatizados.

**Actividades Clave:**

- Transiciones de Estado: Merge Request → Automated
- Se crea un Pull Request detallando los nuevos cambios del Repository
- El Pull Request es revisado y aprobado por otro QA/Dev
- El Merge se realiza una vez aprobado

**Resultado Esperado:**
Pull Request MERGED. Tests automatizados estables integrados confiablemente en CI/CD.

**Herramientas:** GitHub, Visual Studio Code, Cursor

---

## Pirámide de Automatización de Tests

**Arquitectura estratégica** para organizar la automatización de tests con **balance entre velocidad, cobertura y mantenimiento**.

```
                    ┌─────────────┐
                    │  E2E UI     │  10%
                    │   Tests     │  Más lentos pero comprensivos
                    └─────────────┘
               ┌─────────────────────────┐
               │    Integration/Service   │  20%
               │         Tests            │  Velocidad media, buena cobertura
               └─────────────────────────┘
    ┌─────────────────────────────────────────────────┐
    │                 Unit Tests                       │  70%
    │          Extremadamente rápidos                  │  Devs testean funciones/
    │                                                  │  componentes individuales
    └─────────────────────────────────────────────────┘
```

### Capas de la Pirámide

#### E2E UI Tests (10%)

- **Descripción:** Automatizar escenarios BDD, simular journeys completos de usuario
- **Características:** Más lentos pero comprensivos
- **Ejemplos:** Flujo de login, Workflow de compra, Registro de usuario

#### Integration/Service Tests (20%)

- **Descripción:** Testear interacciones entre componentes/microservicios
- **Características:** Velocidad media, buena cobertura
- **Ejemplos:** Integración de API, Operaciones de base de datos, Comunicación de servicios

#### Unit Tests (70%)

- **Descripción:** Developers testean funciones/componentes individuales
- **Características:** Extremadamente rápidos
- **Ejemplos:** Validación de funciones, Aislamiento de componentes, Lógica de negocio

### Por qué Funciona la Pirámide

| Aspecto                         | Beneficio                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| **Velocidad Optimizada**        | 70% unit tests se ejecutan en segundos, proporcionando feedback inmediato          |
| **Cobertura Inteligente**       | Cada capa cubre diferentes aspectos: lógica, integración y experiencia de usuario  |
| **Mantenimiento Sostenible**    | Menos tests E2E significa menos fragilidad y esfuerzo de mantenimiento             |

---

## Los 4 Enfoques del Mid-Game Testing

**Mid-Game Testing** integra cuatro enfoques complementarios que trabajan en sinergia para crear un **sistema de detección robusto**.

### Continuous Testing

- **Descripción:** Testing automatizado integrado en pipelines CI/CD para feedback inmediato en cada cambio.
- **Beneficio:** Feedback Instantáneo

### Agile Testing

- **Descripción:** Ciclos de testing rápidos y eficientes dentro de sprints para acelerar la entrega.
- **Beneficio:** Velocidad Optimizada

### Exploratory Testing

- **Descripción:** Aprovechar la inteligencia humana para encontrar problemas inesperados que la automatización no detecta.
- **Beneficio:** Cobertura Inteligente

### AI-Driven Testing

- **Descripción:** Usar inteligencia artificial para acelerar y mejorar las actividades de testing.
- **Beneficio:** Poder Amplificado

> _"⚡ Mid-Game: Consolidando la Ventaja"_
>
> Estos **cuatro enfoques integrados** permiten al QA Automation Engineer construir un **sistema de detección continua** que consolida la ventaja estratégica obtenida en Early-Game y prepara el terreno para el éxito en Late-Game.

---

## Herramientas del Mid-Game

| Categoría             | Herramientas                 |
| --------------------- | ---------------------------- |
| **Test Management**   | Jira, Xray, Confluence       |
| **Automatización**    | Playwright, Cypress          |
| **CI/CD**             | GitHub Actions, Docker       |
| **IDE**               | Visual Studio Code, Cursor   |
| **Asistencia AI**     | Claude Code                  |
| **Comunicación**      | Slack                        |

---

## Navegación

- [Metodología IQL](./IQL-methodology.md) - Vista completa del Integrated Quality Lifecycle
- [Early-Game Testing](./early-game-testing.md) - Fase 1: Prevención y estrategia temprana
- [Late-Game Testing](./late-game-testing.md) - Fase 3: Observación y producción
