# Automated API Testing with Playwright

This guide explains how to implement automated API tests following the project's KATA architecture.

---

## KATA Architecture for API Testing

### Layer Structure

```
Layer 5: Test Files (tests/integration/*.spec.ts)
    |
Layer 4: Fixture (ApiFixture - dependency injection)
    |
Layer 3: API Components (OrdersApi, ProductsApi, UsersApi)
    |
Layer 2: ApiBase (generic HTTP helpers)
    |
Layer 1: TestContext (configuration, logger, HTTP client)
```

### Directory Structure

```
tests/
|-- components/
|   |-- api/                    # Layer 3: API Components
|   |   |-- base/
|   |   |   +-- api-base.ts     # Layer 2: Base class
|   |   |-- auth-api.ts         # Authentication
|   |   |-- users-api.ts        # Users
|   |   |-- products-api.ts     # Products
|   |   |-- orders-api.ts       # Orders
|   |   |-- reviews-api.ts      # Reviews
|   |   +-- index.ts            # Exports
|   +-- preconditions/
|       +-- auth-precondition.ts
|-- fixtures/
|   +-- api-fixture.ts          # Layer 4: Fixture
|-- integration/                 # Layer 5: Test files
|   |-- auth.spec.ts
|   |-- users.spec.ts
|   |-- products.spec.ts
|   |-- orders.spec.ts
|   +-- reviews.spec.ts
|-- data/
|   +-- fixtures/
|       +-- test-users.ts       # Test data
+-- utils/
    +-- test-context.ts         # Layer 1: Context
```

---

## Layer 1: Test Context

```typescript
// tests/utils/test-context.ts
import { APIRequestContext } from '@playwright/test';

export interface TestConfig {
  baseUrl: string;
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  projectRef: string;
  testUsers: {
    customer: { email: string; password: string };
    admin: { email: string; password: string };
  };
}

export const testConfig: TestConfig = {
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  apiUrl: process.env.API_URL || 'http://localhost:3000/api',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  projectRef: process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0] || '',
  testUsers: {
    customer: {
      email: process.env.TEST_USER_EMAIL || 'test.customer@example.com',
      password: process.env.TEST_USER_PASSWORD || 'Customer123!',
    },
    admin: {
      email: process.env.TEST_ADMIN_EMAIL || 'test.admin@example.com',
      password: process.env.TEST_ADMIN_PASSWORD || 'Admin123!',
    },
  },
};

export class TestContext {
  constructor(
    public readonly request: APIRequestContext,
    public readonly config: TestConfig = testConfig
  ) {}

  log(message: string) {
    console.log(`[TEST] ${new Date().toISOString()} - ${message}`);
  }
}
```

---

## Layer 2: API Base

