## FEATURE:

**Cellix Phase 1: Foundation**

Initialize the monorepo structure and create a working Excel Add-in shell with basic chat UI and backend API.

### Goal
Add-in loads in Excel, displays a functional chat UI, and communicates with a Fastify backend that responds to health checks.

### Deliverables

1. **Monorepo Structure** (pnpm workspaces)
   - `apps/addin/` - Excel Add-in (React + Vite + Office.js)
   - `apps/backend/` - API Server (Fastify + TypeScript)
   - `packages/shared/` - Shared types and utilities

2. **Add-in Shell**
   - Office.js initialization wrapper
   - Fluent UI v9 provider setup
   - Basic routing (Chat / Settings tabs)
   - Loading states and error boundaries

3. **Chat UI Components**
   - Message list (user/assistant bubbles)
   - Input box with send button
   - Typing indicator
   - Auto-scroll behavior
   - Clear chat action

4. **Backend Foundation**
   - Fastify server with CORS configured for Office.js
   - Health check endpoints (`/health`, `/ready`)
   - Request logging middleware
   - Error handling middleware
   - Environment configuration (.env)

### Tech Stack (Phase 1 Only)
| Component | Technology |
|-----------|------------|
| Add-in Framework | React 18 + TypeScript |
| Add-in Bundler | Vite |
| Add-in UI | Fluent UI React v9 |
| Office Integration | Office.js |
| State Management | Zustand |
| Backend Framework | Fastify |
| Validation | Zod |
| Package Manager | pnpm |

## EXAMPLES:

### 1. FastifyRoute.ts (`.claude/examples/backend/FastifyRoute.ts`)
Pattern for creating API routes with Fastify including:
- Zod validation for request bodies
- SSE streaming for chat responses
- Health check endpoint structure
- Error handling patterns

Key patterns to follow:
```typescript
// Health check pattern
fastify.get('/health', async (_request, reply) => {
  return reply.send({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.0.0',
  });
});
```

### 2. Office.js Patterns (`.claude/reference/office-js-patterns.md`)
Critical patterns for Excel integration:
- All Excel operations must happen within `Excel.run()` blocks
- Use `context.sync()` minimally - batch operations
- Always specify properties to load with `load()`
- Handle `OfficeExtension.Error` specifically

### 3. Fluent UI Setup
```typescript
// App shell with Fluent UI provider
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

function App() {
  return (
    <FluentProvider theme={webLightTheme}>
      {/* App content */}
    </FluentProvider>
  );
}
```

## DOCUMENTATION:

### Office.js / Excel Add-ins
- **Yeoman Generator**: https://learn.microsoft.com/en-us/office/dev/add-ins/quickstarts/excel-quickstart-react
- **Vite Template**: https://github.com/ExtraBB/Office-Addin-React-Vite-Template (use this as reference for Vite setup)
- **Office.js API Reference**: https://learn.microsoft.com/en-us/javascript/api/excel
- **Manifest Schema**: https://learn.microsoft.com/en-us/office/dev/add-ins/develop/add-in-manifests

### Fluent UI React v9
- **Components**: https://react.fluentui.dev/
- **Getting Started**: https://react.fluentui.dev/?path=/docs/concepts-introduction--page

### Fastify
- **Documentation**: https://fastify.dev/docs/latest/
- **TypeScript Guide**: https://fastify.dev/docs/latest/Reference/TypeScript/

### SSL Certificates (Required for Office.js)
- Office.js requires HTTPS even in development
- Use `mkcert` to generate local certificates: https://github.com/FiloSottile/mkcert
- Or use `office-addin-dev-certs` package

## OTHER CONSIDERATIONS:

### 1. Office.js HTTPS Requirement
Office Add-ins MUST be served over HTTPS, even in development. Configure Vite with SSL:
```typescript
// vite.config.ts
export default defineConfig({
  server: {
    https: {
      key: fs.readFileSync('path/to/localhost-key.pem'),
      cert: fs.readFileSync('path/to/localhost.pem'),
    },
    port: 3000,
  },
});
```

