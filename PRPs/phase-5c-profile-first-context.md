# PRP: Phase 5C - Profile-First Context Flow

## Overview

Change context extraction to send sheet profile first (~500 tokens) instead of raw data (~2000+ tokens). The LLM inspects the profile, then requests specific data slices via smart retrieval tools from Phase 5B.

## Context

- **Phase:** 5C (Post-MVP, Sheet Intelligence)
- **Priority:** High - Reduces token usage by 50-70%
- **Prerequisites:** Phase 5A (profile system), Phase 5B (smart retrieval tools)
- **Duration:** ~3-4 days

### Dependencies
- Profile extractor: `apps/addin/src/lib/excel/profiler.ts`
- Profile cache: `apps/addin/src/lib/excel/profileCache.ts`
- Smart retrieval tools: `apps/addin/src/lib/tools/readers.ts`
- Profile types: `packages/shared/src/types/profile.ts`

### Related Files
- `apps/addin/src/lib/excel/context.ts` - Current context extraction
- `apps/backend/src/services/ai/context.ts` - Current context formatter
- `apps/backend/src/routes/chat.ts` - Chat endpoint

## Research Findings

### Current Context Flow
```typescript
// apps/addin/src/lib/excel/context.ts
export async function extractContext(): Promise<ExcelContextFull> {
  const [values, address, activeSheet, allSheets, tables] = await Promise.all([...]);
  const { sampledValues, sampled } = sampleValues(values);  // Up to 50 rows
  // Returns full data dump
}
```

### Current Context Formatter
```typescript
// apps/backend/src/services/ai/context.ts
export function formatExcelContext(context: ExcelContextFull): string {
  // Includes:
  // - Headers, Column Types, Numeric Summary
  // - Sample Data (first 10 rows as tab-separated text)
  // - Tables, All Sheets
}
```

### Profile System (from 5A)
- `extractSheetProfile()` - Full column metadata with stats
- `extractWorkbookInventory()` - Lightweight all-sheets summary
- Cache with localStorage persistence

### Smart Retrieval Tools (from 5B)
- `get_profile` - Get sheet metadata
- `select_rows` - Filtered data fetch
- `group_aggregate` - Aggregations
- `find_outliers` - Anomaly detection

---

## Implementation Plan

### Files to Create

| File | Description |
|------|-------------|
| (none) | All changes are modifications to existing files |

### Files to Modify

| File | Changes |
|------|---------|
| `packages/shared/src/types/excel.ts` | Add `ExcelContextWithProfile` type |
| `apps/addin/src/lib/excel/context.ts` | Add `extractContextWithProfile()` |
| `apps/backend/src/services/ai/context.ts` | Add `formatProfileContext()` |
| `apps/backend/src/routes/chat.ts` | Use profile-first context |

---

### Step 1: Add New Type (`packages/shared/src/types/excel.ts`)

```typescript
import type { SheetProfile, WorkbookInventory } from './profile.js';

/** Profile-first context for AI (Phase 5C) */
export interface ExcelContextWithProfile {
  /** Active sheet profile */
  profile: SheetProfile;
  /** All sheets summary */
  inventory: WorkbookInventory;
  /** Current selection info (no data by default) */
  selection: {
    address: string;
    size: { rows: number; cols: number };
    /** Only included if explicitly requested */
    data?: unknown[][];
  };
  /** Timestamp */
  extractedAt: number;
}
```

---

### Step 2: Add Profile Context Extractor (`apps/addin/src/lib/excel/context.ts`)