```typescript
// tests/components/api/base/api-base.ts
import { APIRequestContext, APIResponse, expect } from '@playwright/test';
import { TestContext, testConfig } from '../../../utils/test-context';

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export class ApiBase {
  protected context: TestContext;
  protected request: APIRequestContext;
  protected baseUrl: string;
  protected authToken: string | null = null;

  constructor(context: TestContext) {
    this.context = context;
    this.request = context.request;
    this.baseUrl = context.config.supabaseUrl;
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  clearAuthToken() {
    this.authToken = null;
  }

  protected getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      apikey: testConfig.supabaseAnonKey,
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  protected async get<T>(
    endpoint: string,
    params?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const url = new URL(`${this.baseUrl}/rest/v1${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await this.request.get(url.toString(), {
      headers: this.getHeaders(),
    });

    return this.parseResponse<T>(response);
  }

  protected async post<T>(
    endpoint: string,
    data: unknown,
    options?: { returnRepresentation?: boolean }
  ): Promise<ApiResponse<T>> {
    const headers = this.getHeaders();
    if (options?.returnRepresentation) {
      headers['Prefer'] = 'return=representation';
    }

    const response = await this.request.post(`${this.baseUrl}/rest/v1${endpoint}`, {
      headers,
      data,
    });

    return this.parseResponse<T>(response);
  }

  protected async patch<T>(
    endpoint: string,
    data: unknown,
    options?: { returnRepresentation?: boolean }
  ): Promise<ApiResponse<T>> {
    const headers = this.getHeaders();
    if (options?.returnRepresentation) {
      headers['Prefer'] = 'return=representation';
    }

    const response = await this.request.patch(`${this.baseUrl}/rest/v1${endpoint}`, {
      headers,
      data,
    });

    return this.parseResponse<T>(response);
  }

  protected async delete(endpoint: string): Promise<ApiResponse<void>> {
    const response = await this.request.delete(`${this.baseUrl}/rest/v1${endpoint}`, {
      headers: this.getHeaders(),
    });

    return {
      status: response.status(),
      data: undefined as void,
      headers: this.extractHeaders(response),
    };
  }

  private async parseResponse<T>(response: APIResponse): Promise<ApiResponse<T>> {
    let data: T;
    try {
      data = await response.json();
    } catch {
      data = {} as T;
    }

    return {
      status: response.status(),
      data,
      headers: this.extractHeaders(response),
    };
  }

  private extractHeaders(response: APIResponse): Record<string, string> {
    const headers: Record<string, string> = {};
    response.headersArray().forEach(({ name, value }) => {
      headers[name.toLowerCase()] = value;
    });
    return headers;
  }
}
```

---

## Layer 3: API Components

### Auth API

```typescript
// tests/components/api/auth-api.ts
import { expect } from '@playwright/test';
import { ApiBase } from './base/api-base';
import { TestContext, testConfig } from '../../utils/test-context';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    user_metadata: {
      name: string;
      role: string;
    };
  };
}

interface AuthenticatedUser {
  token: string;
  userId: string;
  email: string;
  name: string;
  role: string;
}

export class AuthApi extends ApiBase {
  constructor(context: TestContext) {
    super(context);
  }

  /**
   * @atc AUTH-001
   * Login with email and password
   */
  async login(email: string, password: string): Promise<AuthenticatedUser> {
    this.context.log(`Logging in as ${email}`);

    const response = await this.request.post(`${this.baseUrl}/auth/v1/token?grant_type=password`, {
      headers: {
        apikey: testConfig.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      data: { email, password },
    });

    expect(response.status()).toBe(200);

    const data: LoginResponse = await response.json();
    expect(data.access_token).toBeDefined();
    expect(data.user.id).toBeDefined();

    // Set token for subsequent requests
    this.setAuthToken(data.access_token);

    this.context.log(
      `Logged in as ${data.user.user_metadata.name} (${data.user.user_metadata.role})`
    );

    return {
      token: data.access_token,
      userId: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata.name,
      role: data.user.user_metadata.role,
    };
  }

  /**
   * @atc AUTH-002
   * Login as test customer
   */
  async loginAsCustomer(): Promise<AuthenticatedUser> {
    const { email, password } = testConfig.testUsers.customer;
    return this.login(email, password);
  }

  /**
   * @atc AUTH-003
   * Login as test admin
   */
  async loginAsAdmin(): Promise<AuthenticatedUser> {
    const { email, password } = testConfig.testUsers.admin;
    return this.login(email, password);
  }

  /**
   * @atc AUTH-004
   * Logout and clear authentication
   */
  async logout(): Promise<void> {
    this.clearAuthToken();
    this.context.log('Logged out');
  }
}
```

### Users API

```typescript
// tests/components/api/users-api.ts
import { expect } from '@playwright/test';
import { ApiBase } from './base/api-base';
import { TestContext } from '../../utils/test-context';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'customer' | 'seller' | 'admin';
  avatar_url?: string;
  bio?: string;
  created_at: string;
}

export class UsersApi extends ApiBase {
  constructor(context: TestContext) {
    super(context);
  }

