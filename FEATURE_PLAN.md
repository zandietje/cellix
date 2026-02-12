# Cellix - Excel AI Assistant for Ecommerce Analytics

## Product Vision

An Excel Office.js Add-in that provides an AI-powered chat assistant specialized for Shopee and Lazada ecommerce analytics. The assistant uses structured tool calls to manipulate Excel data with safety-first execution (preview before write).

### MVP Scope (Phases 1-4, ~4-6 weeks)
- AI chat that reads Excel context (selection, sheets, tables)
- Tool execution with preview-first safety controls
- Write operations: data, formulas, formatting
- Hardcoded ecommerce knowledge in system prompt

### Full Vision (Post-MVP)
- RAG-powered domain knowledge retrieval (Phase 5)
- Direct Shopee/Lazada API integration (Phase 6)
- Anomaly detection and proactive alerts (Phase 7)
- Automated report generation (Phase 9)
- Template library (Phase 10)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXCEL ADD-IN (Task Pane)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  Chat UI    │  │  Preview    │  │  Controls   │  │  Alerts    │ │
│  │  Component  │  │  Panel      │  │  Panel      │  │  Panel     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
│         │                │                │                │        │
│  ┌──────┴────────────────┴────────────────┴────────────────┴──────┐ │
│  │                    Excel Context Layer                         │ │
│  │  (Office.js read/write helpers, context extraction)            │ │
│  └────────────────────────────┬───────────────────────────────────┘ │
└───────────────────────────────┼─────────────────────────────────────┘
                                │ HTTPS
┌───────────────────────────────┼─────────────────────────────────────┐
│                         BACKEND API                                 │
│  ┌────────────────────────────┴───────────────────────────────────┐ │
│  │                      API Gateway (Fastify)                      │ │
│  └─────┬──────────┬──────────┬──────────┬──────────┬─────────────┘ │
│        │          │          │          │          │                │
│  ┌─────┴────┐ ┌───┴────┐ ┌───┴────┐ ┌───┴────┐ ┌───┴──────┐        │
│  │ AI       │ │ RAG    │ │ Tool   │ │ Data   │ │ Alert    │        │
│  │ Service  │ │ Service│ │ Valid. │ │ Connect│ │ Engine   │        │
│  └─────┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬──────┘        │
│        │          │          │          │          │                │
└────────┼──────────┼──────────┼──────────┼──────────┼────────────────┘
         │          │          │          │          │
    ┌────┴────┐ ┌───┴────┐     │     ┌────┴────┐ ┌───┴────┐
    │ OpenAI/ │ │Supabase│     │     │ Shopee  │ │ Queue  │
    │ Azure   │ │pgvector│     │     │ Lazada  │ │ (Bull) │
    │ OpenAI  │ │        │     │     │ APIs    │ │        │
    └─────────┘ └────────┘     │     └─────────┘ └────────┘
                               │
                    ┌──────────┴──────────┐
                    │   Tool Whitelist    │
                    │   JSON Schema Val.  │
                    └─────────────────────┘
