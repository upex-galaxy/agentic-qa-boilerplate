# Testing de APIs con Postman

> **Idioma:** Español
> **Nivel:** Introductorio a Intermedio
> **Audiencia:** QA Engineers que quieren organizar y automatizar testing manual de APIs

---

## ¿Por qué Postman?

Postman te permite:
- **Organizar** requests en colecciones reutilizables
- **Parametrizar** con variables de entorno
- **Automatizar** validaciones con scripts
- **Compartir** colecciones con el equipo
- **Ejecutar** suites de tests en CI/CD

```
┌─────────────────────────────────────────────────────────────────┐
│                    ESTRUCTURA EN POSTMAN                         │
│                                                                  │
│   Workspace                                                      │
│   └── Collection (API de Mi Proyecto)                           │
│       ├── Folder: Auth                                          │
│       │   ├── Login                                             │
│       │   └── Refresh Token                                     │
│       ├── Folder: Users                                         │
│       │   ├── Get Users                                         │
│       │   └── Update Profile                                    │
│       └── Folder: Orders                                        │
│           ├── List Orders                                       │
│           └── Create Order                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Setup Inicial

### 1. Crear Workspace

1. Abre Postman
2. Workspaces > Create Workspace
3. Nombre: "Mi Proyecto API"
4. Tipo: Personal o Team

### 2. Crear Environment

Environments > Create Environment > "Development"

**Variables básicas:**

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `base_url` | `https://api.example.com` | URL base de la API |
| `api_url` | `{{base_url}}/api` | Prefijo de endpoints |
| `access_token` | _(vacío)_ | Se llena automáticamente |
| `user_id` | _(vacío)_ | Se llena automáticamente |
| `test_email` | `qa@example.com` | Email de usuario de test |
| `test_password` | `SecurePass123!` | Password de usuario de test |

### 3. Crear Collection

Collections > Create Collection > "Mi Proyecto API"

---

## Estructura de Requests

### Request de Login

**Configuración:**
- Name: `Login`
- Method: `POST`
- URL: `{{base_url}}/auth/login`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "{{test_email}}",
  "password": "{{test_password}}"
}
```

**Tests (JavaScript):**
```javascript
// Validar respuesta exitosa
pm.test('Login exitoso', function () {
  pm.response.to.have.status(200);
});

// Guardar token automáticamente
pm.test('Token recibido', function () {
  const response = pm.response.json();

  // Guardar access_token para otros requests
  pm.environment.set('access_token', response.access_token);

  // Guardar user_id
  pm.environment.set('user_id', response.user.id);

  console.log('✅ Token guardado para:', response.user.email);
});
```

### Request Autenticado (GET)

**Configuración:**
- Name: `Get My Orders`
- Method: `GET`
- URL: `{{api_url}}/orders?user_id={{user_id}}`

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Tests:**
```javascript
pm.test('Status 200', function () {
  pm.response.to.have.status(200);
});

pm.test('Response es array', function () {
  const response = pm.response.json();
  pm.expect(response).to.be.an('array');
});

pm.test('Orders pertenecen al usuario', function () {
  const orders = pm.response.json();
  const userId = pm.environment.get('user_id');

  orders.forEach(order => {
    pm.expect(order.user_id).to.equal(userId);
  });
});
```

### Request de Creación (POST)

**Configuración:**
- Name: `Create Order`
- Method: `POST`
- URL: `{{api_url}}/orders`

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body:**
```json
{
  "user_id": "{{user_id}}",
  "items": [
    {
      "product_id": "{{product_id}}",
      "quantity": 2
    }
  ],
  "shipping_address": {
    "street": "123 Test Street",
    "city": "Test City",
    "zip": "12345"
  }
}
```

**Tests:**
```javascript
pm.test('Status 201 Created', function () {
  pm.response.to.have.status(201);
});

pm.test('Order creada correctamente', function () {
  const response = pm.response.json();

  pm.expect(response).to.have.property('id');
  pm.expect(response.status).to.equal('pending');

  // Guardar para cleanup
  pm.environment.set('new_order_id', response.id);
});
```

---

## Variables y Encadenamiento

### Variables de Postman

```javascript
// Variables de entorno (persisten entre requests)
pm.environment.set('key', 'value');
pm.environment.get('key');

// Variables de colección (compartidas en la colección)
pm.collectionVariables.set('key', 'value');

// Variables globales (compartidas entre colecciones)
pm.globals.set('key', 'value');
```

### Variables Dinámicas Built-in

```json
{
  "id": "{{$guid}}",
  "timestamp": "{{$timestamp}}",
  "random": "{{$randomInt}}",
  "email": "{{$randomEmail}}",
  "name": "{{$randomFullName}}"
}
```

### Encadenar Requests

**Request A - Tests:**
```javascript
// Guardar ID del recurso creado
const response = pm.response.json();
pm.environment.set('product_id', response.id);
```

**Request B - URL:**
```
{{api_url}}/products/{{product_id}}
```

---

## Scripts Avanzados

### Pre-request Script

Se ejecuta ANTES del request:

```javascript
// Verificar que tenemos token
const token = pm.environment.get('access_token');

if (!token) {
  console.warn('⚠️ No hay token. Ejecuta Login primero.');
}