  /**
   * @atc USER-001
   * Get all users with specific role (public)
   */
  async getUsersByRole(role: string): Promise<User[]> {
    this.context.log(`Getting all users with role: ${role}`);

    const response = await this.get<User[]>('/users', {
      role: `eq.${role}`,
      select: 'id,name,email,avatar_url,bio',
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);

    this.context.log(`Found ${response.data.length} users`);
    return response.data;
  }

  /**
   * @atc USER-002
   * Get user by ID (requires auth for private data)
   */
  async getUserById(id: string): Promise<User | null> {
    this.context.log(`Getting user ${id}`);

    const response = await this.get<User[]>('/users', {
      id: `eq.${id}`,
      select: '*',
    });

    expect(response.status).toBe(200);

    if (response.data.length === 0) {
      this.context.log(`User ${id} not found`);
      return null;
    }

    this.context.log(`Found user: ${response.data[0].name}`);
    return response.data[0];
  }

  /**
   * @atc USER-003
   * Update my profile (requires auth)
   */
  async updateMyProfile(
    userId: string,
    updates: Partial<Pick<User, 'name' | 'bio' | 'avatar_url'>>
  ): Promise<User> {
    this.context.log(`Updating profile ${userId}`);

    const response = await this.patch<User[]>(`/users?id=eq.${userId}`, updates, {
      returnRepresentation: true,
    });

    expect(response.status).toBe(200);
    expect(response.data.length).toBe(1);

    this.context.log(`Profile updated: ${response.data[0].name}`);
    return response.data[0];
  }

  /**
   * @atc USER-004
   * Attempt to update another user's profile (should fail via RLS)
   */
  async attemptUpdateOtherProfile(
    otherId: string,
    updates: Partial<User>
  ): Promise<{ success: boolean; data: User[] }> {
    this.context.log(`Attempting to update other profile ${otherId}`);

    const response = await this.patch<User[]>(`/users?id=eq.${otherId}`, updates, {
      returnRepresentation: true,
    });

    // RLS should return empty array (no rows affected)
    expect(response.status).toBe(200);

    const success = response.data.length > 0;
    if (!success) {
      this.context.log(`RLS blocked update to other profile (expected)`);
    } else {
      this.context.log(`RLS did NOT block update (unexpected!)`);
    }

    return { success, data: response.data };
  }
}
```

### Orders API

```typescript
// tests/components/api/orders-api.ts
import { expect } from '@playwright/test';
import { ApiBase } from './base/api-base';
import { TestContext } from '../../utils/test-context';

type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

interface Order {
  id: string;
  user_id: string;
  status: OrderStatus;
  total: number;
  shipping_address: Record<string, string>;
  created_at: string;
}

interface CreateOrderData {
  user_id: string;
  total: number;
  shipping_address: Record<string, string>;
}

export class OrdersApi extends ApiBase {
  constructor(context: TestContext) {
    super(context);
  }