```

---

## Tech Stack

### Add-in (Frontend)
| Component | Technology | Phase |
|-----------|------------|-------|
| Framework | React 18 + TypeScript | MVP |
| Bundler | Vite | MVP |
| Office Integration | Office.js (Excel API) | MVP |
| State Management | Zustand | MVP |
| UI Components | Fluent UI React v9 | MVP |
| HTTP Client | Axios | MVP |
| Data Processing | Arquero (~105KB) | Phase 5 |
| Real-time | Socket.io Client | Phase 8+ |

### Backend
| Component | Technology | Phase |
|-----------|------------|-------|
| Runtime | Node.js 20 LTS | MVP |
| Framework | Fastify | MVP |
| AI Provider | OpenAI (Claude-ready abstraction) | MVP |
| Embeddings | text-embedding-3-small | Phase 6 |
| Vector DB | Supabase pgvector | Phase 6 |
| Queue | Bull + Redis | Phase 10 |
| Validation | Zod | MVP |
| Auth | Supabase Auth | MVP |

### Infrastructure
| Component | Technology | Phase |
|-----------|------------|-------|
| Hosting | Vercel (add-in) + Railway/Render (backend) | MVP |
| Database | Supabase (Postgres) | MVP |
| Vector Extension | pgvector | Phase 6 |
| Cache | Redis (Upstash) | Phase 6+ |
| Monitoring | Sentry | Phase 13 |

> **MVP Principle:** Only install dependencies when needed. Start lean.

---

## Feature Phases

### MVP Timeline (Phases 1-4)

| Week | Phase | Focus | Deliverable |
|------|-------|-------|-------------|
| 1 | Phase 1 | Foundation | Add-in loads, chat UI, backend health |
| 2 | Phase 2 | Excel Integration | Read/write helpers, context extraction |
| 3 | Phase 3 | AI Chat | Tool schemas, streaming responses |
| 4 | Phase 4 | Tool Execution | Preview system, safety controls |
| 5-6 | Testing | Polish | Sideload testing, bug fixes, AppSource prep |

### Post-MVP Roadmap

| Phase | Name | Priority | Dependency |
|-------|------|----------|------------|
| 5 | Sheet Intelligence | High | Enables LLM to understand large Excel files |
| 6 | RAG Knowledge | High | Validates knowledge retrieval value |
| 7 | Data Connectors | High | Requires Shopee/Lazada OAuth approval |
| 8 | Anomaly Detection | Medium | Requires Phase 7 data |
| 9 | Comparison Intelligence | Medium | Requires Phase 7 data |
| 10 | Report Generation | Medium | Core MVP working |
| 11 | Template Library | Low | After reports work |
| 12 | Notifications | Low | After alerts work |
| 13 | Production Polish | High | Before AppSource |

---

## PHASE 1: Foundation (MVP Week 1)
**Goal:** Working add-in scaffold with basic chat UI

### 1.1 Project Setup
- [ ] Initialize monorepo structure (pnpm workspaces)
- [ ] Setup add-in project with Vite + React + TypeScript
- [ ] Configure Office.js manifest.xml
- [ ] Setup backend project with Fastify + TypeScript
- [ ] Configure Supabase project (database + auth)
- [ ] Setup development SSL certificates (required for Office.js)
- [ ] Configure ESLint, Prettier, tsconfig

### 1.2 Add-in Shell
- [ ] Create taskpane HTML entry point
- [ ] Implement Office.js initialization wrapper
- [ ] Create App shell with Fluent UI provider
- [ ] Implement basic routing (Chat / Settings)
- [ ] Add loading states and error boundaries

### 1.3 Basic Chat UI
- [ ] Message list component (user/assistant bubbles)
- [ ] Input box with send button
- [ ] Typing indicator
- [ ] Auto-scroll behavior
- [ ] Message timestamps
- [ ] Clear chat action

### 1.4 Backend Foundation
- [ ] Fastify server setup with CORS
- [ ] Health check endpoint
- [ ] Request logging middleware
- [ ] Error handling middleware
- [ ] Environment configuration

**Deliverable:** Add-in loads in Excel, shows chat UI, backend responds to health checks

---

## PHASE 2: Excel Integration (MVP Week 2)
**Goal:** Read and write Excel data via Office.js

### 2.1 Excel Read Helpers
- [ ] `getSelectedRangeValues()` - Get values from selection
- [ ] `getSelectedRangeAddress()` - Get address (e.g., "A1:C10")
- [ ] `getSelectedRangeHeaders()` - Get first row as headers
- [ ] `getUsedRangeSample(maxRows)` - Get sample of used range
- [ ] `getSheetNames()` - List all sheets
- [ ] `getActiveSheetName()` - Current sheet name
- [ ] `getTableMetadata()` - Get Excel tables info
- [ ] `getNamedRanges()` - Get named ranges

### 2.2 Excel Write Helpers
- [ ] `writeRange(address, values)` - Write 2D array to range
- [ ] `setFormula(address, formula)` - Set formula in cell
- [ ] `setFormulas(address, formulas)` - Set formulas in range
- [ ] `formatRange(address, format)` - Apply formatting
- [ ] `createSheet(name)` - Create new worksheet
- [ ] `addTable(address, name, headers)` - Create Excel table
- [ ] `highlightCells(address, color)` - Highlight range
- [ ] `clearRange(address)` - Clear contents

### 2.3 Context Extraction
- [ ] Build context object from current selection
- [ ] Sample large ranges (max 50 rows)
- [ ] Detect data types (numbers, dates, currencies)
- [ ] Identify potential headers
- [ ] Calculate basic stats (count, sum, avg for numeric columns)

### 2.4 Control Panel UI
- [ ] "Use Selected Range" button
- [ ] "Use Active Sheet" button
- [ ] Context preview display
- [ ] Range size warning for large selections

**Deliverable:** Add-in can read/write Excel data, shows context in UI

---

## PHASE 3: AI Chat Integration (MVP Week 3)
**Goal:** Working AI chat with tool calling

### 3.1 AI Service Setup
- [ ] **AI Provider abstraction interface** (support OpenAI + future Claude)
- [ ] OpenAI client configuration
- [ ] Azure OpenAI fallback support
- [ ] Token counting utilities
- [ ] **Token budget management** (per-session limits)
- [ ] Rate limiting handler
- [ ] Streaming response support

### 3.2 Tool Schema Definition
- [ ] Define core Excel tools schema (JSON Schema)
- [ ] Define analytics tools schema
- [ ] Tool parameter validation with Zod
- [ ] Tool whitelist enforcement
- [ ] Generate TypeScript types from schemas

### 3.3 Core Excel Tools
```typescript
// Excel Manipulation Tools
- read_range(address)
- write_range(address, values, reason)
- set_formula(address, formula, reason)
- format_range(address, style, reason)
- create_sheet(name, reason)
- add_table(address, name, headers, reason)
- highlight_cells(address, color, reason)
- add_summary_row(address, metrics, reason)
```

### 3.4 Analytics Tools (Reasoning Only)
```typescript
// These return explanations, no Excel writes
- explain_kpi(kpi_name, context)
- compare_metrics(metric, period1, period2)
- interpret_trend(data_description)
- suggest_actions(analysis_context)
```

### 3.5 Prompt Builder
- [ ] System prompt with **hardcoded ecommerce knowledge** (KPIs, formulas, terminology)
- [ ] Excel context injection
- [ ] Tool schema injection
- [ ] RAG context placeholder (for Phase 5)
- [ ] Conversation history management
- [ ] Token budget enforcement

> **MVP Note:** Use hardcoded domain knowledge in system prompt. RAG adds complexity - defer to Phase 5 after validating core value.

### 3.6 Chat Endpoint
- [ ] POST /api/chat endpoint
- [ ] Request validation
- [ ] Context size limits
- [ ] Streaming response
- [ ] Tool call extraction
- [ ] Error handling

**Deliverable:** Chat with AI, receive structured tool calls

---

## PHASE 4: Tool Execution Engine (MVP Week 4)
**Goal:** Safe preview-first tool execution - THE CORE DIFFERENTIATOR

### 4.1 Tool Validation Layer
- [ ] JSON schema validation for each tool
- [ ] Address format validation (A1 notation)
- [ ] Value type validation
- [ ] Size limit enforcement (max 500 cells per write)
- [ ] Formula safety check (no external links, no macros)

### 4.2 Preview System
- [ ] Preview component UI
- [ ] Show pending actions list
- [ ] Diff view for cell changes
- [ ] Affected range highlight
- [ ] Cell count display
- [ ] Warning indicators

### 4.3 Execution Engine
- [ ] Action queue management
- [ ] Sequential execution
- [ ] Rollback support (undo stack)
- [ ] Progress reporting
- [ ] Error recovery
- [ ] Success confirmation

### 4.4 Safety Controls
- [ ] Confirm dialog for writes > 50 cells
- [ ] Block overwrites without preview
- [ ] No sheet deletion (v1)
- [ ] No workbook-level changes
- [ ] Audit log of all actions

**Deliverable:** Preview actions before execution, safe writes to Excel

---

---

# POST-MVP PHASES

> **Important:** Complete and validate MVP (Phases 1-4) before starting these phases.
> Users should be successfully using the add-in before investing in these features.

---

## PHASE 5: Sheet Intelligence System (Post-MVP)
**Goal:** Enable LLM to understand and query large Excel files intelligently
**Priority:** High - Foundation for accurate analysis of real-world data
**Prerequisite:** MVP validated with users

### Problem Statement
Current approach sends up to 1000 cells (50 rows × 20 cols) regardless of the question. This is:
- **Wasteful**: Most questions need only 2-5 columns
- **Lossy**: Large sheets get sampled, losing important data
- **Blind**: LLM can't reason about data it hasn't seen

### Solution: Profile-First Architecture
```
Current Flow:
User Question → Extract Full Context (1000 cells) → Send to LLM → LLM Reasons