// Verificar expiración del token
if (token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000;

    if (Date.now() > exp) {
      console.warn('⚠️ Token expirado. Ejecuta Refresh Token.');
    }
  } catch (e) {
    // Token malformado
  }
}
```

### Tests con Chai Assertions

```javascript
// Estructura del response
pm.test('Estructura correcta', function () {
  const response = pm.response.json();

  pm.expect(response).to.have.property('id');
  pm.expect(response).to.have.property('name');
  pm.expect(response.price).to.be.a('number');
  pm.expect(response.tags).to.be.an('array');
});

// Validar valores
pm.test('Valores correctos', function () {
  const response = pm.response.json();

  pm.expect(response.price).to.be.above(0);
  pm.expect(response.name).to.not.be.empty;
  pm.expect(response.status).to.be.oneOf(['active', 'pending', 'inactive']);
});
```

### Validar JSON Schema

```javascript
const schema = {
  type: 'object',
  required: ['id', 'name', 'price'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    price: { type: 'number' }
  }
};

pm.test('Schema válido', function () {
  pm.response.to.have.jsonSchema(schema);
});
```

---

## Testing de Permisos

### Test: Sin Autenticación

```javascript
// Request sin Authorization header
pm.test('Rechaza sin token', function () {
  pm.response.to.have.status(401);
});
```

### Test: Acceso a Datos de Otro Usuario

```javascript
// Intentar acceder a datos de otro usuario
pm.test('No puede ver datos de otro usuario', function () {
  pm.response.to.have.status(200);
  const data = pm.response.json();

  // Debería devolver array vacío o 403
  pm.expect(data).to.be.an('array');
  pm.expect(data).to.have.lengthOf(0);
});
```

---

## Collection Runner

### Ejecutar Suite Completa

1. Click en "..." de la colección
2. Run collection
3. Configurar:
   - Environment: Seleccionar
   - Delay: 100ms (evitar rate limiting)
   - Iterations: 1
4. Run

### Orden Recomendado

Organiza los requests en orden de dependencia:

```
1. Auth/
   └── Login ← Primero, obtiene token

2. Setup/
   ├── Get Products ← Obtiene product_id
   └── Get Categories

3. CRUD Tests/
   ├── Create Order ← Usa product_id
   ├── Get Order
   ├── Update Order
   └── Delete Order

4. Permission Tests/
   └── Access Other User Data
```

---

## Visualizar Responses

```javascript
// En la pestaña Tests
const template = `
<style>
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background-color: #4CAF50; color: white; }
</style>

<h3>Products</h3>
<table>
  <tr>
    <th>ID</th>
    <th>Name</th>
    <th>Price</th>
  </tr>
  {{#each response}}
  <tr>
    <td>{{id}}</td>
    <td>{{name}}</td>
    <td>\${{price}}</td>
  </tr>
  {{/each}}
</table>
`;

pm.visualizer.set(template, { response: pm.response.json() });
```

---

## Export e Import

### Exportar Collection

1. Click derecho en la colección
2. Export
3. Formato: Collection v2.1
4. Guardar como: `my-project-api.postman_collection.json`

### Exportar Environment

1. Click en el ojo junto al environment
2. Export
3. Guardar como: `my-project-dev.postman_environment.json`

### Importar en Otra Máquina

1. Import > Upload Files
2. Seleccionar los JSON
3. Ajustar variables (passwords, keys)

---

## Integración con CI/CD (Newman)

Newman es el CLI de Postman:

```bash
# Instalar
npm install -g newman

# Ejecutar colección
newman run my-project-api.postman_collection.json \
  -e my-project-dev.postman_environment.json \
  --reporters cli,html \
  --reporter-html-export report.html
```

### GitHub Actions

```yaml
# .github/workflows/api-tests.yml
name: API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Newman
        run: npm install -g newman newman-reporter-html

      - name: Run Postman Tests
        run: |
          newman run postman/collection.json \
            -e postman/environment.json \
            --reporters cli,html \
            --reporter-html-export newman-report.html

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: newman-report
          path: newman-report.html
```

---

## Tips y Buenas Prácticas

### 1. Usa Folders para Organizar

```
Collection/
├── Auth/
├── Users/
├── Products/
├── Orders/
└── Admin/
```

### 2. Nombra Requests Claramente

```
✅ "Login - Customer"
✅ "Create Order (Happy Path)"
✅ "Get Orders - Filter by Date"

❌ "test1"
❌ "request"
```

### 3. Documenta los Requests

Click en el request > Documentation para agregar descripción.

### 4. Usa Variables, No Hardcode

```
✅ {{base_url}}/api/orders/{{order_id}}
❌ https://api.prod.com/api/orders/abc123
```

### 5. Guarda Colecciones en Git

```
project/
├── postman/
│   ├── collection.json
│   ├── dev.environment.json
│   └── staging.environment.json
```

---

## Próximos Pasos

- [devtools-testing.md](docs/testing/api/devtools-testing.md) - Capturar requests del browser
- [authentication.md](docs/testing/api/authentication.md) - Patrones de autenticación
- [fundamentals.md](docs/testing/api/fundamentals.md) - Conceptos de API testing

---

## Referencias

- [Postman Learning Center](https://learning.postman.com/)
- [Newman CLI](https://www.npmjs.com/package/newman)
- [Postman Test Scripts](https://learning.postman.com/docs/writing-scripts/test-scripts/)
