# Frontend Discovery

> **Phase**: 3 - Infrastructure
> **Objective**: Document frontend build configuration and client-side requirements

---

## 📥 Input Required

### From Previous Prompts:

- `.context/SRS/architecture-specs.md` (tech stack)
- Backend discovery (completed)

### From Discovery Sources:

| Information     | Primary Source              | Fallback        |
| --------------- | --------------------------- | --------------- |
| Build config    | next.config.js, vite.config | Package.json    |
| Client env vars | NEXT*PUBLIC*\*              | Code analysis   |
| Static assets   | public/ folder              | Build output    |
| Bundle analysis | Build stats                 | Manual analysis |

---

## 🎯 Objective

Document frontend infrastructure by:

1. Analyzing build configuration
2. Mapping client-side environment variables
3. Understanding static asset handling
4. Documenting bundle and performance considerations

---

## 🔍 Discovery Process

### Step 1: Build Configuration Analysis

**Actions:**

1. Read main config file:

   ```bash
   cat next.config.js next.config.mjs next.config.ts 2>/dev/null
   # Or for other frameworks
   cat vite.config.ts vite.config.js 2>/dev/null
   ```

2. Check for build plugins:

   ```bash
   grep -E "plugin|Plugin|withBundle|with" next.config.* 2>/dev/null
   ```

3. Analyze output configuration:

   ```bash
   grep -E "output|distDir|outDir" next.config.* vite.config.* 2>/dev/null
   ```

4. Check for custom webpack config:
   ```bash
   grep -A20 "webpack" next.config.* 2>/dev/null
   ```

**Output:**

- Framework configuration
- Build plugins used
- Output settings
- Custom configurations

### Step 2: Client Environment Variables

**Actions:**

1. Find public environment variables:

   ```bash
   # Next.js public vars
   grep -rh "NEXT_PUBLIC_" --include="*.ts" --include="*.tsx" src/ | \
     sed 's/.*\(NEXT_PUBLIC_[A-Z_]*\).*/\1/' | sort | uniq

   # Vite public vars
   grep -rh "import.meta.env.VITE_" --include="*.ts" --include="*.tsx" src/ | \
     sed 's/.*\(VITE_[A-Z_]*\).*/\1/' | sort | uniq
   ```

2. Check .env.example for public vars:

   ```bash
   grep -E "^NEXT_PUBLIC_|^VITE_" .env.example 2>/dev/null
   ```

3. Identify runtime vs build-time vars:

   ```bash
   # Runtime (server-side)
   grep -r "process.env\." --include="*.ts" src/app/ src/pages/ 2>/dev/null | head -10

   # Build-time (client-side)
   grep -r "process.env.NEXT_PUBLIC" --include="*.tsx" src/components/ 2>/dev/null | head -10
   ```

**Output:**

- Public environment variables
- API URLs exposed to client
- Feature flags on client

### Step 3: Static Assets Analysis

**Actions:**

1. Check public folder contents:

   ```bash
   ls -la public/
   find public/ -type f | head -20
   ```

2. Analyze image handling:

   ```bash
   # Image domains configuration
   grep -A10 "images" next.config.* 2>/dev/null

   # Image component usage
   grep -r "next/image\|<Image" --include="*.tsx" src/ | head -10
   ```

3. Check for asset optimization:

   ```bash
   # Static file compression
   grep -E "compress|gzip|brotli" next.config.* 2>/dev/null

   # CDN configuration
   grep -E "assetPrefix|cdn" next.config.* 2>/dev/null
   ```

**Output:**

- Static assets inventory
- Image optimization settings
- CDN configuration

### Step 4: Bundle Analysis

**Actions:**

1. Check for bundle analyzer:

   ```bash
   grep -E "bundle-analyzer|analyze" package.json next.config.* 2>/dev/null
   ```

2. Review build output size (if available):

   ```bash
   # Check for build stats
   cat .next/analyze/*.html 2>/dev/null
   ls -lh .next/static/chunks/ 2>/dev/null | head -10
   ```

3. Identify code splitting:
   ```bash
   # Dynamic imports
   grep -r "dynamic\|lazy\|import(" --include="*.tsx" src/ | head -10
   ```

**Output:**

- Bundle analysis availability
- Code splitting patterns
- Large dependencies

---

## 📤 Output Generated

### Primary Output: Update `.context/SRS/architecture-specs.md`

Add or update the following section:

````markdown
## Frontend Infrastructure

### Build Configuration

| Aspect          | Value                   | Evidence        |
| --------------- | ----------------------- | --------------- |
| **Framework**   | Next.js 14 (App Router) | next.config.js  |
| **Bundler**     | Webpack/Turbopack       | Next.js default |
| **Output Mode** | [standalone/default]    | next.config.js  |
| **TypeScript**  | Strict mode             | tsconfig.json   |

### Next.js Configuration