New Flow:
User Question → Send Profile Only (~500 tokens) → LLM Plans Query →
Execute Targeted Fetch (50-200 cells) → LLM Analyzes → Response
```

---

### 5A: Sheet Profile System (Week 1)

**Goal:** Build a cached metadata layer about workbook structure

#### 5A.1 Profile Types (`packages/shared/src/types/profile.ts`)
- [ ] Define `SheetProfile` interface
  - sheetName, usedRange, rowCount, columnCount
  - columns: ColumnProfile[]
  - tables: TableInfo[]
  - extractedAt, version
- [ ] Define `ColumnProfile` interface
  - index, header, inferredName (semantic: "date", "sku", "revenue")
  - dataType, stats, samples (first 3 values)
  - uniqueCount, nullCount, quality signals
- [ ] Define `QualitySignals` interface
  - hasDuplicates, hasMixedTypes, hasOutliers, completeness (0-1)
- [ ] Define `WorkbookInventory` for lightweight all-sheets summary

#### 5A.2 Profile Extractor (`apps/addin/src/lib/excel/profiler.ts`)
- [ ] `extractSheetProfile(sheetName?)` - Full profile for one sheet
- [ ] `extractWorkbookInventory()` - Lightweight all-sheets summary
- [ ] `detectColumnSemantics(headers, samples)` - Infer column meanings
  - Pattern matching for SKU, OrderId, dates, currencies
  - Header name matching ("SKU", "Product ID", "Revenue", etc.)
  - Value distribution analysis
- [ ] `calculateColumnStats(values)` - Streaming stats calculation
- [ ] `detectQualityIssues(column)` - Find duplicates, mixed types, outliers
- [ ] Chunked reading for large sheets (5000 rows per chunk)

#### 5A.3 Profile Cache (`apps/addin/src/lib/excel/profileCache.ts`)
- [ ] In-memory cache with localStorage backup
- [ ] Version tracking for invalidation
- [ ] `getProfile(sheet)` - Get cached or extract new
- [ ] `invalidate(sheet)` - Mark sheet profile as stale
- [ ] `invalidateAll()` - Clear entire cache

#### 5A.4 Profile Event Listeners
- [ ] Listen for `worksheet.onChanged` events
- [ ] Debounced profile invalidation (wait 2s after last change)
- [ ] Re-extract on next context request
- [ ] Background extraction with progress indicator

#### 5A.5 Add Arquero for Data Processing
Arquero is a lightweight (~105KB) JavaScript library for query processing and transformation of array-backed data tables. It handles 1M+ rows in the browser with zero network latency.

- [ ] Install `arquero` package in add-in
- [ ] Create `apps/addin/src/lib/data/arquero.ts` wrapper utilities
- [ ] Implement table creation from Excel data: `aq.from(values, { columns })`
- [ ] Expose common operations:
  ```typescript
  // Filter rows
  table.filter(d => d.date >= startDate && d.category === 'Electronics')

  // Group and aggregate
  table.groupby('category').rollup({
    total: d => op.sum(d.revenue),
    avg: d => op.mean(d.revenue),
    count: d => op.count()
  })

  // Statistics
  table.rollup({
    min: d => op.min(d.value),
    max: d => op.max(d.value),
    stdev: d => op.stdev(d.value),
    median: d => op.median(d.value)
  })

  // Outlier detection (z-score)
  const stats = table.rollup({ mean: d => op.mean(d.value), std: d => op.stdev(d.value) });
  table.derive({ zscore: d => (d.value - stats.mean) / stats.std })
        .filter(d => Math.abs(d.zscore) > threshold)
  ```
- [ ] Create helper for streaming large datasets through Arquero

**Why Arquero over Python/Pandas:**
- Data already in browser via Office.js (no network round-trip)
- 105KB vs deploying separate Python service
- Handles typical ecommerce data sizes (10K-1M rows)
- dplyr-like fluent API, well-maintained by UW Interactive Data Lab

**Deliverable:** Cached sheet metadata that persists across questions + Arquero-powered data processing

---

### 5B: Smart Retrieval Tools (Week 2)

**Goal:** Let the LLM request specific data slices instead of receiving everything

#### 5B.1 New Read Tool Schemas (`apps/backend/src/services/tools/schemas.ts`)

```typescript
// Get sheet profile (always call first)
get_profile: {
  sheet: z.string().optional()  // Default: active sheet
}

// Fetch filtered, projected rows
select_rows: {
  sheet: z.string().optional(),
  columns: z.array(z.string()),     // Column letters or headers
  filters: z.array(z.object({
    column: z.string(),
    operator: z.enum(["eq", "neq", "gt", "lt", "gte", "lte",
                      "contains", "startsWith", "between", "in"]),
    value: z.unknown(),
    value2: z.unknown().optional()  // For "between"
  })).optional(),
  orderBy: z.object({
    column: z.string(),
    direction: z.enum(["asc", "desc"])
  }).optional(),
  limit: z.number().default(50),
  offset: z.number().default(0)
}

// Get aggregated data
group_aggregate: {
  sheet: z.string().optional(),
  groupBy: z.array(z.string()),     // Columns to group by
  metrics: z.array(z.object({
    column: z.string(),
    aggregation: z.enum(["sum", "avg", "min", "max", "count", "countUnique"])
  })),
  filters: z.array(FilterSpec).optional(),
  orderBy: z.object({
    metric: z.string(),
    direction: z.enum(["asc", "desc"])
  }).optional(),
  limit: z.number().default(100)
}

// Detect anomalies in a column
find_outliers: {
  sheet: z.string().optional(),
  column: z.string(),
  method: z.enum(["zscore", "iqr", "percentile"]),
  threshold: z.number().default(2),  // 2 std devs or 1.5 IQR
  limit: z.number().default(20)
}

