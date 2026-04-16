# Code Standards

> **For**: Phases 6-7 (Implementation + Code Review)
> **Purpose**: Code standards to maintain quality and consistency

---

## 🎯 Fundamental Principles

### 1. **DRY** (Don't Repeat Yourself)

```typescript
// ❌ BAD - Repetition
function getUserEmail(userId: string) {
  const response = await fetch(`/api/users/${userId}`);
  const user = await response.json();
  return user.email;
}

function getUserName(userId: string) {
  const response = await fetch(`/api/users/${userId}`);
  const user = await response.json();
  return user.name;
}

// ✅ GOOD - Reusable
async function getUser(userId: string) {
  const response = await fetch(`/api/users/${userId}`);
  return await response.json();
}

function getUserEmail(userId: string) {
  const user = await getUser(userId);
  return user.email;
}
```

### 2. **KISS** (Keep It Simple, Stupid)

```typescript
// ❌ BAD - Over-engineering
const getUserStatus = (user: User): UserStatus => {
  return user.isActive
    ? user.isPremium
      ? user.trialEnded
        ? UserStatus.PREMIUM_ACTIVE
        : UserStatus.TRIAL_ACTIVE
      : UserStatus.FREE_ACTIVE
    : UserStatus.INACTIVE;
};

// ✅ GOOD - Simple and readable
const getUserStatus = (user: User): UserStatus => {
  if (!user.isActive) return UserStatus.INACTIVE;
  if (!user.isPremium) return UserStatus.FREE_ACTIVE;
  if (user.trialEnded) return UserStatus.PREMIUM_ACTIVE;
  return UserStatus.TRIAL_ACTIVE;
};
```

### 3. **YAGNI** (You Aren't Gonna Need It)

```typescript
// ❌ BAD - Functionality nobody asked for
interface User {
  id: string;
  name: string;
  email: string;
  socialSecurity?: string; // Why?
  bloodType?: string; // Why?
  favoriteColor?: string; // Why?
}

// ✅ GOOD - Only what's needed
interface User {
  id: string;
  name: string;
  email: string;
}
```

---

## 📝 Naming Conventions

### Variables and Functions

```typescript
// ✅ camelCase for variables and functions
const userName = 'John';
const isActive = true;
const totalCount = 42;

function getUserById(id: string) {}
function calculateTotal(items: Item[]) {}
```

### React Components

```typescript
// ✅ PascalCase for components
function LoginForm() {}
function UserProfile() {}
const NavBar = () => {};
```

### Constants

```typescript
// ✅ UPPER_SNAKE_CASE for constants
const MAX_RETRIES = 3;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const DEFAULT_TIMEOUT = 5000;
```

### Types and Interfaces

```typescript
// ✅ PascalCase with 'I' or 'T' prefix (optional)
interface User {}
interface UserResponse {}
type UserId = string;
type UserRole = 'admin' | 'user' | 'guest';
```

### Files

```
✅ kebab-case for files:
- user-profile.tsx
- api-client.ts
- error-handler.ts

✅ PascalCase for components:
- LoginForm.tsx
- UserCard.tsx
- NavBar.tsx
```

---

## 🔧 Function Parameters

### Max 2 Positional Parameters Rule

When a function has 3+ parameters, use an object:

```typescript
// ❌ BAD - Hard to read, easy to confuse order
createUser('John', 'john@test.com', 'password', true, 30);

// What is `true`? What is `30`? Nobody knows without checking the signature.

// ✅ GOOD - Self-documenting
createUser({
  name: 'John',
  email: 'john@test.com',
  password: 'password',
  isActive: true,
  age: 30,
});
```

### Interface Definition

```typescript
// Define the interface for the object parameter
interface CreateUserArgs {
  name: string;
  email: string;
  password: string;
  isActive?: boolean; // Optional with ?
  age?: number;
}

// Function signature is clean
function createUser(args: CreateUserArgs): User {
  const { name, email, password, isActive = true, age } = args;
  // ...
}
```

### Benefits

| Benefit                  | Explanation                                  |
| ------------------------ | -------------------------------------------- |
| **Self-documenting**     | Parameter names visible at call site         |
| **Order doesn't matter** | `{ age: 30, name: 'John' }` works fine       |
| **Easy to extend**       | Add optional params without breaking changes |
| **IDE support**          | Autocomplete shows all available options     |

### When 2 Positional is OK

```typescript
// ✅ OK - 2 params are manageable
function getUser(id: string, includeDeleted: boolean) { ... }

// ✅ OK - 1 param is obvious
function deleteUser(id: string) { ... }

// ❌ NOT OK - 3+ params, use object
function getUser(id: string, includeDeleted: boolean, expand: string) { ... }
```

---

## 🏗️ TypeScript Strict Mode

**ALWAYS use TypeScript in strict mode**:

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Avoid `any`

```typescript
// ❌ BAD
function processData(data: any) {
  return data.value;
}

// ✅ GOOD
interface DataPayload {
  value: string;
}

function processData(data: DataPayload) {
  return data.value;
}
```

### Use Explicit Types

