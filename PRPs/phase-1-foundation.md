# PRP: Cellix Phase 1 - Foundation

## Overview

Initialize the complete monorepo structure and create a working Excel Add-in shell with basic chat UI and a Fastify backend API. This establishes the foundation for all subsequent development phases.

## Context

- **Phase:** 1 (Foundation)
- **Timeline:** Week 1 of MVP
- **Dependencies:** None (greenfield project)
- **Related Files:**
  - `CLAUDE.md` - Project context and rules
  - `FEATURE_PLAN.md` - Detailed specifications
  - `.claude/examples/` - Code patterns to follow
  - `.claude/reference/` - Technical documentation

## Documentation References

- [Office Add-in React Quickstart](https://learn.microsoft.com/en-us/office/dev/add-ins/quickstarts/excel-quickstart-react) - Microsoft's official guide
- [Office-Addin-React-Vite-Template](https://github.com/ExtraBB/Office-Addin-React-Vite-Template) - Vite-based template reference
- [Fluent UI React v9](https://react.fluentui.dev/) - UI component library
- [Fastify Getting Started](https://fastify.dev/docs/latest/Guides/Getting-Started/) - Backend framework docs
- [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/) - Type-safe Fastify setup
- [Office.js API Reference](https://learn.microsoft.com/en-us/javascript/api/excel) - Excel JavaScript API

## Research Findings

### Existing Patterns (from .claude/examples/)

1. **FastifyRoute.ts** - Route pattern with Zod validation, SSE streaming, health checks
2. **ExcelReadHelper.ts** - Office.js read patterns with proper `Excel.run()` and `context.sync()`
3. **office-js-patterns.md** - Critical patterns for batching, loading, error handling
4. **architecture.md** - System architecture and data flow

### External Best Practices

1. **Office.js Initialization**: Must wait for `Office.onReady()` before rendering React
2. **HTTPS Required**: Office Add-ins require HTTPS even in development - use `office-addin-dev-certs`
3. **Vite + Office.js**: Use `vite-plugin-office-addin` for proper manifest handling
4. **Fluent UI v9**: Use `FluentProvider` with `webLightTheme` for Office-consistent styling
5. **Fastify TypeScript**: Use generics for type-safe route handlers

### Gotchas & Edge Cases

1. **SSL Certificate Trust**: First-time setup requires trusting dev certificates
2. **CORS Configuration**: Must whitelist Office domains (`*.officeapps.live.com`, `*.office.com`)
3. **Office.js in Vite**: Import via CDN in HTML, not npm package (to avoid bundling issues)
4. **Manifest Changes**: Require Excel restart/re-sideload to take effect
5. **pnpm + Office.js**: May need `shamefully-hoist=true` for some Office.js tooling

## Implementation Plan

### Files to Create

```
cellix/
├── package.json                          # Root workspace config
├── pnpm-workspace.yaml                   # pnpm workspaces definition
├── .npmrc                                # pnpm configuration
├── .gitignore                            # Git ignore rules
├── tsconfig.base.json                    # Shared TypeScript config
├── .eslintrc.cjs                         # Shared ESLint config
├── .prettierrc                           # Prettier config
│
├── apps/
│   ├── addin/
│   │   ├── package.json                  # Add-in dependencies
│   │   ├── tsconfig.json                 # Add-in TypeScript config
│   │   ├── vite.config.ts                # Vite build config with SSL
│   │   ├── index.html                    # Entry HTML with Office.js CDN
│   │   ├── manifest.xml                  # Office Add-in manifest
│   │   └── src/
│   │       ├── main.tsx                  # Office.js init + React render
│   │       ├── App.tsx                   # Root component with routing
│   │       ├── vite-env.d.ts             # Vite type declarations
│   │       ├── components/
│   │       │   ├── chat/
│   │       │   │   ├── ChatPane.tsx      # Main chat container
│   │       │   │   ├── MessageList.tsx   # Message display list
│   │       │   │   ├── MessageBubble.tsx # Individual message component
│   │       │   │   ├── InputBox.tsx      # Message input with send
│   │       │   │   └── TypingIndicator.tsx
│   │       │   └── common/
│   │       │       ├── ErrorBoundary.tsx # Error boundary wrapper
│   │       │       ├── Loading.tsx       # Loading spinner
│   │       │       └── TabNavigation.tsx # Chat/Settings tabs
│   │       ├── store/
│   │       │   ├── chatStore.ts          # Zustand chat state
│   │       │   └── uiStore.ts            # UI state (tabs, loading)
│   │       ├── lib/
│   │       │   └── api.ts                # Axios client setup
│   │       └── types/
│   │           └── index.ts              # Shared types
│   │
│   └── backend/
│       ├── package.json                  # Backend dependencies
│       ├── tsconfig.json                 # Backend TypeScript config
│       └── src/
│           ├── index.ts                  # Entry point
│           ├── server.ts                 # Fastify server setup
│           ├── routes/
│           │   └── health.ts             # Health check routes
│           ├── plugins/
│           │   ├── cors.ts               # CORS configuration
│           │   └── logging.ts            # Request logging
│           └── lib/
│               └── env.ts                # Environment config with Zod
│
└── packages/
    └── shared/
        ├── package.json                  # Shared package config
        ├── tsconfig.json                 # Shared TypeScript config
        └── src/
            ├── index.ts                  # Exports
            └── types/
                ├── index.ts              # Type exports
                ├── chat.ts               # Chat message types
                └── api.ts                # API response types
```

### Implementation Steps

#### Step 1: Initialize Monorepo Structure

Create root configuration files:

```json
// package.json
{
  "name": "cellix",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "clean": "pnpm -r clean"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "eslint": "^8.56.0",
    "prettier": "^3.2.4"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

```ini
# .npmrc
shamefully-hoist=true
strict-peer-dependencies=false
```

#### Step 2: Setup Shared Package

```typescript
// packages/shared/src/types/chat.ts
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
  status: 'pending' | 'preview' | 'executed' | 'cancelled' | 'error';
}

// packages/shared/src/types/api.ts
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
}
```

#### Step 3: Setup Add-in Project

```typescript
// apps/addin/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const devCerts = () => {
  try {
    return {
      key: readFileSync(resolve(__dirname, '.cert/localhost-key.pem')),
      cert: readFileSync(resolve(__dirname, '.cert/localhost.pem')),
    };
  } catch {
    console.warn('Dev certificates not found. Run: npx office-addin-dev-certs install');
    return undefined;
  }
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    https: devCerts(),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        taskpane: resolve(__dirname, 'index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
```

```html
<!-- apps/addin/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cellix - AI Assistant for Ecommerce Analytics</title>
  <!-- Office.js MUST be loaded via CDN, not bundled -->
  <script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"></script>
  <link rel="stylesheet" href="/src/index.css" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

```typescript
// apps/addin/src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';

let isOfficeInitialized = false;

const render = () => {
  const container = document.getElementById('root');
  if (!container) throw new Error('Root element not found');

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <FluentProvider theme={webLightTheme}>
        <ErrorBoundary>
          <App isOfficeInitialized={isOfficeInitialized} />
        </ErrorBoundary>
      </FluentProvider>
    </React.StrictMode>
  );
};

// Wait for Office.js to initialize
Office.onReady((info) => {
  if (info.host === Office.HostType.Excel) {
    isOfficeInitialized = true;
  }
  render();
});
```

#### Step 4: Create Chat UI Components

```typescript
// apps/addin/src/store/chatStore.ts
import { create } from 'zustand';
import type { ChatMessage } from '@cellix/shared';

interface ChatState {
  messages: ChatMessage[];
  isTyping: boolean;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setTyping: (isTyping: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isTyping: false,
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ],
    })),
  setTyping: (isTyping) => set({ isTyping }),
  clearMessages: () => set({ messages: [] }),
}));
```

```tsx
// apps/addin/src/components/chat/ChatPane.tsx
import { makeStyles, tokens } from '@fluentui/react-components';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { TypingIndicator } from './TypingIndicator';
import { useChatStore } from '@/store/chatStore';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: tokens.spacingVerticalM,
  },
  input: {
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    padding: tokens.spacingVerticalS,
  },
});

export function ChatPane() {
  const styles = useStyles();
  const { messages, isTyping, addMessage } = useChatStore();

  const handleSend = async (content: string) => {
    addMessage({ role: 'user', content });

    // TODO: Phase 3 - Send to backend and get AI response
    // For now, just echo back
    useChatStore.getState().setTyping(true);
    setTimeout(() => {
      addMessage({
        role: 'assistant',
        content: `I received your message: "${content}". AI integration coming in Phase 3!`,
      });
      useChatStore.getState().setTyping(false);
    }, 1000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.messages}>
        <MessageList messages={messages} />
        {isTyping && <TypingIndicator />}
      </div>
      <div className={styles.input}>
        <InputBox onSend={handleSend} disabled={isTyping} />
      </div>
    </div>
  );
}
```

```tsx
// apps/addin/src/components/chat/MessageBubble.tsx
import { makeStyles, Text, tokens } from '@fluentui/react-components';
import type { ChatMessage } from '@cellix/shared';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    marginBottom: tokens.spacingVerticalS,
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  assistantContainer: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  userBubble: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  assistantBubble: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
  },
  timestamp: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
  },
});

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const styles = useStyles();
  const isUser = message.role === 'user';

  return (
    <div
      className={`${styles.container} ${
        isUser ? styles.userContainer : styles.assistantContainer
      }`}
    >
      <div
        className={`${styles.bubble} ${
          isUser ? styles.userBubble : styles.assistantBubble
        }`}
      >
        <Text>{message.content}</Text>
        <Text className={styles.timestamp}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </Text>
      </div>
    </div>
  );
}
```

```tsx
// apps/addin/src/components/chat/InputBox.tsx
import { useState, KeyboardEvent } from 'react';
import {
  makeStyles,
  Input,
  Button,
  tokens,
} from '@fluentui/react-components';
import { Send24Regular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  input: {
    flex: 1,
  },
});

interface InputBoxProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function InputBox({ onSend, disabled }: InputBoxProps) {
  const styles = useStyles();
  const [value, setValue] = useState('');

  const handleSend = () => {
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.container}>
      <Input
        className={styles.input}
        placeholder="Ask about your ecommerce data..."
        value={value}
        onChange={(_, data) => setValue(data.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <Button
        appearance="primary"
        icon={<Send24Regular />}
        onClick={handleSend}
        disabled={disabled || !value.trim()}
      />
    </div>
  );
}
```

#### Step 5: Setup Backend

```typescript
// apps/backend/src/lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3001'),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Phase 3+
  // OPENAI_API_KEY: z.string().optional(),
  // SUPABASE_URL: z.string().optional(),
  // SUPABASE_ANON_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

```typescript
// apps/backend/src/server.ts
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from './lib/env';

export async function buildServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // CORS for Office.js
  await fastify.register(cors, {
    origin: [
      'https://localhost:3000',
      /\.officeapps\.live\.com$/,
      /\.office\.com$/,
    ],
    credentials: true,
  });

  // Request logging
  fastify.addHook('onRequest', async (request) => {
    request.log.info({ url: request.url, method: request.method }, 'incoming request');
  });

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    reply.status(error.statusCode || 500).send({
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : error.message,
      },
    });
  });

  return fastify;
}
```

```typescript
// apps/backend/src/routes/health.ts
import { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@cellix/shared';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.0.1',
    });
  });

  fastify.get('/ready', async (_request, reply) => {
    // For Phase 1, just return ok
    // In later phases, check database, OpenAI, etc.
    return reply.send({
      status: 'ok',
      checks: {
        server: { status: 'ok' },
      },
    });
  });
}
```

```typescript
// apps/backend/src/index.ts
import { buildServer } from './server';
import { healthRoutes } from './routes/health';
import { env } from './lib/env';