// Search for specific values
search_values: {
  query: z.string(),
  columns: z.array(z.string()).optional(),  // Search all if not specified
  fuzzy: z.boolean().default(false),
  limit: z.number().default(20)
}
```

#### 5B.2 Read Tool Executors (`apps/addin/src/lib/tools/readers.ts`)
All executors use **Arquero** for data processing (see 5A.5).

- [ ] `executeSelectRows()` - Filter and project data using Arquero
  ```typescript
  const result = aq.from(data)
    .filter(buildFilterPredicate(params.filters))
    .select(params.columns)
    .orderby(params.orderBy ? aq.desc(params.orderBy.column) : undefined)
    .slice(params.offset, params.offset + params.limit)
    .objects();
  ```
  - Date parsing for date filters
  - Numeric comparison for number filters
  - String matching (contains, startsWith)
  - Column resolution (letter or header name)

- [ ] `executeGroupAggregate()` - Aggregate data by groups using Arquero
  ```typescript
  const result = aq.from(data)
    .filter(buildFilterPredicate(params.filters))
    .groupby(params.groupBy)
    .rollup(buildMetrics(params.metrics))  // { total: d => op.sum(d.revenue) }
    .orderby(aq.desc(params.orderBy?.metric))
    .slice(0, params.limit)
    .objects();
  ```
  - Supports: sum, avg, min, max, count, countUnique
  - Automatic null handling

- [ ] `executeFindOutliers()` - Detect anomalies using Arquero
  ```typescript
  // Z-score method
  const stats = aq.from(data).rollup({
    mean: d => op.mean(d[column]),
    std: d => op.stdev(d[column])
  }).object();

  const result = aq.from(data)
    .derive({ zscore: d => Math.abs((d[column] - stats.mean) / stats.std) })
    .filter(d => d.zscore > threshold)
    .orderby(aq.desc('zscore'))
    .slice(0, params.limit)
    .objects();
  ```
  - Z-score method: (value - mean) / stddev > threshold
  - IQR method: value < Q1 - 1.5*IQR or value > Q3 + 1.5*IQR
  - Percentile method: value outside p5-p95
- [ ] `executeSearchValues()` - Find matching rows
  - Exact match
  - Fuzzy matching (Levenshtein distance)
  - Multi-column search

#### 5B.3 Update AI System Prompt
- [ ] Document new tools with examples
- [ ] Add "Query Planning" section to prompt
- [ ] Emphasize: "Use get_profile first, then select_rows/group_aggregate"
- [ ] Examples of good query plans:
  ```
  User: "What's my ROAS for electronics last week?"
  Plan:
  1. get_profile() → Find date column, category column, revenue/spend columns
  2. select_rows(columns: [date, category, revenue, adSpend],
                 filters: [{column: date, op: gte, value: "2024-01-01"},
                          {column: category, op: eq, value: "Electronics"}])
  3. Calculate ROAS from results
  ```

**Deliverable:** LLM can request exactly the data it needs

---

### 5C: Profile-First Context Flow (Week 3)

**Goal:** Change context extraction to send profile first, data on demand

#### 5C.1 Modify Context Extraction (`apps/addin/src/lib/excel/context.ts`)
- [ ] New `extractContextWithProfile()` function
  ```typescript
  async function extractContextWithProfile(options?: {
    includeData?: boolean,
    dataLimit?: number
  }): Promise<ExcelContextWithProfile>
  ```
- [ ] Default behavior: Profile + selection address only (no data)
- [ ] Optional: Include sampled data for simple questions
- [ ] Return structure:
  ```typescript
  {
    profile: SheetProfile,
    inventory: WorkbookInventory,  // All sheets summary
    selection: {
      address: string,
      size: { rows: number, cols: number },
      data?: unknown[][]  // Only if includeData=true
    }
  }
  ```

#### 5C.2 Update Backend Context Formatter (`apps/backend/src/services/ai/context.ts`)
- [ ] New `formatProfileContext()` function
- [ ] Compact profile representation (~500 tokens for typical sheet)
  ```
  ## Sheet Profile: "Sales Data"
  Rows: 15,234 | Columns: 12 | Tables: 1

  ### Columns:
  | # | Header | Type | Semantic | Stats |
  |---|--------|------|----------|-------|
  | A | Date | date | order_date | 2024-01-01 to 2024-12-31 |
  | B | SKU | text | product_id | 1,523 unique |
  | C | Category | text | category | 5 unique: Electronics, Fashion, ... |
  | D | Revenue | currency | revenue | Sum: $1.2M, Avg: $78.50 |
  | E | Ad Spend | currency | ad_spend | Sum: $245K, Avg: $16.10 |
  ...

  ### Quality Notes:
  - Column F has 12% missing values
  - Column H has mixed types (89% numbers, 11% text)
  ```
- [ ] Include column relationships if detected
- [ ] Include quality warnings

#### 5C.3 Update Chat Route (`apps/backend/src/routes/chat.ts`)
- [ ] First message: Send profile only
- [ ] Track tool results in conversation
- [ ] If LLM requests data via tool: Execute and include in next context
- [ ] Token budget management for tool results

#### 5C.4 Question Classification
- [ ] Add question type detection to planner:
  - `structural`: "what sheets exist?" → Profile only
  - `lookup`: "what's in cell A1?" → Single cell fetch
  - `analytical`: "what's my avg ROAS?" → Filtered slice
  - `comparative`: "compare this week vs last" → Two time slices
  - `exploratory`: "what stands out?" → Profile + outliers
- [ ] Use question type to determine initial context depth

**Deliverable:** Context extraction is intelligent and token-efficient

---

### 5D: Office.js Performance Optimization (Week 4)

**Goal:** Handle large sheets (100K+ rows) without hitting limits

#### 5D.1 Chunked Range Reader (`apps/addin/src/lib/excel/chunkedReader.ts`)
- [ ] `readLargeRange()` function
  ```typescript
  async function readLargeRange(
    address: string,
    options: {
      chunkSize?: number;      // Default 5000 rows
      columns?: string[];      // Only load specific columns
      onProgress?: (percent: number) => void;
      abortSignal?: AbortSignal;
    }
  ): Promise<unknown[][]>
  ```
- [ ] Automatic chunking based on range size
- [ ] Memory-efficient streaming with generators
- [ ] Progress reporting for UI feedback
- [ ] Abort support for cancellation

#### 5D.2 Streaming Aggregators (`apps/addin/src/lib/excel/streamingStats.ts`)
- [ ] Compute stats without loading all data at once
- [ ] `StreamingStats` class:
  ```typescript
  class StreamingStats {
    add(value: number): void;
    getSum(): number;
    getCount(): number;
    getAvg(): number;
    getMin(): number;
    getMax(): number;
    getStdDev(): number;  // Welford's algorithm
  }
  ```
- [ ] `StreamingPercentiles` for outlier detection (reservoir sampling)
- [ ] `StreamingUnique` for cardinality estimation (HyperLogLog optional)

#### 5D.3 Background Profiling
- [ ] Profile extraction runs in background on sheet activation
- [ ] UI shows "Analyzing sheet..." indicator
- [ ] Profile available for next question
- [ ] Progressive profiling:
  - Level 0: Sheet names + used ranges (instant)
  - Level 1: Headers + row counts (on sheet focus)
  - Level 2: Column types + basic stats (on first question)
  - Level 3: Relationships + quality signals (on complex questions)

#### 5D.4 Memory Management
- [ ] Clear large arrays after processing
- [ ] Use generators for streaming where possible
- [ ] Monitor memory usage (log warnings if high)
- [ ] Graceful degradation for very large sheets

#### 5D.5 Office.js Best Practices
- [ ] Batch all operations in single `Excel.run()`
- [ ] Minimize `context.sync()` calls
- [ ] Load only needed properties: `range.load("values")` not `range.load()`
- [ ] Use `range.track()` for long-running operations
- [ ] Suspend calculation during large writes: `context.application.suspendApiCalculationUntilNextSync()`

**Deliverable:** Add-in handles 100K+ row sheets without performance issues

---

### Phase 5 Tool Reference

#### New Read Tools (Phase 5)
| Tool | Parameters | Description |
|------|------------|-------------|
| `get_profile` | sheet? | Get sheet metadata and column info |
| `select_rows` | columns, filters, orderBy, limit, offset | Fetch filtered rows |
| `group_aggregate` | groupBy, metrics, filters, limit | Get aggregated data |
| `find_outliers` | column, method, threshold, limit | Detect anomalies |
| `search_values` | query, columns, fuzzy, limit | Search for values |

---

### Phase 5 Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Context token reduction | 50-70% fewer tokens | Compare avg tokens before/after |
| Query accuracy | >90% correct data fetched | Manual review of 50 queries |
| Profile extraction time | <2s for 50K rows | Performance logging |
| Large sheet support | 100K+ rows without error | Test with large files |
| LLM query planning | >80% use profile first | Log tool call patterns |

---

### Phase 5 Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Column inference is wrong | High | Let LLM correct, store user corrections |
| Profile extraction is slow | Medium | Background + progressive levels |
| Query planning adds latency | Medium | Cache common patterns, parallel profile |
| Office.js limits hit | Low | Chunking, tested limits, fallbacks |
| LLM ignores profile | Medium | Strong prompt guidance + examples |

**Deliverable:** LLM can intelligently understand and query large Excel files

---

## PHASE 6: RAG Knowledge System (Post-MVP)
**Goal:** Domain knowledge retrieval for ecommerce context
**Priority:** High - Enhances AI accuracy
**Prerequisite:** Phase 5 complete (profile system provides better context for RAG)

### 6.1 Supabase Vector Setup
- [ ] Create embeddings table schema
- [ ] Setup pgvector extension
- [ ] Create similarity search function
- [ ] Create ingestion API
- [ ] Setup RLS policies

```sql
-- Schema
create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(1536),
  source text not null,
  category text not null,
  tags text[],
  metadata jsonb,
  created_at timestamptz default now()
);