  /**
   * @atc ORDER-001
   * Get my orders
   */
  async getMyOrders(userId: string): Promise<Order[]> {
    this.context.log(`Getting orders for user ${userId}`);

    const response = await this.get<Order[]>('/orders', {
      user_id: `eq.${userId}`,
      select: '*',
      order: 'created_at.desc',
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);

    // Verify all orders belong to this user
    response.data.forEach(order => {
      expect(order.user_id).toBe(userId);
    });

    this.context.log(`Found ${response.data.length} orders`);
    return response.data;
  }

  /**
   * @atc ORDER-002
   * Create a new order
   */
  async createOrder(data: CreateOrderData): Promise<Order> {
    this.context.log(`Creating order for user ${data.user_id}`);

    const response = await this.post<Order[]>(
      '/orders',
      { ...data, status: 'pending' },
      { returnRepresentation: true }
    );

    expect(response.status).toBe(201);
    expect(response.data.length).toBe(1);
    expect(response.data[0].id).toBeDefined();
    expect(response.data[0].status).toBe('pending');

    this.context.log(`Order created: ${response.data[0].id}`);
    return response.data[0];
  }

  /**
   * @atc ORDER-003
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
    this.context.log(`Updating order ${orderId} to status: ${status}`);

    const response = await this.patch<Order[]>(
      `/orders?id=eq.${orderId}`,
      { status },
      { returnRepresentation: true }
    );

    expect(response.status).toBe(200);
    expect(response.data.length).toBe(1);
    expect(response.data[0].status).toBe(status);

    this.context.log(`Order status updated to: ${status}`);
    return response.data[0];
  }

  /**
   * @atc ORDER-004
   * Delete pending order
   */
  async deletePendingOrder(orderId: string): Promise<void> {
    this.context.log(`Deleting pending order ${orderId}`);

    const response = await this.delete(`/orders?id=eq.${orderId}`);

    expect(response.status).toBe(204);
    this.context.log(`Order deleted`);
  }

  /**
   * @atc ORDER-005
   * Attempt to view other user's orders (should return empty)
   */
  async attemptViewOtherOrders(otherUserId: string): Promise<Order[]> {
    this.context.log(`Attempting to view orders of user ${otherUserId}`);

    const response = await this.get<Order[]>('/orders', {
      user_id: `eq.${otherUserId}`,
    });

    expect(response.status).toBe(200);
    // RLS should filter out orders that don't belong to authenticated user
    this.context.log(`Found ${response.data.length} orders (expected: 0 if RLS works)`);

    return response.data;
  }
}
```

### Reviews API

```typescript
// tests/components/api/reviews-api.ts
import { expect } from '@playwright/test';
import { ApiBase } from './base/api-base';
import { TestContext } from '../../utils/test-context';

interface Review {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  comment: string;
  created_at: string;
}

interface CreateReviewData {
  product_id: string;
  user_id: string;
  rating: number;
  comment: string;
}

export class ReviewsApi extends ApiBase {
  constructor(context: TestContext) {
    super(context);
  }