async function main() {
  const server = await buildServer();

  // Register routes
  await server.register(healthRoutes, { prefix: '/api' });

  // Start server
  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    server.log.info(`Server running at http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
```

#### Step 6: Create Office Add-in Manifest

```xml
<!-- apps/addin/manifest.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp
  xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0"
  xmlns:ov="http://schemas.microsoft.com/office/taskpaneappversionoverrides"
  xsi:type="TaskPaneApp">

  <Id>a1b2c3d4-e5f6-7890-abcd-ef1234567890</Id>
  <Version>1.0.0.0</Version>
  <ProviderName>Cellix</ProviderName>
  <DefaultLocale>en-US</DefaultLocale>
  <DisplayName DefaultValue="Cellix"/>
  <Description DefaultValue="AI-powered assistant for Shopee and Lazada ecommerce analytics"/>
  <IconUrl DefaultValue="https://localhost:3000/assets/icon-32.png"/>
  <HighResolutionIconUrl DefaultValue="https://localhost:3000/assets/icon-64.png"/>
  <SupportUrl DefaultValue="https://github.com/your-org/cellix"/>

  <AppDomains>
    <AppDomain>https://localhost:3000</AppDomain>
    <AppDomain>https://localhost:3001</AppDomain>
  </AppDomains>

  <Hosts>
    <Host Name="Workbook"/>
  </Hosts>

  <Requirements>
    <Sets>
      <Set Name="ExcelApi" MinVersion="1.1"/>
    </Sets>
  </Requirements>

  <DefaultSettings>
    <SourceLocation DefaultValue="https://localhost:3000/"/>
  </DefaultSettings>

  <Permissions>ReadWriteDocument</Permissions>

  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Hosts>
      <Host xsi:type="Workbook">
        <DesktopFormFactor>
          <GetStarted>
            <Title resid="GetStarted.Title"/>
            <Description resid="GetStarted.Description"/>
            <LearnMoreUrl resid="GetStarted.LearnMoreUrl"/>
          </GetStarted>
          <FunctionFile resid="Taskpane.Url"/>
          <ExtensionPoint xsi:type="PrimaryCommandSurface">
            <OfficeTab id="TabHome">
              <Group id="CommandsGroup">
                <Label resid="CommandsGroup.Label"/>
                <Icon>
                  <bt:Image size="16" resid="Icon.16x16"/>
                  <bt:Image size="32" resid="Icon.32x32"/>
                  <bt:Image size="80" resid="Icon.80x80"/>
                </Icon>
                <Control xsi:type="Button" id="TaskpaneButton">
                  <Label resid="TaskpaneButton.Label"/>
                  <Supertip>
                    <Title resid="TaskpaneButton.Label"/>
                    <Description resid="TaskpaneButton.Tooltip"/>
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Icon.16x16"/>
                    <bt:Image size="32" resid="Icon.32x32"/>
                    <bt:Image size="80" resid="Icon.80x80"/>
                  </Icon>
                  <Action xsi:type="ShowTaskpane">
                    <TaskpaneId>ButtonId1</TaskpaneId>
                    <SourceLocation resid="Taskpane.Url"/>
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>

    <Resources>
      <bt:Images>
        <bt:Image id="Icon.16x16" DefaultValue="https://localhost:3000/assets/icon-16.png"/>
        <bt:Image id="Icon.32x32" DefaultValue="https://localhost:3000/assets/icon-32.png"/>
        <bt:Image id="Icon.80x80" DefaultValue="https://localhost:3000/assets/icon-80.png"/>
      </bt:Images>
      <bt:Urls>
        <bt:Url id="Taskpane.Url" DefaultValue="https://localhost:3000/"/>
        <bt:Url id="GetStarted.LearnMoreUrl" DefaultValue="https://github.com/your-org/cellix"/>
      </bt:Urls>
      <bt:ShortStrings>
        <bt:String id="GetStarted.Title" DefaultValue="Get started with Cellix"/>
        <bt:String id="CommandsGroup.Label" DefaultValue="Cellix"/>
        <bt:String id="TaskpaneButton.Label" DefaultValue="Cellix Chat"/>
      </bt:ShortStrings>
      <bt:LongStrings>
        <bt:String id="GetStarted.Description" DefaultValue="AI-powered assistant for your ecommerce analytics"/>
        <bt:String id="TaskpaneButton.Tooltip" DefaultValue="Open Cellix AI assistant"/>
      </bt:LongStrings>
    </Resources>
  </VersionOverrides>
</OfficeApp>
```

#### Step 7: Setup Development Scripts

```json
// apps/addin/package.json
{
  "name": "@cellix/addin",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext ts,tsx",
    "setup:certs": "npx office-addin-dev-certs install --days 365",
    "start": "npm run setup:certs && npm run dev",
    "sideload": "npx office-addin-debugging start manifest.xml"
  },
  "dependencies": {
    "@cellix/shared": "workspace:*",
    "@fluentui/react-components": "^9.46.0",
    "@fluentui/react-icons": "^2.0.224",
    "axios": "^1.6.5",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.7"
  },
  "devDependencies": {
    "@types/office-js": "^1.0.377",
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "@vitejs/plugin-react-swc": "^3.5.0",
    "office-addin-dev-certs": "^1.12.1",
    "office-addin-debugging": "^5.0.14",
    "typescript": "^5.3.3",
    "vite": "^5.0.12"
  }
}
```

```json
// apps/backend/package.json
{
  "name": "@cellix/backend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src --ext ts"
  },
  "dependencies": {
    "@cellix/shared": "workspace:*",
    "@fastify/cors": "^9.0.1",
    "fastify": "^4.25.2",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.11.5",
    "pino-pretty": "^10.3.1",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

### Code Snippets

#### Error Boundary Pattern

```tsx
// apps/addin/src/components/common/ErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react';
import { Text, Button, makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: tokens.spacingHorizontalXL,
    textAlign: 'center',
  },
});

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // TODO: Report to Sentry in Phase 12
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <ErrorFallback onRetry={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '24px',
      textAlign: 'center'
    }}>
      <Text size={500} weight="semibold">Something went wrong</Text>
      <Text size={300} style={{ marginTop: '8px', marginBottom: '16px' }}>
        Please try again or refresh the add-in
      </Text>
      <Button appearance="primary" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}