-- Categories: kpi_definition, platform_metric, glossary, formula_rule, report_convention
```

### 6.2 Embedding Pipeline
- [ ] Text chunking utility (500 tokens, 100 overlap)
- [ ] Markdown parser
- [ ] Batch embedding generation
- [ ] Upsert to Supabase
- [ ] Source tracking

### 6.3 Seed Knowledge Documents

#### ecommerce_kpis.md
```markdown
- ROAS (Return on Ad Spend)
- CTR (Click-Through Rate)
- CVR (Conversion Rate)
- AOV (Average Order Value)
- CAC (Customer Acquisition Cost)
- GMV (Gross Merchandise Value)
- Net Revenue
- Refund Rate
- Units Sold
- Sessions
- Add to Cart Rate
- Checkout Abandonment Rate
```

#### shopee_metrics.md
```markdown
- Shopee Ads metrics (CPC, impressions, clicks)
- Campaign types (Discovery, Search, Shop)
- Fee structure (commission, transaction fee, shipping)
- Seller dashboard export columns
- Flash sale metrics
- Voucher performance
- Chat response rate
```

#### lazada_metrics.md
```markdown
- Lazada Sponsored Solutions metrics
- Campaign types (Sponsored Discovery, Search, Affiliate)
- Fee structure (commission tiers, payment fees)
- Seller Center export columns
- Campaign ROI calculation
- Traffic source breakdown
```

#### formulas_library.md
```markdown
- ROAS calculation: =Revenue/AdSpend
- CVR calculation: =Orders/Sessions
- AOV calculation: =Revenue/Orders
- Profit margin: =(Revenue-Cost-Fees)/Revenue
- YoY growth: =(Current-Previous)/Previous
- Common SUMIF/VLOOKUP patterns for ecommerce
```

### 6.4 Retrieval Service
- [ ] Query embedding generation
- [ ] Similarity search with threshold
- [ ] Category filtering
- [ ] Result ranking
- [ ] Context formatting for prompt

### 6.5 RAG Integration
- [ ] Inject retrieved chunks into prompt
- [ ] Source attribution in responses
- [ ] Confidence scoring
- [ ] Fallback for no matches

**Deliverable:** AI responses grounded in ecommerce domain knowledge

---

## PHASE 7: Data Connectors (Post-MVP)
**Goal:** Connect to Shopee and Lazada APIs
**Priority:** High - Key value prop, but requires OAuth approval (can take weeks)
**Prerequisite:** MVP validated, OAuth apps approved by platforms

> **Warning:** Shopee and Lazada OAuth app approval can take 2-4 weeks. Apply early but don't block MVP on this.

### 6.1 Authentication Layer
- [ ] OAuth2 flow for Shopee Open Platform
- [ ] OAuth2 flow for Lazada Open Platform
- [ ] Token storage in Supabase
- [ ] Token refresh handling
- [ ] Multi-store support

### 6.2 Shopee Connector
- [ ] Shop info endpoint
- [ ] Order list endpoint
- [ ] Product list endpoint
- [ ] Campaign performance endpoint
- [ ] Ads metrics endpoint
- [ ] Data normalization layer

### 6.3 Lazada Connector
- [ ] Seller info endpoint
- [ ] Order list endpoint
- [ ] Product list endpoint
- [ ] Sponsored Solutions metrics endpoint
- [ ] Traffic analytics endpoint
- [ ] Data normalization layer

### 6.4 Data Sync Service
- [ ] Manual sync trigger
- [ ] Incremental sync logic
- [ ] Data caching in Supabase
- [ ] Sync status tracking
- [ ] Error handling and retry

### 6.5 Connector Tools
```typescript
- sync_shopee_orders(date_range)
- sync_lazada_orders(date_range)
- sync_shopee_ads(campaign_ids)
- sync_lazada_ads(campaign_ids)
- get_platform_summary(platform, date_range)
```

### 6.6 Import to Excel Tools
```typescript
- import_orders(platform, date_range, destination_sheet)
- import_products(platform, destination_sheet)
- import_campaign_data(platform, campaign_ids, destination_sheet)
```

**Deliverable:** Pull live data from Shopee/Lazada into Excel

---

## PHASE 8: Anomaly Detection (Post-MVP)
**Goal:** Proactive alerts for metric anomalies
**Priority:** Medium - Requires Phase 7 data connectors
**Adds:** Socket.io for real-time alerts

### 7.1 Anomaly Detection Engine
- [ ] Baseline calculation (rolling average)
- [ ] Standard deviation thresholds
- [ ] Percentage change detection
- [ ] Zero/null detection
- [ ] Spike detection
- [ ] Drop detection

### 7.2 Metric Monitors
```typescript
// Configurable monitors
- Ad spend anomaly (>200% daily change)
- Conversion rate drop (>30% below baseline)
- Zero sales alert (0 orders with >100 sessions)
- ROAS threshold (<1.0 warning, <0.5 critical)
- Refund rate spike (>10% of orders)
- Stock-out detection (0 inventory, active ads)
```

### 7.3 Alert System
- [ ] Alert generation service
- [ ] Priority levels (info, warning, critical)
- [ ] Alert storage in Supabase
- [ ] Deduplication logic
- [ ] Snooze functionality

### 7.4 Alert UI in Add-in
- [ ] Alert panel/tab
- [ ] Alert cards with context
- [ ] Acknowledge action
- [ ] Jump to relevant data
- [ ] Alert history

### 7.5 Anomaly Tools
```typescript
- detect_anomalies(data_context)
- explain_anomaly(metric, current, baseline)
- suggest_investigation(anomaly_type)
```

**Deliverable:** Proactive alerts when metrics behave abnormally

---

## PHASE 9: Comparison Intelligence (Post-MVP)
**Goal:** Cross-platform and period comparisons
**Priority:** Medium - Requires Phase 7 data connectors

### 8.1 Comparison Engine
- [ ] Period-over-period calculation
- [ ] Platform-to-platform comparison
- [ ] Product performance ranking
- [ ] Campaign ROI comparison
- [ ] Statistical significance testing

### 8.2 Comparison Tools
```typescript
- compare_platforms(metric, date_range)
  // "Shopee ROAS: 4.2, Lazada ROAS: 2.1 - 100% higher on Shopee"