```javascript
// next.config.js - Key settings discovered
const nextConfig = {
  // Output mode for deployment
  output: 'standalone',

  // Image optimization
  images: {
    domains: ['example.com', 'cdn.example.com'],
    formats: ['image/avif', 'image/webp'],
  },

  // Environment variables validation
  env: {
    // Build-time vars
  },

  // Redirects and rewrites
  async redirects() {
    return [
      // Discovered redirects
    ];
  },

  // Headers (security)
  async headers() {
    return [
      // Security headers
    ];
  },
};
```
````

### Client Environment Variables

#### Public Variables (Exposed to Browser)

| Variable                 | Purpose          | Example                   |
| ------------------------ | ---------------- | ------------------------- |
| `NEXT_PUBLIC_API_URL`    | API base URL     | `https://api.example.com` |
| `NEXT_PUBLIC_SITE_URL`   | Site URL         | `https://example.com`     |
| `NEXT_PUBLIC_GA_ID`      | Google Analytics | `G-XXXXXXXXXX`            |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry (client)  | DSN string                |

**Security Note:** Never expose secrets in NEXT*PUBLIC*\* variables.

#### Environment-Specific Values

| Variable              | Development          | Staging          | Production        |
| --------------------- | -------------------- | ---------------- | ----------------- |
| `NEXT_PUBLIC_API_URL` | `localhost:3000/api` | `staging-api...` | `api.example.com` |
| `NEXT_PUBLIC_ENV`     | `development`        | `staging`        | `production`      |

### Static Assets

#### Public Folder Structure

```
public/
├── favicon.ico           # Site favicon
├── robots.txt           # SEO robots file
├── sitemap.xml          # SEO sitemap
├── images/              # Static images
│   ├── logo.svg
│   └── og-image.png     # Social sharing
├── fonts/               # Custom fonts (if any)
└── locales/             # i18n translations (if any)
```

#### Image Handling

| Aspect              | Configuration               |
| ------------------- | --------------------------- |
| **Optimization**    | Next.js Image component     |
| **Formats**         | AVIF, WebP with fallback    |
| **Allowed Domains** | [list from config]          |
| **Loader**          | [default/custom/cloudinary] |

### Code Splitting Strategy

| Pattern           | Usage          | Evidence           |
| ----------------- | -------------- | ------------------ |
| Route-based       | Automatic      | App Router         |
| Component-based   | `next/dynamic` | [components found] |
| Library splitting | Automatic      | [large libs]       |

**Dynamic Imports Found:**

```typescript
// Example discovered dynamic imports
const HeavyComponent = dynamic(() => import('@/components/Heavy'), {
  loading: () => <Skeleton />,
  ssr: false, // Client-only
});
```

### Bundle Size Considerations

| Category      | Size Estimate | Notes                |
| ------------- | ------------- | -------------------- |
| First Load JS | [X] kB        | Shared across routes |
| Largest Route | [X] kB        | [route name]         |
| External Deps | [X] kB        | [large deps]         |

#### Large Dependencies Identified

| Package   | Size   | Purpose   | Alternative     |
| --------- | ------ | --------- | --------------- |
| [package] | [size] | [purpose] | [if applicable] |

### Performance Configuration

| Feature             | Status     | Evidence          |
| ------------------- | ---------- | ----------------- |
| Image Optimization  | ✅ Enabled | next/image usage  |
| Font Optimization   | ✅ Enabled | next/font usage   |
| Script Optimization | [Status]   | next/script usage |
| Prefetching         | ✅ Default | Link component    |

### SEO Configuration

| Aspect        | Implementation          |
| ------------- | ----------------------- |
| Metadata      | App Router metadata API |
| Open Graph    | [Configured/Missing]    |
| Twitter Cards | [Configured/Missing]    |
| Sitemap       | [Static/Dynamic]        |
| robots.txt    | [Configured/Missing]    |

### Browser Support

| Target         | Evidence              |
| -------------- | --------------------- |
| **Browsers**   | [browserslist config] |
| **Polyfills**  | [if any]              |
| **IE Support** | [Yes/No]              |

````

### Update CLAUDE.md:

```markdown
## Phase 3 Progress
- [x] backend-discovery.md ✅
- [x] frontend-discovery.md ✅
  - Build: [framework + bundler]
  - Public env vars: [count]
  - Image optimization: [status]
````

---

## 🔗 Next Prompt

| Condition             | Next Prompt                 |
| --------------------- | --------------------------- |
| Frontend documented   | `infrastructure-mapping.md` |
| Missing optimizations | Note recommendations        |
| Complex build setup   | Document additional configs |

---

## Tips

1. **next.config.js has the answers** - Most frontend config is there
2. **NEXT*PUBLIC*\* are client-exposed** - Review for security
3. **Check build output** - Run build to see actual sizes
4. **Dynamic imports = code splitting** - Find them for understanding lazy loading
