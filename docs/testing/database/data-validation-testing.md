# Data Validation Testing

> **Idioma:** Español
> **Nivel:** Intermedio
> **Audiencia:** QA Engineers que necesitan validar datos en base de datos

---

## ¿Qué es Data Validation Testing?

**Data Validation Testing** verifica que los datos almacenados en la base de datos son correctos, consistentes y cumplen con las reglas de negocio.

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATA VALIDATION TESTING                      │
│                                                                  │
│   ┌─────────┐     ┌─────────┐     ┌─────────┐                   │
│   │ Acción  │────▶│   API   │────▶│   DB    │                   │
│   │(UI/API) │     │(Process)│     │(Store)  │                   │
│   └─────────┘     └─────────┘     └────┬────┘                   │
│                                        │                         │
│                                        ▼                         │
│                                  ┌──────────┐                    │
│                                  │ Validar  │ ◀── Tú estás aquí │
│                                  │  datos   │                    │
│                                  └──────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## ¿Por qué Validar Datos en DB?

| Problema | Sin validación de datos |
|----------|------------------------|
| **Datos corruptos** | No detectados hasta que un usuario reporta |
| **Inconsistencias** | Totales que no cuadran, referencias rotas |
| **Bugs silenciosos** | La API dice "OK" pero los datos están mal |
| **Reglas violadas** | Constraints de negocio no respetados |

### El API puede mentir

```
API Response: 201 Created ✅
{
  "message": "Order created successfully",
  "order_id": "ord_123"
}

Realidad en DB:
- order_items está vacío (bug en el backend)
- total es 0 cuando debería ser $150
- user_id es NULL (constraint violado)
```

La única forma de estar **seguro** es verificar directamente en la base de datos.

---

## Tipos de Validación

### 1. Validación de Existencia

Verificar que los datos **existen**:

```sql
-- ¿Se creó el usuario?
SELECT COUNT(*) FROM users WHERE email = 'test@example.com';
-- Esperado: 1

-- ¿Se crearon los items de la orden?
SELECT COUNT(*) FROM order_items WHERE order_id = 'ord_123';
-- Esperado: > 0
```

### 2. Validación de Valores

Verificar que los valores son **correctos**:

```sql
-- ¿El total de la orden es correcto?
SELECT
  o.total as stored_total,
  SUM(oi.price * oi.quantity) as calculated_total
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
WHERE o.id = 'ord_123'
GROUP BY o.id;
-- Esperado: stored_total = calculated_total

-- ¿El descuento se aplicó correctamente?
SELECT
  subtotal,
  discount_amount,
  total,
  subtotal - discount_amount as expected_total
FROM orders
WHERE id = 'ord_123';
-- Esperado: total = expected_total
```

### 3. Validación de Integridad

Verificar **relaciones** entre tablas:

```sql
-- ¿Hay órdenes sin usuario? (datos huérfanos)
SELECT * FROM orders
WHERE user_id NOT IN (SELECT id FROM users);
-- Esperado: 0 rows

-- ¿Hay items sin orden?
SELECT * FROM order_items
WHERE order_id NOT IN (SELECT id FROM orders);
-- Esperado: 0 rows
```

### 4. Validación de Timestamps

Verificar **tiempos** correctos:

```sql
-- ¿El created_at es reciente? (último minuto)
SELECT * FROM users
WHERE email = 'test@example.com'
AND created_at > NOW() - INTERVAL '1 minute';
-- Esperado: 1 row

-- ¿El updated_at se actualizó después del update?
SELECT * FROM users
WHERE id = 'usr_123'
AND updated_at > created_at;
-- Esperado: 1 row (si hubo update)
```

### 5. Validación de Side Effects

Verificar **efectos secundarios** (triggers, cascades):

```sql
-- Si se eliminó un usuario, ¿se eliminaron sus datos relacionados?
DELETE FROM users WHERE id = 'usr_123';

SELECT COUNT(*) FROM orders WHERE user_id = 'usr_123';
-- Esperado: 0 (si hay ON DELETE CASCADE)

SELECT COUNT(*) FROM sessions WHERE user_id = 'usr_123';
-- Esperado: 0

SELECT COUNT(*) FROM notifications WHERE user_id = 'usr_123';
-- Esperado: 0
```

---

## Estrategias de Validación

### Estrategia 1: Snapshot Before/After

Capturar estado antes y después de una acción:

```typescript
test('order creation updates inventory', async () => {
  // BEFORE: Capturar stock actual
  const beforeStock = await db.query(`
    SELECT stock FROM products WHERE id = 'prod_123'
  `);

  // ACTION: Crear orden que consume 5 unidades
  await api.post('/orders', {
    items: [{ product_id: 'prod_123', quantity: 5 }]
  });

  // AFTER: Verificar que stock disminuyó
  const afterStock = await db.query(`
    SELECT stock FROM products WHERE id = 'prod_123'
  `);

  expect(afterStock.rows[0].stock).toBe(beforeStock.rows[0].stock - 5);
});
```

### Estrategia 2: Comparación con Fuente de Verdad

Comparar datos calculados vs almacenados:

```typescript
test('order total matches sum of items', async () => {
  const orderId = 'ord_123';

  const result = await db.query(`
    SELECT
      o.total as stored_total,
      COALESCE(SUM(oi.price * oi.quantity), 0) as calculated_total
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.id = $1
    GROUP BY o.id
  `, [orderId]);

  expect(result.rows[0].stored_total)
    .toBe(result.rows[0].calculated_total);
});
```

### Estrategia 3: Validación de Constraints

Verificar que las constraints de negocio se respetan:

```typescript
test('user cannot have negative balance', async () => {
  const result = await db.query(`
    SELECT COUNT(*) as invalid_count
    FROM wallets
    WHERE balance < 0
  `);

  expect(result.rows[0].invalid_count).toBe(0);
});
```

### Estrategia 4: Cross-Table Validation

Verificar consistencia entre múltiples tablas:

```typescript
test('all orders have at least one item', async () => {
  const result = await db.query(`
    SELECT o.id
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.status != 'cancelled'
    GROUP BY o.id
    HAVING COUNT(oi.id) = 0
  `);

  expect(result.rows).toHaveLength(0);
});
```

---

## Queries Útiles para Validación

### Detectar Duplicados

```sql
-- Emails duplicados
SELECT email, COUNT(*)
FROM users
GROUP BY email
HAVING COUNT(*) > 1;

-- Órdenes duplicadas (mismo usuario, mismo día, mismo total)
SELECT user_id, DATE(created_at), total, COUNT(*)
FROM orders
GROUP BY user_id, DATE(created_at), total
HAVING COUNT(*) > 1;
```

### Detectar Datos Huérfanos

```sql
-- Foreign keys rotas
SELECT oi.*
FROM order_items oi
LEFT JOIN orders o ON oi.order_id = o.id
WHERE o.id IS NULL;

-- Referencias a usuarios eliminados
SELECT * FROM orders
WHERE user_id NOT IN (SELECT id FROM users);
```

### Detectar Inconsistencias Numéricas

```sql
-- Totales que no cuadran
SELECT
  o.id,
  o.total,
  SUM(oi.price * oi.quantity) as calculated
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id
HAVING o.total != SUM(oi.price * oi.quantity);

-- Porcentajes que no suman 100%
SELECT category_id, SUM(percentage)
FROM allocations
GROUP BY category_id
HAVING SUM(percentage) != 100;
```

### Detectar Timestamps Inválidos

```sql
-- created_at en el futuro
SELECT * FROM users
WHERE created_at > NOW();

-- updated_at antes que created_at
SELECT * FROM products
WHERE updated_at < created_at;

-- Timestamps NULL cuando no deberían
SELECT * FROM orders
WHERE created_at IS NULL;
```

---

## Integración con Tests Automatizados

### Playwright + PostgreSQL

```typescript
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

test.describe('Order Data Validation', () => {

  test('checkout creates valid order data', async ({ page, request }) => {
    // 1. Realizar acción (checkout via UI o API)
    const orderResponse = await request.post('/api/checkout', {
      data: { items: [{ product_id: 'prod_1', quantity: 2 }] }
    });
    const { order_id } = await orderResponse.json();

    // 2. Validar en DB
    const orderResult = await pool.query(`
      SELECT o.*, COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = $1
      GROUP BY o.id
    `, [order_id]);

    const order = orderResult.rows[0];

    // 3. Assertions
    expect(order).toBeDefined();
    expect(order.status).toBe('pending');
    expect(order.item_count).toBe(1);
    expect(parseFloat(order.total)).toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    await pool.end();
  });
});
```

### Usando MCP para Validación Manual

Con el MCP de DBHub puedes hacer validaciones durante exploratory testing:

```
Usuario: "Acabo de crear una orden. ¿Puedes verificar que los datos están correctos?"

AI Assistant:
SELECT o.*,
       array_agg(oi.product_id) as products,
       SUM(oi.quantity) as total_items
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
WHERE o.created_at > NOW() - INTERVAL '5 minutes'
GROUP BY o.id;
```

---

## Validación por Tipo de Test

### Unit Tests (DB)
- Validar triggers funcionan
- Validar constraints se aplican
- Validar defaults se setean

### Integration Tests
- Validar que API guarda datos correctamente
- Validar side effects (triggers, cascades)
- Validar transacciones completan o rollback

### E2E Tests
- Validar flujo completo crea datos esperados
- Validar datos persisten correctamente
- Validar múltiples tablas afectadas

---

## Checklist de Data Validation

```
[ ] Datos existen en las tablas correctas
[ ] Valores numéricos son correctos (totales, cantidades)
[ ] Relaciones FK son válidas
[ ] Timestamps son razonables
[ ] No hay datos huérfanos
[ ] No hay duplicados inesperados
[ ] Constraints de negocio se respetan
[ ] Side effects (triggers) ejecutaron correctamente
[ ] Transacciones completaron o rollback apropiado
```

---

## Próximos Pasos

1. **Conectarse a DB:** [connection-db.md](./connection-db.md) - Configurar conexiones
2. **Setup MCP:** [../../setup/mcp-dbhub.md](../../setup/mcp-dbhub.md) - Habilitar DB en AI assistant
3. **API vs DB Testing:** [fundamentals.md](./fundamentals.md) - Cuándo usar cada approach

---

## Referencias

- [Database Testing Best Practices](https://www.guru99.com/database-testing.html)
- [PostgreSQL Testing Patterns](https://www.postgresql.org/docs/current/regress.html)