```typescript
// ❌ BAD - Inferred type can change
const users = [];

// ✅ GOOD - Explicit type
const users: User[] = [];
```

---

## 🎨 Component Structure (React)

### Element Order

```typescript
// ✅ Standard order
import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { getUserById } from '@/lib/api'
import type { User } from '@/types'

interface UserProfileProps {
  userId: string
}

export function UserProfile({ userId }: UserProfileProps) {
  // 1. Hooks
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // 2. Effects
  useEffect(() => {
    loadUser()
  }, [userId])

  // 3. Handlers
  const loadUser = async () => {
    const data = await getUserById(userId)
    setUser(data)
    setLoading(false)
  }

  // 4. Early returns
  if (loading) return <div>Loading...</div>
  if (!user) return <div>User not found</div>

  // 5. Render
  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  )
}
```

### Props Destructuring

```typescript
// ✅ Destructure props in signature
function UserCard({ name, email, avatar }: UserCardProps) {
  return <div>{name}</div>
}

// ❌ Don't use props object
function UserCard(props: UserCardProps) {
  return <div>{props.name}</div>
}
```

---

## ⚡ Performance Best Practices

### 1. Memoization

```typescript
import { useMemo, useCallback } from 'react'

function ExpensiveComponent({ items }: Props) {
  // ✅ Memoize expensive calculations
  const total = useMemo(() => {
    return items.reduce((sum, item) => sum + item.price, 0)
  }, [items])

  // ✅ Memoize callbacks
  const handleClick = useCallback(() => {
    console.log('Clicked')
  }, [])

  return <div>Total: {total}</div>
}
```

### 2. Lazy Loading

```typescript
import { lazy, Suspense } from 'react'

// ✅ Lazy load heavy components
const HeavyChart = lazy(() => import('./HeavyChart'))

function Dashboard() {
  return (
    <Suspense fallback={<div>Loading chart...</div>}>
      <HeavyChart />
    </Suspense>
  )
}
```

### 3. Avoid Unnecessary Re-renders

```typescript
import { memo } from 'react'

// ✅ Memoize pure components
export const UserCard = memo(function UserCard({ user }: Props) {
  return <div>{user.name}</div>
})
```

---

## ♿ Accessibility (a11y)

### Semantic HTML

```tsx
// ❌ BAD
<div onClick={handleClick}>Click me</div>

// ✅ GOOD
<button onClick={handleClick}>Click me</button>
```

### ARIA Labels

```tsx
// ✅ Descriptive labels
<button aria-label="Close dialog">
  <XIcon />
</button>

<input
  type="text"
  aria-label="Search users"
  placeholder="Search..."
/>
```

### Keyboard Navigation

```tsx
// ✅ Keyboard support
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={e => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick();
    }
  }}
>
  Custom button
</div>
```

---

## 📦 Code Organization

### Folder Structure

```
src/
├── components/
│   ├── ui/              # Reusable components
│   └── features/        # Specific components
├── lib/
│   ├── api/             # API clients
│   ├── utils/           # Utilities
│   └── hooks/           # Custom hooks
├── types/               # TypeScript types
└── app/                 # Pages (Next.js App Router)
```

### Barrel Exports

```typescript
// components/ui/index.ts
export { Button } from './Button';
export { Input } from './Input';
export { Card } from './Card';

// Usage
import { Button, Input, Card } from '@/components/ui';
```

---

## 🚫 What NOT to Do

### 1. DON'T Hardcode Values

```typescript
// ❌ BAD
const apiUrl = 'https://api.example.com';

// ✅ GOOD
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```

### 2. DON'T Leave console.log()

```typescript
// ❌ BAD
console.log('User data:', user);

// ✅ GOOD (if you need logging)
import { logger } from '@/lib/logger';
logger.info('User data loaded', { userId: user.id });
```

### 3. DON'T Use var

```typescript
// ❌ BAD
var count = 0;

// ✅ GOOD
const count = 0;
let counter = 0;
```

### 4. DON'T Mutate State Directly

```typescript
// ❌ BAD
const [users, setUsers] = useState<User[]>([]);
users.push(newUser); // ❌ Mutation!

// ✅ GOOD
setUsers([...users, newUser]);
```

### 5. DON'T Ignore Errors

```typescript
// ❌ BAD
try {
  await fetchData();
} catch (error) {
  // Silently ignored
}

// ✅ GOOD
try {
  await fetchData();
} catch (error) {
  logger.error('Failed to fetch data', error);
  throw new AppError('FETCH_FAILED', 'Unable to load data');
}
```

---

## ✅ Code Quality Checklist

Before commit:

- [ ] Code follows DRY, KISS, YAGNI
- [ ] Naming conventions followed
- [ ] TypeScript strict (no `any`)
- [ ] No hardcoded values
- [ ] No forgotten console.log()
- [ ] Accessibility considered
- [ ] Performance optimized
- [ ] Components memoized (if necessary)
- [ ] Error handling implemented
- [ ] Tests written

---

**Last Updated**: 2026-02-12
**Phase**: Implementation (Phase 6)