- compare_periods(metric, period1, period2)
  // "Revenue up 23% vs last week"

- compare_campaigns(campaign_ids, metric)
  // "Campaign A outperforming Campaign B by 45%"

- compare_products(sku_list, metric, platform)
  // "Top performer: SKU-123 with 12% CVR"

- budget_recommendation(current_allocation, performance_data)
  // "Shift 30% budget from Lazada to Shopee based on ROAS"
```

### 8.3 Comparison UI
- [ ] Comparison view component
- [ ] Side-by-side tables
- [ ] Difference highlighting
- [ ] Trend arrows
- [ ] Recommendation cards

**Deliverable:** AI provides intelligent cross-platform/period comparisons

---

## PHASE 10: Report Generation (Post-MVP)
**Goal:** Automated report creation in Excel
**Priority:** Medium - Can work with MVP tools, but better with Phase 7 data
**Adds:** Bull + Redis for background report generation

### 9.1 Report Templates
- [ ] Weekly Performance Summary
- [ ] Campaign ROI Breakdown
- [ ] Product Performance Report
- [ ] Platform Comparison Report
- [ ] Inventory Status Report

### 9.2 Template Engine
- [ ] Template definition schema
- [ ] Section builders
- [ ] Chart generation (via Office.js)
- [ ] Conditional formatting
- [ ] Formula injection

### 9.3 Report Tools
```typescript
- generate_weekly_summary(date_range, platforms)
- generate_campaign_report(campaign_ids, date_range)
- generate_product_report(sku_list, date_range)
- generate_comparison_report(platform1, platform2, date_range)
- generate_custom_report(template_config)
```

### 9.4 Report UI
- [ ] Report wizard
- [ ] Template selection
- [ ] Date range picker
- [ ] Platform/campaign selection
- [ ] Preview before generation
- [ ] Progress indicator

**Deliverable:** One-click report generation with charts and formatting

---

## PHASE 11: Template Library (Post-MVP)
**Goal:** Pre-built sheets for common analytics tasks
**Priority:** Low - Nice-to-have, not core value

### 10.1 Template Catalog
```
📁 Templates
├── 📊 Campaign Tracking
│   ├── Shopee Ads Tracker
│   ├── Lazada Ads Tracker
│   └── Multi-Platform Campaign Dashboard
├── 📈 Performance Analysis
│   ├── Daily Sales Tracker
│   ├── Weekly Performance Review
│   └── Monthly Business Report
├── 💰 Financial
│   ├── Profit & Loss by SKU
│   ├── Platform Fee Calculator
│   └── ROAS Optimizer
├── 📦 Inventory
│   ├── Stock Level Tracker
│   ├── Reorder Point Calculator
│   └── Dead Stock Identifier
└── 🎯 Planning
    ├── Campaign Budget Planner
    ├── Promotion Calendar
    └── Sales Forecast Template