  /**
   * @atc REVIEW-001
   * Get reviews for a product (public)
   */
  async getProductReviews(productId: string): Promise<Review[]> {
    this.context.log(`Getting reviews for product ${productId}`);

    const response = await this.get<Review[]>('/reviews', {
      product_id: `eq.${productId}`,
      select: '*',
      order: 'created_at.desc',
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);

    this.context.log(`Found ${response.data.length} reviews`);
    return response.data;
  }

  /**
   * @atc REVIEW-002
   * Create a review
   */
  async createReview(data: CreateReviewData): Promise<Review> {
    this.context.log(`Creating review for product ${data.product_id}`);

    // Validate rating range
    expect(data.rating).toBeGreaterThanOrEqual(1);
    expect(data.rating).toBeLessThanOrEqual(5);

    const response = await this.post<Review[]>('/reviews', data, { returnRepresentation: true });

    expect(response.status).toBe(201);
    expect(response.data.length).toBe(1);
    expect(response.data[0].rating).toBe(data.rating);

    this.context.log(`Review created with rating: ${data.rating}/5`);
    return response.data[0];
  }

  /**
   * @atc REVIEW-003
   * Calculate average rating for a product
   */
  async calculateProductAverageRating(productId: string): Promise<number> {
    const reviews = await this.getProductReviews(productId);

    if (reviews.length === 0) {
      return 0;
    }

    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    const average = sum / reviews.length;

    this.context.log(`Average rating: ${average.toFixed(2)} from ${reviews.length} reviews`);
    return average;
  }
}
```

---

## Layer 4: API Fixture

```typescript
// tests/fixtures/api-fixture.ts
import { test as base, APIRequestContext } from '@playwright/test';
import { TestContext, testConfig } from '../utils/test-context';
import { AuthApi } from '../components/api/auth-api';
import { UsersApi } from '../components/api/users-api';
import { OrdersApi } from '../components/api/orders-api';
import { ReviewsApi } from '../components/api/reviews-api';

interface ApiFixture {
  context: TestContext;
  auth: AuthApi;
  users: UsersApi;
  orders: OrdersApi;
  reviews: ReviewsApi;
}

export const test = base.extend<ApiFixture>({
  context: async ({ request }, use) => {
    const context = new TestContext(request, testConfig);
    await use(context);
  },

  auth: async ({ context }, use) => {
    const auth = new AuthApi(context);
    await use(auth);
  },

  users: async ({ context }, use) => {
    const users = new UsersApi(context);
    await use(users);
  },

  orders: async ({ context }, use) => {
    const orders = new OrdersApi(context);
    await use(orders);
  },

  reviews: async ({ context }, use) => {
    const reviews = new ReviewsApi(context);
    await use(reviews);
  },
});

export { expect } from '@playwright/test';
```

---

## Layer 5: Test Files

### Auth Tests

```typescript
// tests/integration/auth.spec.ts
import { test, expect } from '../fixtures/api-fixture';

test.describe('Authentication API', () => {
  test('AUTH-001: Login with valid credentials', async ({ auth }) => {
    const user = await auth.loginAsCustomer();

    expect(user.token).toBeDefined();
    expect(user.email).toContain('@');
    expect(user.role).toBe('customer');
  });

  test('AUTH-002: Login with invalid credentials should fail', async ({ auth }) => {
    await expect(auth.login('invalid@email.com', 'wrongpassword')).rejects.toThrow();
  });

  test('AUTH-003: Login as admin', async ({ auth }) => {
    const user = await auth.loginAsAdmin();

    expect(user.role).toBe('admin');
  });
});
```

### Users Tests

```typescript
// tests/integration/users.spec.ts
import { test, expect } from '../fixtures/api-fixture';

test.describe('Users API', () => {
  test('USER-001: Get all sellers (public)', async ({ users }) => {
    const sellers = await users.getUsersByRole('seller');

    expect(sellers.length).toBeGreaterThanOrEqual(0);
    sellers.forEach(seller => {
      expect(seller.name).toBeDefined();
    });
  });

  test('USER-002: Get my profile (authenticated)', async ({ auth, users }) => {
    const user = await auth.loginAsCustomer();

    // Share auth token with users API
    users.setAuthToken(user.token);

    const profile = await users.getUserById(user.userId);

    expect(profile).not.toBeNull();
    expect(profile?.email).toBe(user.email);
  });

  test('USER-003: Update my profile', async ({ auth, users }) => {
    const user = await auth.loginAsCustomer();
    users.setAuthToken(user.token);

    const newBio = `Updated at ${new Date().toISOString()}`;
    const updated = await users.updateMyProfile(user.userId, {
      bio: newBio,
    });

    expect(updated.bio).toBe(newBio);
  });

  test('USER-004: Cannot update other user profile (RLS)', async ({ auth, users }) => {
    const customer = await auth.loginAsCustomer();
    users.setAuthToken(customer.token);

    // Use a fake user ID
    const fakeUserId = '00000000-0000-0000-0000-000000000000';

    const result = await users.attemptUpdateOtherProfile(fakeUserId, {
      bio: 'Hacked!',
    });

    // RLS should prevent this
    expect(result.success).toBe(false);
  });
});
```

### Orders Tests

```typescript
// tests/integration/orders.spec.ts
import { test, expect } from '../fixtures/api-fixture';

test.describe('Orders API', () => {
  test('ORDER-001: Get my orders', async ({ auth, orders }) => {
    const user = await auth.loginAsCustomer();
    orders.setAuthToken(user.token);

    const myOrders = await orders.getMyOrders(user.userId);

    // All orders should belong to this user
    myOrders.forEach(order => {
      expect(order.user_id).toBe(user.userId);
    });
  });

  test('ORDER-002: Create and delete pending order', async ({ auth, orders }) => {
    const customer = await auth.loginAsCustomer();
    orders.setAuthToken(customer.token);

    // Create order
    const order = await orders.createOrder({
      user_id: customer.userId,
      total: 99.99,
      shipping_address: {
        street: '123 Test Street',
        city: 'Test City',
        zip: '12345',
      },
    });

    expect(order.status).toBe('pending');

    // Cleanup: delete the pending order
    await orders.deletePendingOrder(order.id);
  });

  test('ORDER-003: Cannot view other user orders (RLS)', async ({ auth, orders }) => {
    const customer = await auth.loginAsCustomer();
    orders.setAuthToken(customer.token);

    // Use a fake user ID
    const fakeUserId = '00000000-0000-0000-0000-000000000000';
    const otherOrders = await orders.attemptViewOtherOrders(fakeUserId);

    // RLS should return empty array
    expect(otherOrders.length).toBe(0);
  });
});
```

### Reviews Tests

```typescript
// tests/integration/reviews.spec.ts
import { test, expect } from '../fixtures/api-fixture';

test.describe('Reviews API', () => {
  test('REVIEW-001: Get product reviews (public)', async ({ reviews }) => {
    // Use a known product ID or skip if none exists
    const productId = process.env.TEST_PRODUCT_ID;
    if (!productId) {
      test.skip();
      return;
    }

    const productReviews = await reviews.getProductReviews(productId);

    productReviews.forEach(review => {
      expect(review.product_id).toBe(productId);
      expect(review.rating).toBeGreaterThanOrEqual(1);
      expect(review.rating).toBeLessThanOrEqual(5);
    });
  });

  test('REVIEW-002: Calculate product average rating', async ({ reviews }) => {
    const productId = process.env.TEST_PRODUCT_ID;
    if (!productId) {
      test.skip();
      return;
    }

    const avgRating = await reviews.calculateProductAverageRating(productId);

    expect(avgRating).toBeGreaterThanOrEqual(0);
    expect(avgRating).toBeLessThanOrEqual(5);
  });
});
```

---

## Run Tests

### Commands

```bash
# All integration tests
bun run test:integration

# Specific test
bun run test tests/integration/auth.spec.ts

# With UI mode (debug)
bun run test:debug

# Generate report
bun run test:report
```

### Environment Variables

Create `.env.test`:

```bash
NEXT_PUBLIC_SUPABASE_URL={{SUPABASE_URL}}
# Example: https://abcdefghijklmnop.supabase.co

NEXT_PUBLIC_SUPABASE_ANON_KEY={{SUPABASE_ANON_KEY}}
# Example: eyJ...

TEST_USER_EMAIL={{TEST_USER_EMAIL}}
# Example: test.customer@myproject.com

TEST_USER_PASSWORD={{TEST_USER_PASSWORD}}
# Example: Customer123!

TEST_ADMIN_EMAIL={{TEST_ADMIN_EMAIL}}
# Example: test.admin@myproject.com

TEST_ADMIN_PASSWORD={{TEST_ADMIN_PASSWORD}}
# Example: Admin123!

# Optional: for review tests
TEST_PRODUCT_ID=some-product-uuid
```

---

## Best Practices

### 1. Token Sharing Between Components

```typescript
test('Complete flow', async ({ auth, orders, reviews }) => {
  const user = await auth.loginAsCustomer();

  // Share token with all components
  orders.setAuthToken(user.token);
  reviews.setAuthToken(user.token);

  // Now both can make authenticated requests
});
```

### 2. Test Data Cleanup

```typescript
test('Create and cleanup', async ({ auth, orders }) => {
  const user = await auth.loginAsCustomer()
  orders.setAuthToken(user.token)

  const order = await orders.createOrder({ ... })

  // Test assertions...

  // Cleanup
  await orders.deletePendingOrder(order.id)
})
```

### 3. Use test.describe for Grouping

```typescript
test.describe('As Customer', () => {
  test.beforeEach(async ({ auth, orders }) => {
    const user = await auth.loginAsCustomer();
    orders.setAuthToken(user.token);
  });

  test('can view their orders', async ({ orders }) => {
    // Already authenticated
  });
});
```

---

## Summary

| Layer       | Responsibility                                    |
| ----------- | ------------------------------------------------- |
| **Layer 1** | Global configuration and context                  |
| **Layer 2** | Generic HTTP helpers (get, post, patch, delete)   |
| **Layer 3** | Domain-specific ATCs with assertions              |
| **Layer 4** | Fixture that injects dependencies                 |
| **Layer 5** | Tests that compose ATCs                           |

This architecture allows:

- Code reusability
- Traceability to test cases
- Assertions guarantee quality
- Easy maintenance and extension