```typescript
import { extractSheetProfile, extractWorkbookInventory } from './profiler';
import { getCachedProfile, setCachedProfile, getCachedInventory, setCachedInventory } from './profileCache';
import type { ExcelContextWithProfile } from '@cellix/shared';

export interface ProfileContextOptions {
  /** Include selection data (default: false) */
  includeData?: boolean;
  /** Max rows if includeData is true */
  dataLimit?: number;
}

/**
 * Extract profile-first context for AI.
 * Returns profile + selection address, no data by default.
 */
export async function extractContextWithProfile(
  options: ProfileContextOptions = {}
): Promise<ExcelContextWithProfile> {
  const { includeData = false, dataLimit = 50 } = options;

  // Get inventory (cached or fresh)
  let inventory = getCachedInventory();
  if (!inventory) {
    inventory = await extractWorkbookInventory();
    setCachedInventory(inventory);
  }

  // Get active sheet profile (cached or fresh)
  const activeSheetName = inventory.activeSheet;
  let profile = getCachedProfile(activeSheetName);
  if (!profile) {
    profile = await extractSheetProfile(activeSheetName);
    setCachedProfile(profile);
  }

  // Get selection info
  const selectionInfo = await Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load(['address', 'rowCount', 'columnCount']);
    if (includeData) {
      range.load('values');
    }
    await context.sync();

    return {
      address: range.address,
      size: { rows: range.rowCount, cols: range.columnCount },
      data: includeData ? range.values.slice(0, dataLimit) : undefined,
    };
  });

  return {
    profile,
    inventory,
    selection: selectionInfo,
    extractedAt: Date.now(),
  };
}
```

---

### Step 3: Add Profile Context Formatter (`apps/backend/src/services/ai/context.ts`)

```typescript
import type { ExcelContextWithProfile, SheetProfile, ColumnProfile } from '@cellix/shared';

/**
 * Format profile-first context for AI prompt.
 * Compact representation (~500 tokens for typical sheet).
 */
export function formatProfileContext(context: ExcelContextWithProfile | null | undefined): string {
  if (!context) return '';

  const lines: string[] = [];
  const { profile, inventory, selection } = context;

  lines.push('\n## Excel Context\n');

  // Sheet summary
  lines.push(`**Sheet:** "${profile.sheetName}"`);
  lines.push(`**Size:** ${profile.rowCount.toLocaleString()} rows x ${profile.columnCount} columns`);
  lines.push(`**Selection:** ${selection.address} (${selection.size.rows}x${selection.size.cols})`);

  // Tables
  if (profile.tables.length > 0) {
    lines.push(`**Tables:** ${profile.tables.map(t => t.name).join(', ')}`);
  }

  // Column summary table
  if (profile.columns.length > 0) {
    lines.push('\n### Columns\n');
    lines.push('| Col | Header | Type | Semantic | Info |');
    lines.push('|-----|--------|------|----------|------|');

    for (const col of profile.columns.slice(0, 20)) {
      const info = formatColumnInfo(col);
      lines.push(`| ${col.letter} | ${col.header || '-'} | ${col.dataType} | ${col.inferredName} | ${info} |`);
    }

    if (profile.columns.length > 20) {
      lines.push(`| ... | *${profile.columns.length - 20} more columns* | | | |`);
    }
  }

  // Quality warnings
  const warnings = getQualityWarnings(profile);
  if (warnings.length > 0) {
    lines.push('\n### Data Quality Notes');
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  // Other sheets
  const otherSheets = inventory.sheets.filter(s => !s.isActive);
  if (otherSheets.length > 0) {
    lines.push(`\n**Other Sheets:** ${otherSheets.map(s => `${s.name} (${s.rowCount} rows)`).join(', ')}`);
  }

  // Usage hint
  lines.push('\n*Use `get_profile`, `select_rows`, or `group_aggregate` to query specific data.*');

  return lines.join('\n');
}

function formatColumnInfo(col: ColumnProfile): string {
  const parts: string[] = [];

  if (col.stats) {
    parts.push(`Sum: ${formatNum(col.stats.sum)}, Avg: ${formatNum(col.stats.avg)}`);
  } else if (col.uniqueCount > 0) {
    parts.push(`${col.uniqueCount} unique`);
  }

  if (col.samples.length > 0 && col.dataType === 'text') {
    const sampleText = col.samples.slice(0, 2).map(s => String(s).slice(0, 15)).join(', ');
    parts.push(`e.g. ${sampleText}`);
  }

  return parts.join('; ') || '-';
}

function getQualityWarnings(profile: SheetProfile): string[] {
  const warnings: string[] = [];

  for (const col of profile.columns) {
    if (col.quality.completeness < 0.9 && col.quality.completeness > 0) {
      const pct = Math.round((1 - col.quality.completeness) * 100);
      warnings.push(`Column ${col.letter} (${col.header}) has ${pct}% missing values`);
    }
    if (col.quality.hasMixedTypes) {
      warnings.push(`Column ${col.letter} (${col.header}) has mixed data types`);
    }
    if (col.quality.hasOutliers) {
      warnings.push(`Column ${col.letter} (${col.header}) contains outliers`);
    }
  }

  return warnings.slice(0, 5); // Limit to 5 warnings
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}
```