```

### 10.2 Template System
- [ ] Template definition schema
- [ ] Template storage in Supabase
- [ ] Template versioning
- [ ] User template customization
- [ ] Template sharing (future)

### 10.3 Template Tools
```typescript
- list_templates(category?)
- preview_template(template_id)
- create_from_template(template_id, target_sheet?)
- save_as_template(sheet_name, template_name, category)
```

### 10.4 Template UI
- [ ] Template browser panel
- [ ] Category filtering
- [ ] Template preview
- [ ] One-click creation
- [ ] Customization options

**Deliverable:** Library of ready-to-use ecommerce analytics templates

---

## PHASE 12: Notifications & Integrations (Post-MVP)
**Goal:** Push alerts to external channels
**Priority:** Low - Requires Phase 8 alerts to be useful

### 11.1 Notification Service
- [ ] Notification queue (Bull + Redis)
- [ ] Delivery scheduling
- [ ] Retry logic
- [ ] Delivery confirmation

### 11.2 Slack Integration
- [ ] Slack app setup
- [ ] Webhook configuration
- [ ] Message formatting
- [ ] Channel selection
- [ ] Alert routing rules

### 11.3 Microsoft Teams Integration
- [ ] Teams connector setup
- [ ] Adaptive card formatting
- [ ] Channel posting
- [ ] @mention support

### 11.4 Email Notifications
- [ ] Email template design
- [ ] SendGrid/Resend integration
- [ ] Daily digest option
- [ ] Unsubscribe handling

### 11.5 Notification Settings UI
- [ ] Channel configuration
- [ ] Alert type preferences
- [ ] Schedule settings
- [ ] Test notification

**Deliverable:** Receive alerts in Slack, Teams, or email

---

## PHASE 13: Polish & Production (Pre-AppSource)
**Goal:** Production-ready add-in
**Priority:** High - Required before AppSource submission
**Note:** Some items (basic auth, error handling) should be done incrementally during MVP

### 12.1 Authentication & Authorization
- [ ] Supabase Auth integration
- [ ] Add-in login flow
- [ ] Session management
- [ ] Role-based access (future: team features)

### 12.2 Error Handling
- [ ] Comprehensive error messages
- [ ] User-friendly error UI
- [ ] Error reporting to Sentry
- [ ] Retry mechanisms
- [ ] Offline detection

### 12.3 Performance Optimization
- [ ] Response caching
- [ ] Lazy loading
- [ ] Bundle optimization
- [ ] Office.js call batching
- [ ] Context memoization

### 12.4 Testing
- [ ] Unit tests (Vitest)
- [ ] Integration tests
- [ ] Office.js mock testing
- [ ] E2E tests (Playwright)
- [ ] Load testing

### 12.5 Documentation
- [ ] User guide
- [ ] API documentation
- [ ] Deployment guide
- [ ] Troubleshooting guide

### 12.6 Deployment
- [ ] Add-in manifest for production
- [ ] Microsoft Partner Center submission
- [ ] AppSource listing
- [ ] Sideloading instructions
- [ ] CI/CD pipeline

**Deliverable:** Production-ready add-in in Microsoft AppSource

---

## Tool Reference

### MVP Tools (Phases 1-4)

#### Excel Write Tools (Require Preview)
| Tool | Parameters | Description |
|------|------------|-------------|
| `write_range` | address, values, reason | Write 2D array to range |
| `set_formula` | address, formula, reason | Set formula in cell |
| `format_range` | address, style, reason | Apply formatting |
| `create_sheet` | name, reason | Create new worksheet |
| `add_table` | address, name, headers, reason | Create Excel table |
| `highlight_cells` | address, color, reason | Highlight range |
| `add_summary_row` | address, metrics, reason | Add SUM/AVG row |

#### Excel Read Tools (No Preview)
| Tool | Parameters | Description |
|------|------------|-------------|
| `read_range` | address | Get values from range |
| `get_selection` | (none) | Get current selection |
| `get_sheet_names` | (none) | List all worksheets |
| `get_context` | (none) | Get full Excel context |

#### Analytics Tools (Reasoning Only - No Excel Modification)
| Tool | Parameters | Description |
|------|------------|-------------|
| `explain_kpi` | kpi_name, context | Explain KPI definition and context |
| `compare_periods` | metric, period1, period2 | Compare metrics across time |
| `suggest_actions` | analysis_context | Recommend next steps |
| `interpret_trend` | data_description | Explain what trend means |

### Post-MVP Tools

#### Sheet Intelligence Tools (Phase 5)
| Tool | Parameters | Description |
|------|------------|-------------|
| `get_profile` | sheet? | Get sheet metadata and column info |
| `select_rows` | columns, filters, orderBy, limit, offset | Fetch filtered rows |
| `group_aggregate` | groupBy, metrics, filters, limit | Get aggregated data |
| `find_outliers` | column, method, threshold, limit | Detect anomalies in column |
| `search_values` | query, columns, fuzzy, limit | Search for values |

#### Data Tools (Phase 7+)
| Tool | Parameters | Description |
|------|------------|-------------|
| `sync_orders` | platform, date_range | Pull orders from platform |
| `sync_campaigns` | platform, campaign_ids | Pull campaign data |
| `import_to_sheet` | data_type, destination | Import synced data to Excel |
| `refresh_data` | data_source | Refresh existing imported data |

#### Comparison Tools (Phase 9+)
| Tool | Parameters | Description |
|------|------------|-------------|
| `compare_platforms` | metric, date_range | Compare Shopee vs Lazada |
| `detect_anomalies` | data_context | Find unusual patterns |

#### Report Tools (Phase 10+)
| Tool | Parameters | Description |
|------|------------|-------------|
| `generate_report` | template, params | Create report from template |
| `create_from_template` | template_id | Create sheet from template |
| `create_chart` | data_range, chart_type, title, reason | Create chart |

---

## Safety Rules

### Hard Limits
- Maximum 500 cells per write operation
- No sheet deletion in v1
- No workbook-level operations
- No external data connections via formulas
- No VBA/macro execution

### Preview Requirements
- All write operations require preview
- User must confirm before execution
- Show exact cells that will change
- Display before/after diff for overwrites

### Validation Rules
- All addresses must be valid A1 notation
- All values must match expected types
- All formulas must be syntactically valid
- All tool calls must pass schema validation

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **OpenAI API costs spiral** | Medium | High | Token budgets per session, caching responses |
| **Shopee/Lazada OAuth approval delays** | High | Medium | Defer to post-MVP, users paste data manually |
| **Office.js cross-platform bugs** | Medium | Medium | Test on Windows, Mac, Web early in development |
| **AppSource rejection** | Medium | Medium | Follow MS guidelines closely, budget 3-5 days for review |
| **LLM hallucinations** | Medium | High | Strong tool schemas, preview-first, Zod validation |
| **User data privacy concerns** | Low | High | Max 50 row samples, no full sheet uploads, audit logging |
| **Microsoft Copilot competition** | Low | Medium | Deep Shopee/Lazada niche focus differentiates |

### Known Gaps to Address
- [ ] Offline/degraded mode when backend is unreachable
- [ ] Undo/rollback capability for Excel operations
- [ ] Usage telemetry for understanding user behavior
- [ ] Rate limiting specification per user
- [ ] Error recovery UX flows
- [ ] Token usage visibility for users

---

## Database Schema

### Supabase Tables

```sql
-- Users and auth handled by Supabase Auth

-- ============================================
-- MVP TABLES (Phases 1-4)
-- ============================================

-- Chat history (MVP)
create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  messages jsonb not null default '[]',
  token_usage jsonb default '{}',  -- Track token consumption
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Audit log (MVP - Critical for safety)
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  session_id uuid references chat_sessions(id),
  action text not null,
  tool_name text,
  parameters jsonb,
  result text, -- 'success' | 'error' | 'cancelled' | 'preview'
  error_message text,
  cells_affected int,
  execution_time_ms int,
  created_at timestamptz default now()
);

-- ============================================
-- POST-MVP TABLES
-- ============================================

-- Platform connections (Phase 6)
create table platform_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  platform text not null, -- 'shopee' | 'lazada'
  shop_id text not null,
  shop_name text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Knowledge chunks for RAG (Phase 5)
create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(1536),
  source text not null,
  category text not null,
  tags text[],
  metadata jsonb,
  created_at timestamptz default now()
);

-- Alerts (Phase 7)
create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  platform text,
  alert_type text not null,
  severity text not null, -- 'info' | 'warning' | 'critical'
  title text not null,
  message text not null,
  metadata jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz default now()
);

-- Templates (Phase 10)
create table templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  schema jsonb not null,
  is_system boolean default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