```

#### Loading Component

```tsx
// apps/addin/src/components/common/Loading.tsx
import { Spinner, makeStyles, Text, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: tokens.spacingVerticalM,
  },
});

interface LoadingProps {
  message?: string;
}

export function Loading({ message = 'Loading...' }: LoadingProps) {
  const styles = useStyles();
  return (
    <div className={styles.container}>
      <Spinner size="medium" />
      <Text>{message}</Text>
    </div>
  );
}
```

#### API Client Setup

```typescript
// apps/addin/src/lib/api.ts
import axios, { AxiosError } from 'axios';
import type { ApiResponse } from '@cellix/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://localhost:3001/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<unknown>>) => {
    const message = error.response?.data?.error?.message || 'Network error';
    console.error('API Error:', message);
    return Promise.reject(new Error(message));
  }
);

// Health check
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await apiClient.get('/health');
    return response.data.status === 'ok';
  } catch {
    return false;
  }
}
```

## Validation Gates

### Build

- [ ] `pnpm install` completes without errors
- [ ] `pnpm build` passes for all packages

### Lint

- [ ] `pnpm lint` passes with no errors
- [ ] No TypeScript errors (`tsc --noEmit`)

### Tests

- [ ] Unit test infrastructure setup (Vitest configured)
- [ ] Basic smoke tests pass

### Manual Testing

- [ ] Add-in sideloads successfully in Excel Desktop (Windows)
- [ ] Add-in sideloads successfully in Excel Desktop (Mac) - if available
- [ ] Add-in loads in Excel Online
- [ ] Chat UI renders correctly with Fluent UI styling
- [ ] Can type and send messages (local state only)
- [ ] Messages display in correct bubbles (user/assistant)
- [ ] Clear chat action works
- [ ] Backend `/api/health` returns 200 OK
- [ ] Backend `/api/ready` returns 200 OK
- [ ] No console errors in browser DevTools
- [ ] No errors in terminal (add-in or backend)

## Safety Considerations

Phase 1 has minimal safety concerns since:
- No actual Excel read/write operations
- No AI integration
- No database connections
- All state is local/ephemeral

However, establish these patterns for later phases:
- HTTPS for all development traffic
- CORS whitelist only Office domains
- Environment variables for sensitive config
- Error boundaries to prevent crashes

## Confidence Score

**9/10** - High confidence

**Reasoning:**
- Well-documented stack (Office.js, React, Fastify)
- Existing templates to reference (Office-Addin-React-Vite-Template)
- Clear project structure from FEATURE_PLAN.md
- Example code patterns in .claude/examples/
- No external API dependencies in Phase 1
- Standard monorepo setup with pnpm

**Minor uncertainties:**
- First-time SSL certificate setup may vary by OS
- Exact Fluent UI v9 component APIs may need adjustment
- pnpm workspace edge cases with Office.js tooling

## Notes

### Decisions Made

1. **Vite over Webpack**: Faster dev server (2-3s vs 30s+), better DX
2. **SWC over Babel**: Faster React compilation in Vite
3. **Zustand over Redux**: Simpler API, sufficient for add-in scope
4. **Office.js via CDN**: Required - bundling causes issues
5. **tsx for backend dev**: Native TypeScript execution without build step

### Deferred to Later Phases

- OpenAI/AI integration (Phase 3)
- Supabase database setup (Phase 3)
- Excel read/write helpers (Phase 2)
- Socket.io real-time (Phase 7)
- Sentry error tracking (Phase 12)

### Setup Commands Reference

```bash
# Initial setup
pnpm install

# Generate SSL certificates (first time)
cd apps/addin && pnpm setup:certs

# Start development
pnpm dev

# Sideload in Excel
cd apps/addin && pnpm sideload

# Build for production
pnpm build
```