---

### Step 4: Update Chat Route (`apps/backend/src/routes/chat.ts`)

Minimal change - accept either context type:

```typescript
import { formatExcelContext, formatProfileContext } from '../services/ai/index.js';
import type { ExcelContextFull, ExcelContextWithProfile } from '@cellix/shared';

// In the request schema, already accepts z.any() for excelContext

// In the handler, detect which type and format accordingly:
const excelContext = parseResult.data.excelContext;

let contextText: string;
if (excelContext?.profile) {
  // New profile-first context
  contextText = formatProfileContext(excelContext as ExcelContextWithProfile);
} else if (excelContext?.selection) {
  // Legacy full context (backwards compatible)
  contextText = formatExcelContext(excelContext as ExcelContextFull);
} else {
  contextText = '';
}

const systemContent = SYSTEM_PROMPT + contextText;
```

---

### Step 5: Update Add-in to Use New Extractor

In `apps/addin/src/components/chat/ChatPane.tsx` or wherever `extractContext` is called:

```typescript
import { extractContextWithProfile } from '../../lib/excel/context';

// Replace:
// const context = await extractContext();

// With:
const context = await extractContextWithProfile();
```

---

### Step 6: Export New Functions

**`apps/addin/src/lib/excel/index.ts`:**
```typescript
export { extractContext, extractContextWithProfile } from './context';
```

**`apps/backend/src/services/ai/index.ts`:**
```typescript
export { formatExcelContext, formatProfileContext } from './context.js';
```

---

## Validation Gates

### Build
- [ ] `pnpm build` passes in root
- [ ] `pnpm build` passes in `packages/shared`
- [ ] `pnpm build` passes in `apps/backend`
- [ ] `pnpm build` passes in `apps/addin`

### Lint & Types
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes

### Manual Testing
- [ ] `extractContextWithProfile()` returns profile without data
- [ ] `formatProfileContext()` produces ~500 token output
- [ ] Chat works with profile-first context
- [ ] AI successfully calls `select_rows` to fetch needed data
- [ ] Legacy `extractContext()` still works (backwards compatible)
- [ ] Quality warnings appear for columns with issues

---

## Safety Considerations

1. **Backwards Compatible** - Keep `extractContext()` and `formatExcelContext()` working
2. **No Breaking Changes** - Chat route accepts both old and new context types
3. **Profile Cached** - Uses cache from 5A, no performance impact
4. **Token Reduction** - Profile format designed for ~500 tokens max

---

## Confidence Score

**9/10** - High confidence

**Reasoning:**
- All building blocks exist (profile extractor, cache, smart retrieval tools)
- Pattern is clear: extract profile, format for prompt, AI uses tools for data
- Minimal code changes, mostly additions
- Existing patterns to follow for context extraction and formatting

**Risks:**
- AI might not always use tools (mitigate with prompt guidance)
- Edge case: very wide sheets (20+ columns) might exceed token target

---

## Notes

### Example Output (what AI sees)

```
## Excel Context

**Sheet:** "Sales Data"
**Size:** 15,234 rows x 12 columns
**Selection:** A1:L50 (50x12)
**Tables:** SalesTable

### Columns

| Col | Header | Type | Semantic | Info |
|-----|--------|------|----------|------|
| A | Date | date | date | - |
| B | SKU | text | product_id | 1,523 unique |
| C | Category | text | category | 5 unique; e.g. Electronics, Fashion |
| D | Revenue | number | revenue | Sum: 1.2M, Avg: 78.50 |
| E | Ad Spend | number | cost | Sum: 245K, Avg: 16.10 |
| F | Orders | number | quantity | Sum: 15.2K, Avg: 1.00 |

### Data Quality Notes
- Column G (Margin) has 12% missing values

**Other Sheets:** Products (500 rows), Campaigns (120 rows)

*Use `get_profile`, `select_rows`, or `group_aggregate` to query specific data.*
```

### Token Comparison
| Context Type | Typical Tokens |
|--------------|----------------|
| Old (full data) | 2000-3000 |
| New (profile only) | 400-600 |
| **Savings** | **50-80%** |