### 2. Manifest.xml Configuration
The manifest defines how the add-in appears in Excel. Critical fields:
- `<SourceLocation>` - Must point to HTTPS URL
- `<DefaultSettings>` - Taskpane dimensions
- `<Permissions>` - Request `ReadWriteDocument` for full access
- `<Requirements>` - Specify minimum Excel API version (1.1 minimum)

### 3. CORS for Office.js
The backend must allow requests from:
- `https://localhost:3000` (dev add-in)
- `https://*.officeapps.live.com` (Excel Online)
- `https://*.office.com` (Excel Desktop via web view)

```typescript
// Fastify CORS setup
fastify.register(cors, {
  origin: [
    'https://localhost:3000',
    /\.officeapps\.live\.com$/,
    /\.office\.com$/,
  ],
  credentials: true,
});
```

### 4. Office.js Initialization
Always wait for Office.js to initialize before rendering React:
```typescript
Office.onReady((info) => {
  if (info.host === Office.HostType.Excel) {
    const root = ReactDOM.createRoot(document.getElementById('root')!);
    root.render(<App />);
  }
});
```

### 5. Sideloading for Development
To test the add-in locally:
1. Build and serve the add-in over HTTPS
2. In Excel: Insert > Get Add-ins > Upload My Add-in
3. Select the manifest.xml file
4. The add-in appears in the ribbon

### 6. State Management
Use Zustand for simplicity. Create separate stores:
- `chatStore.ts` - Messages, typing state, session
- `uiStore.ts` - Active tab, loading states

### 7. Error Boundaries
Wrap the app in error boundaries to prevent crashes from breaking the entire add-in:
```typescript
<ErrorBoundary fallback={<ErrorFallback />}>
  <App />
</ErrorBoundary>
```

### 8. Project Structure (Phase 1)
```
cellix/
├── package.json                    # Workspace root
├── pnpm-workspace.yaml
├── apps/
│   ├── addin/
│   │   ├── src/
│   │   │   ├── main.tsx           # Office.js init + React render
│   │   │   ├── App.tsx            # Root component with FluentProvider
│   │   │   ├── components/
│   │   │   │   ├── chat/
│   │   │   │   │   ├── ChatPane.tsx
│   │   │   │   │   ├── MessageList.tsx
│   │   │   │   │   ├── MessageBubble.tsx
│   │   │   │   │   ├── InputBox.tsx
│   │   │   │   │   └── TypingIndicator.tsx
│   │   │   │   └── common/
│   │   │   │       ├── ErrorBoundary.tsx
│   │   │   │       └── Loading.tsx
│   │   │   ├── store/
│   │   │   │   └── chatStore.ts
│   │   │   └── types/
│   │   │       └── index.ts
│   │   ├── manifest.xml
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── backend/
│       ├── src/
│       │   ├── index.ts           # Entry point
│       │   ├── server.ts          # Fastify setup
│       │   ├── routes/
│       │   │   └── health.ts      # Health check routes
│       │   └── lib/
│       │       └── env.ts         # Environment config
│       ├── tsconfig.json
│       └── package.json
│
└── packages/
    └── shared/
        ├── src/
        │   └── types/
        │       └── index.ts       # Shared types
        ├── tsconfig.json
        └── package.json
```

### 9. DO NOT Include Yet (Deferred to Later Phases)
- Socket.io / real-time features (Phase 7)
- OpenAI integration (Phase 3)
- Supabase database setup (Phase 3)
- Redis / Bull queue (Phase 9)
- RAG / embeddings (Phase 5)
- Excel read/write helpers (Phase 2)

### 10. Success Criteria for Phase 1
- [ ] `pnpm install` works from root
- [ ] `pnpm dev` starts both add-in and backend
- [ ] Add-in sideloads successfully in Excel
- [ ] Chat UI renders with Fluent UI styling
- [ ] Can type messages (stored in local state only)
- [ ] Backend `/health` returns 200 OK
- [ ] No console errors in browser or terminal
