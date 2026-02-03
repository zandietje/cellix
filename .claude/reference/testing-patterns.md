# Testing Patterns Reference

## Overview

Cellix uses a multi-layered testing approach to ensure quality across the add-in and backend.

## Testing Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit | Vitest | Component/function testing |
| Integration | Vitest | Service integration testing |
| E2E | Playwright | Full user flow testing |
| Office.js | Mocks + Sideload | Excel API testing |

## Directory Structure

```
apps/
├── addin/
│   └── src/
│       ├── components/
│       │   └── __tests__/
│       ├── lib/
│       │   ├── excel/
│       │   │   └── __tests__/
│       │   └── tools/
│       │       └── __tests__/
│       └── test/
│           ├── setup.ts
│           └── mocks/
│               └── office.ts
├── backend/
│   └── src/
│       ├── services/
│       │   └── __tests__/
│       └── routes/
│           └── __tests__/
└── e2e/
    └── tests/
```

## Vitest Configuration

```typescript
// apps/addin/vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/__tests__/**', '**/test/**'],
    },
  },
});
```

## Office.js Mocking

### Mock Setup

```typescript
// apps/addin/src/test/mocks/office.ts

// Mock Office namespace
const mockWorksheet = {
  name: 'Sheet1',
  getRange: vi.fn(),
  tables: {
    add: vi.fn(),
  },
};

const mockWorkbook = {
  worksheets: {
    getActiveWorksheet: vi.fn(() => mockWorksheet),
    items: [mockWorksheet],
    add: vi.fn(),
  },
  getSelectedRange: vi.fn(),
  tables: {
    items: [],
  },
};

const mockContext = {
  workbook: mockWorkbook,
  sync: vi.fn(() => Promise.resolve()),
};

// Mock Excel.run
export const mockExcelRun = vi.fn(
  async (callback: (context: typeof mockContext) => Promise<unknown>) => {
    return callback(mockContext);
  }
);

// Setup global Office mock
global.Excel = {
  run: mockExcelRun,
  ErrorCodes: {
    itemNotFound: 'ItemNotFound',
    invalidArgument: 'InvalidArgument',
  },
} as unknown as typeof Excel;

global.OfficeExtension = {
  Error: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
} as unknown as typeof OfficeExtension;

export { mockContext, mockWorkbook, mockWorksheet };
```

### Test Setup

```typescript
// apps/addin/src/test/setup.ts

import '@testing-library/jest-dom';
import { beforeEach, vi } from 'vitest';
import { mockExcelRun, mockContext } from './mocks/office';

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();

  // Reset mock range behavior
  mockContext.workbook.getSelectedRange.mockReturnValue({
    values: [['A', 'B'], [1, 2]],
    address: 'Sheet1!A1:B2',
    rowCount: 2,
    columnCount: 2,
    load: vi.fn(),
  });
});
```

## Unit Test Examples

### Testing Excel Helpers

```typescript
// apps/addin/src/lib/excel/__tests__/reader.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockContext, mockWorkbook } from '@/test/mocks/office';
import { getSelectedRangeValues, getSheetNames } from '../reader';

describe('Excel Reader', () => {
  describe('getSelectedRangeValues', () => {
    it('returns values from selected range', async () => {
      const mockRange = {
        values: [['Header1', 'Header2'], [100, 200]],
        address: 'A1:B2',
        load: vi.fn(),
      };
      mockWorkbook.getSelectedRange.mockReturnValue(mockRange);

      const result = await getSelectedRangeValues();

      expect(result).toEqual([['Header1', 'Header2'], [100, 200]]);
      expect(mockRange.load).toHaveBeenCalledWith(['values', 'address']);
      expect(mockContext.sync).toHaveBeenCalled();
    });

    it('handles empty selection', async () => {
      const mockRange = {
        values: [[]],
        address: 'A1',
        load: vi.fn(),
      };
      mockWorkbook.getSelectedRange.mockReturnValue(mockRange);

      const result = await getSelectedRangeValues();

      expect(result).toEqual([[]]);
    });
  });

  describe('getSheetNames', () => {
    it('returns all sheet names', async () => {
      mockWorkbook.worksheets.items = [
        { name: 'Sheet1' },
        { name: 'Data' },
        { name: 'Summary' },
      ];

      const result = await getSheetNames();

      expect(result).toEqual(['Sheet1', 'Data', 'Summary']);
    });
  });
});
```

### Testing Tool Validation