```

---

## Repository Structure

```
cellix/
├── README.md
├── FEATURE_PLAN.md
├── package.json                    # Workspace root
├── pnpm-workspace.yaml
├── turbo.json                      # Turborepo config
│
├── apps/
│   ├── addin/                      # Excel Add-in
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── chat/
│   │   │   │   │   ├── ChatPane.tsx
│   │   │   │   │   ├── MessageList.tsx
│   │   │   │   │   ├── MessageBubble.tsx
│   │   │   │   │   ├── InputBox.tsx
│   │   │   │   │   └── TypingIndicator.tsx
│   │   │   │   ├── preview/
│   │   │   │   │   ├── ActionPreview.tsx
│   │   │   │   │   ├── ActionCard.tsx
│   │   │   │   │   └── DiffView.tsx
│   │   │   │   ├── controls/
│   │   │   │   │   ├── ControlPanel.tsx
│   │   │   │   │   ├── ContextDisplay.tsx
│   │   │   │   │   └── RangeSelector.tsx
│   │   │   │   ├── alerts/
│   │   │   │   │   ├── AlertPanel.tsx
│   │   │   │   │   └── AlertCard.tsx
│   │   │   │   ├── templates/
│   │   │   │   │   ├── TemplateBrowser.tsx
│   │   │   │   │   └── TemplateCard.tsx
│   │   │   │   ├── reports/
│   │   │   │   │   ├── ReportWizard.tsx
│   │   │   │   │   └── ReportPreview.tsx
│   │   │   │   └── common/
│   │   │   │       ├── Loading.tsx
│   │   │   │       ├── ErrorBoundary.tsx
│   │   │   │       └── Button.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useExcelContext.ts
│   │   │   │   ├── useChat.ts
│   │   │   │   ├── useAlerts.ts
│   │   │   │   └── useAuth.ts
│   │   │   ├── lib/
│   │   │   │   ├── excel/
│   │   │   │   │   ├── reader.ts
│   │   │   │   │   ├── writer.ts
│   │   │   │   │   ├── formatter.ts
│   │   │   │   │   └── context.ts
│   │   │   │   ├── api/
│   │   │   │   │   ├── client.ts
│   │   │   │   │   └── endpoints.ts
│   │   │   │   └── tools/
│   │   │   │       ├── executor.ts
│   │   │   │       ├── validator.ts
│   │   │   │       └── preview.ts
│   │   │   ├── store/
│   │   │   │   ├── chatStore.ts
│   │   │   │   ├── excelStore.ts
│   │   │   │   └── alertStore.ts
│   │   │   └── types/
│   │   │       ├── tools.ts
│   │   │       ├── excel.ts
│   │   │       └── api.ts
│   │   ├── public/
│   │   │   └── assets/
│   │   ├── manifest.xml
│   │   ├── manifest.prod.xml
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── backend/                    # API Server
│       ├── src/
│       │   ├── index.ts
│       │   ├── server.ts
│       │   ├── routes/
│       │   │   ├── chat.ts
│       │   │   ├── auth.ts
│       │   │   ├── platforms.ts
│       │   │   ├── alerts.ts
│       │   │   ├── templates.ts
│       │   │   └── reports.ts
│       │   ├── services/
│       │   │   ├── ai/
│       │   │   │   ├── client.ts
│       │   │   │   ├── promptBuilder.ts
│       │   │   │   └── streaming.ts
│       │   │   ├── rag/
│       │   │   │   ├── embedder.ts
│       │   │   │   ├── retriever.ts
│       │   │   │   └── ingest.ts
│       │   │   ├── tools/
│       │   │   │   ├── schema.ts
│       │   │   │   ├── validator.ts
│       │   │   │   └── whitelist.ts
│       │   │   ├── platforms/
│       │   │   │   ├── shopee/
│       │   │   │   │   ├── client.ts
│       │   │   │   │   ├── auth.ts
│       │   │   │   │   └── types.ts
│       │   │   │   └── lazada/
│       │   │   │       ├── client.ts
│       │   │   │       ├── auth.ts
│       │   │   │       └── types.ts
│       │   │   ├── anomaly/
│       │   │   │   ├── detector.ts
│       │   │   │   └── monitors.ts
│       │   │   ├── comparison/
│       │   │   │   └── engine.ts
│       │   │   ├── reports/
│       │   │   │   ├── generator.ts
│       │   │   │   └── templates.ts
│       │   │   └── notifications/
│       │   │       ├── slack.ts
│       │   │       ├── teams.ts
│       │   │       └── email.ts
│       │   ├── lib/
│       │   │   ├── supabase.ts
│       │   │   ├── redis.ts
│       │   │   └── queue.ts
│       │   └── types/
│       │       └── index.ts
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   └── shared/                     # Shared types and utilities
│       ├── src/
│       │   ├── types/
│       │   │   ├── tools.ts
│       │   │   ├── platforms.ts
│       │   │   └── api.ts
│       │   └── utils/
│       │       └── validation.ts
│       ├── tsconfig.json
│       └── package.json
│
├── rag-data/                       # RAG seed documents
│   ├── kpis/
│   │   ├── ecommerce_kpis.md
│   │   ├── shopee_metrics.md
│   │   └── lazada_metrics.md
│   ├── glossary/
│   │   └── ecommerce_glossary.md
│   ├── formulas/
│   │   └── formula_library.md
│   └── conventions/
│       └── report_conventions.md
│
├── scripts/
│   ├── ingest-rag.ts              # Ingest RAG documents
│   ├── setup-supabase.sql         # Database setup
│   └── generate-certs.sh          # Dev SSL certs
│
└── docs/
    ├── setup.md
    ├── development.md
    ├── deployment.md
    └── api.md
```

---

## Development Milestones

| Milestone | Phases | Timeline | Goal |
|-----------|--------|----------|------|
| **M1: MVP** | Phase 1-4 | Weeks 1-6 | Core chat with Excel read/write, preview-first safety |
| **M2: Sheet Intelligence** | Phase 5 | Post-MVP | Profile system, smart retrieval, large file support |
| **M3: Smart Assistant** | Phase 6-7 | Post-MVP | RAG knowledge + Data connectors |
| **M4: Proactive Intelligence** | Phase 8-9 | Post-MVP | Anomaly detection + Comparisons |
| **M5: Automation** | Phase 10-11 | Post-MVP | Reports + Templates |
| **M6: Enterprise Ready** | Phase 12-13 | Post-MVP | Notifications + Production polish |

> **Focus:** Complete M1 (MVP) before starting M2. Validate with real users first.

---

## Success Metrics

### MVP Success Criteria
- Add-in loads reliably in Excel (Windows, Mac, Web)
- Users can chat and get helpful ecommerce guidance
- Tool execution works with preview-first flow
- Safety controls prevent unintended data changes
- At least 5 beta users provide feedback

### User Engagement (MVP)
- Daily active users in add-in
- Messages sent per session
- Tool executions per session (target: >2 per session)
- User satisfaction (qualitative feedback)

### Value Delivery (Post-MVP)
- Time saved per report (vs manual)
- Anomalies detected and acted upon
- Cross-platform insights delivered
- Template usage rate

### Technical Health (MVP Targets)
- Tool execution success rate (>95%)
- Response latency (<3s for first token)
- Preview generation time (<500ms)
- Error rate (<1%)

### Post-MVP Metrics
- RAG retrieval relevance (>80%)
- Data sync reliability (>99%)
- Alert accuracy (>90% true positives)

---

## Future Roadmap (Post-M5)

- **Google Sheets version**
- **Standalone web dashboard**
- **TikTok Shop integration**
- **Team collaboration features**
- **Custom RAG document upload**
- **Scheduled reports**
- **Mobile alerts app**
- **White-label for agencies**