```typescript
// apps/addin/src/lib/tools/__tests__/validator.test.ts

import { describe, it, expect } from 'vitest';
import { validateToolCall } from '../validator';
import { writeRangeSchema, setFormulaSchema } from '../schemas';

describe('Tool Validator', () => {
  describe('write_range validation', () => {
    it('accepts valid parameters', () => {
      const result = validateToolCall({
        name: 'write_range',
        parameters: {
          address: 'A1:C10',
          values: [[1, 2, 3], [4, 5, 6]],
          reason: 'Adding sales data',
        },
      });

      expect(result.valid).toBe(true);
    });

    it('rejects invalid address format', () => {
      const result = validateToolCall({
        name: 'write_range',
        parameters: {
          address: 'invalid',
          values: [[1]],
          reason: 'Test',
        },
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('rejects operations exceeding cell limit', () => {
      const result = validateToolCall({
        name: 'write_range',
        parameters: {
          address: 'A1:Z100', // 2600 cells
          values: Array(100).fill(Array(26).fill(1)),
          reason: 'Too many cells',
        },
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('500');
    });
  });

  describe('set_formula validation', () => {
    it('accepts valid formulas', () => {
      const validFormulas = [
        '=SUM(A1:A10)',
        '=VLOOKUP(A1,B:C,2,FALSE)',
        '=IF(A1>100,"High","Low")',
        '=SUMIF(A:A,"=Product",B:B)',
      ];

      for (const formula of validFormulas) {
        const result = setFormulaSchema.safeParse({
          address: 'A1',
          formula,
          reason: 'Test',
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects formulas with external links', () => {
      const result = setFormulaSchema.safeParse({
        address: 'A1',
        formula: '=WEBSERVICE("https://api.example.com")',
        reason: 'Trying to fetch external data',
      });

      expect(result.success).toBe(false);
    });
  });
});
```

### Testing React Components

```typescript
// apps/addin/src/components/chat/__tests__/MessageBubble.test.tsx

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';

describe('MessageBubble', () => {
  it('renders user message correctly', () => {
    render(
      <MessageBubble
        role="user"
        content="Hello, help me analyze this data"
      />
    );

    expect(screen.getByText(/Hello, help me analyze/)).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveClass('user-message');
  });

  it('renders assistant message with markdown', () => {
    render(
      <MessageBubble
        role="assistant"
        content="Here is the **ROAS** calculation: `=Revenue/AdSpend`"
      />
    );

    expect(screen.getByText('ROAS')).toHaveStyle({ fontWeight: 'bold' });
    expect(screen.getByText('=Revenue/AdSpend')).toHaveClass('code');
  });

  it('renders tool call indicator', () => {
    render(
      <MessageBubble
        role="assistant"
        content="I'll write the data to your sheet."
        toolCalls={[{ name: 'write_range', status: 'pending' }]}
      />
    );

    expect(screen.getByText('write_range')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });
});
```

## Integration Test Examples

### Testing API Routes

```typescript
// apps/backend/src/routes/__tests__/chat.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'fastify';
import { chatRoutes } from '../chat';

describe('Chat Routes', () => {
  let app: ReturnType<typeof build>;

  beforeAll(async () => {
    app = build();
    await app.register(chatRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/chat returns streamed response', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: 'What is ROAS?',
        context: {
          selection: { address: 'A1:B10', values: [] },
          activeSheet: 'Sheet1',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
  });

  it('validates request body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        // Missing message
        context: {},
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
```

### Testing RAG Service

```typescript
// apps/backend/src/services/rag/__tests__/retriever.test.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { retrieveKnowledge } from '../retriever';

describe('RAG Retriever', () => {
  // These tests require test data in Supabase
  describe('retrieveKnowledge', () => {
    it('retrieves relevant KPI definitions', async () => {
      const chunks = await retrieveKnowledge('What is ROAS?', {
        category: 'kpi_definition',
        limit: 3,
      });

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].content.toLowerCase()).toContain('roas');
      expect(chunks[0].similarity).toBeGreaterThan(0.7);
    });

    it('filters by category', async () => {
      const chunks = await retrieveKnowledge('Shopee advertising', {
        category: 'platform_metric',
      });

      expect(chunks.every(c => c.category === 'platform_metric')).toBe(true);
    });

    it('returns empty for irrelevant queries', async () => {
      const chunks = await retrieveKnowledge('random unrelated query xyz', {
        threshold: 0.9,
      });

      expect(chunks.length).toBe(0);
    });
  });
});
```

## E2E Test Examples

```typescript
// e2e/tests/chat-flow.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Chat Flow', () => {
  test('user can send message and receive response', async ({ page }) => {
    // Note: E2E tests for add-ins typically require special setup
    // This is a simplified example

    await page.goto('/taskpane.html');

    // Wait for add-in to initialize
    await page.waitForSelector('[data-testid="chat-input"]');

    // Send message
    await page.fill('[data-testid="chat-input"]', 'What is ROAS?');
    await page.click('[data-testid="send-button"]');

    // Wait for response
    await expect(page.locator('[data-testid="assistant-message"]'))
      .toBeVisible({ timeout: 30000 });

    // Verify response contains relevant content
    const response = await page.textContent('[data-testid="assistant-message"]');
    expect(response?.toLowerCase()).toContain('roas');
  });
});
```

## Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test -- --watch

# Coverage
pnpm test -- --coverage

# Specific package
pnpm --filter @cellix/addin test
pnpm --filter @cellix/backend test

# E2E tests
pnpm test:e2e
```

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm lint
      - run: pnpm test -- --coverage
      - run: pnpm build
```
