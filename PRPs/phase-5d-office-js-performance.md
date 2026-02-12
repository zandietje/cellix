# PRP: Phase 5D - Office.js Performance Optimization

## Overview

Implement chunked reading, streaming statistics, and background profiling to handle large Excel sheets (100K+ rows) without hitting memory or API limits. This phase completes the Sheet Intelligence System by making it enterprise-ready.

## Context

- **Phase:** 5D (Post-MVP, Sheet Intelligence System)
- **Dependencies:** Phase 5A-5C (Profile system, smart retrieval, profile-first context)
- **Estimated Effort:** 1 week

### Related Files

| File | Purpose |
|------|---------|
| `apps/addin/src/lib/excel/profiler.ts` | Existing profiler with basic chunking |
| `apps/addin/src/lib/excel/profileCache.ts` | In-memory + localStorage cache |
| `apps/addin/src/lib/data/arquero.ts` | Arquero wrapper utilities |
| `apps/addin/src/hooks/useExcelContext.ts` | Context extraction hook |
| `apps/addin/src/components/controls/ControlPanel.tsx` | UI for context refresh |
| `packages/shared/src/types/profile.ts` | Profile type definitions |

## Documentation References

- [Excel JavaScript API Performance Optimization](https://learn.microsoft.com/en-us/office/dev/add-ins/excel/performance) - Official best practices
- [Read/Write Large Ranges](https://learn.microsoft.com/en-us/office/dev/add-ins/excel/excel-add-ins-ranges-large) - Chunking strategies
- [Resource Limits](https://github.com/OfficeDev/office-js-docs-pr/blob/main/docs/concepts/resource-limits-and-performance-optimization.md) - Payload and CPU limits
- [Welford's Algorithm](https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm) - Single-pass variance

## Research Findings

### Existing Patterns

The codebase already has basic chunking in `profiler.ts`:

```typescript
// profiler.ts:179-209
async function readChunked(
  sheet: Excel.Worksheet,
  totalRows: number,
  totalCols: number,
  chunkSize: number,
  onProgress?: (progress: number) => void,
  abortSignal?: AbortSignal
): Promise<unknown[][]> {
  const allValues: unknown[][] = [];
  const chunks = Math.ceil(totalRows / chunkSize);

  for (let i = 0; i < chunks; i++) {
    if (abortSignal?.aborted) {
      throw new Error('Profile extraction cancelled');
    }
    const startRow = i * chunkSize;
    const rowsToRead = Math.min(chunkSize, totalRows - startRow);
    const chunk = sheet.getRangeByIndexes(startRow, 0, rowsToRead, totalCols);
    chunk.load('values');
    await sheet.context.sync();
    allValues.push(...chunk.values);
    onProgress?.((i + 1) / chunks);
  }
  return allValues;
}
```

**Current limitations:**
1. Stores all chunks in memory (`allValues.push(...chunk.values)`)
2. No column filtering (reads all columns even if only some needed)
3. No generator/streaming pattern
4. Stats calculated after full load (see `arquero.ts` `calculateColumnStats`)

### Microsoft Best Practices

From official docs:
- **Chunk size**: Start with 5,000-20,000 rows per block
- **Minimize `sync()` calls**: Each sync has overhead
- **Use `untrack()`**: Release proxy objects after use
- **Suspend calculations**: `suspendApiCalculationUntilNextSync()` during writes
- **Load only needed properties**: `range.load('values')` not `range.load()`

### Gotchas & Edge Cases

| Issue | Mitigation |
|-------|------------|
| `RequestPayloadSizeLimitExceeded` error | Reduce chunk size, retry with smaller blocks |
| Mac Excel memory limits stricter than Windows | Test on Mac, use smaller default chunks |
| Web Excel (browser) may have different limits | Progressive fallback |
| CPU threshold (90% for 15s) triggers warning | Yield between chunks with `setTimeout` |
| `range.track()` required for cross-sync operations | Track ranges for long operations |

## Implementation Plan

### Files to Create

#### 1. `apps/addin/src/lib/excel/chunkedReader.ts`

Purpose: Memory-efficient reading of large ranges with progress and cancellation.

```typescript
/**
 * Chunked Range Reader for large Excel ranges.
 * Reads in blocks to avoid memory/payload limits.
 */

export interface ChunkedReaderOptions {
  /** Rows per chunk (default: 5000) */
  chunkSize?: number;
  /** Specific columns to load (e.g., ['A', 'B', 'C']) */
  columns?: string[];
  /** Progress callback (0-1) */
  onProgress?: (progress: number) => void;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Yield to event loop between chunks (default: true) */
  yieldBetweenChunks?: boolean;
}

export interface ChunkedReadResult {
  /** 2D array of values */
  values: unknown[][];
  /** Total rows read */
  totalRows: number;
  /** Total columns read */
  totalCols: number;
  /** Whether reading was aborted */
  aborted: boolean;
}

/**
 * Read a large range in chunks.
 * Supports column filtering, progress reporting, and cancellation.
 */
export async function readLargeRange(
  address: string,
  options?: ChunkedReaderOptions
): Promise<ChunkedReadResult>;

/**
 * Generator version for streaming - processes rows without storing all in memory.
 * Useful for computing stats without full data load.
 */
export async function* streamLargeRange(
  address: string,
  options?: ChunkedReaderOptions
): AsyncGenerator<unknown[][], void, undefined>;

/**
 * Parse column letters to indices for selective loading.
 */
export function parseColumnSpec(columns: string[]): number[];
```

#### 2. `apps/addin/src/lib/excel/streamingStats.ts`

Purpose: Compute statistics incrementally without loading all data.

```typescript
/**
 * Streaming Statistics Calculator.
 * Uses Welford's algorithm for single-pass mean/variance.
 */

export interface StreamingStatsResult {
  count: number;
  sum: number;
  min: number;
  max: number;
  mean: number;
  variance: number;
  stdev: number;
}

/**
 * Single-pass statistics calculator using Welford's algorithm.
 * Memory usage: O(1) regardless of data size.
 */
export class StreamingStats {
  private n = 0;
  private mean = 0;
  private m2 = 0;
  private sum = 0;
  private min = Infinity;
  private max = -Infinity;

  /** Add a value to the running statistics */
  add(value: number): void {
    if (!Number.isFinite(value)) return;

    this.n++;
    this.sum += value;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);

    // Welford's online algorithm
    const delta = value - this.mean;
    this.mean += delta / this.n;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2;
  }

  /** Get current statistics */
  getStats(): StreamingStatsResult {
    return {
      count: this.n,
      sum: this.sum,
      min: this.n > 0 ? this.min : 0,
      max: this.n > 0 ? this.max : 0,
      mean: this.mean,
      variance: this.n > 1 ? this.m2 / (this.n - 1) : 0,
      stdev: this.n > 1 ? Math.sqrt(this.m2 / (this.n - 1)) : 0,
    };
  }

  /** Reset to initial state */
  reset(): void;
}

/**
 * Streaming percentile calculator using reservoir sampling.
 * Maintains approximate percentiles with configurable accuracy.
 */
export class StreamingPercentiles {
  private reservoir: number[] = [];
  private readonly reservoirSize: number;
  private n = 0;

  constructor(reservoirSize = 1000) {
    this.reservoirSize = reservoirSize;
  }

  /** Add a value using reservoir sampling */
  add(value: number): void;

  /** Get approximate percentile (0-100) */
  getPercentile(p: number): number;

  /** Get IQR (Q3 - Q1) for outlier detection */
  getIQR(): { q1: number; q3: number; iqr: number };

  /** Check if value is outlier using IQR method */
  isOutlier(value: number, multiplier?: number): boolean;
}

/**
 * Streaming unique count estimator using HyperLogLog.
 * O(1) memory for cardinality estimation.
 */
export class StreamingUnique {
  /** Add a value (will be hashed) */
  add(value: unknown): void;

  /** Get estimated unique count */
  getCount(): number;
}
```

### Files to Modify

#### 1. `apps/addin/src/lib/excel/profiler.ts`

Changes:
- Import and use `streamLargeRange` instead of `readChunked`
- Use `StreamingStats` for column statistics instead of Arquero on full data
- Add progressive profiling levels

```typescript
// Add new imports
import { streamLargeRange } from './chunkedReader';
import { StreamingStats, StreamingPercentiles } from './streamingStats';

// Replace readChunked usage with streaming
export async function extractSheetProfile(
  sheetName?: string,
  options: ProfileExtractionOptions = {}
): Promise<SheetProfile> {
  // For large sheets, use streaming stats instead of loading all data
  if (totalRows > MAX_PROFILE_ROWS) {
    return extractProfileWithStreaming(sheet, totalRows, totalCols, options);
  }
  // ... existing logic for smaller sheets
}

async function extractProfileWithStreaming(
  sheet: Excel.Worksheet,
  totalRows: number,
  totalCols: number,
  options: ProfileExtractionOptions
): Promise<SheetProfile> {
  // Read headers only first
  const headerRange = sheet.getRangeByIndexes(0, 0, 1, totalCols);
  headerRange.load('values');
  await sheet.context.sync();

  const headers = headerRange.values[0].map(h => String(h ?? ''));

  // Create streaming stats for each numeric column
  const columnStats = new Map<number, StreamingStats>();
  const columnPercentiles = new Map<number, StreamingPercentiles>();

  // Stream through data, computing stats incrementally
  for await (const chunk of streamLargeRange(usedRange, options)) {
    for (const row of chunk) {
      row.forEach((value, colIndex) => {
        if (typeof value === 'number') {
          if (!columnStats.has(colIndex)) {
            columnStats.set(colIndex, new StreamingStats());
            columnPercentiles.set(colIndex, new StreamingPercentiles());
          }
          columnStats.get(colIndex)!.add(value);
          columnPercentiles.get(colIndex)!.add(value);
        }
      });
    }
  }

  // Build column profiles from streaming stats
  // ...
}
```

#### 2. `apps/addin/src/lib/excel/profileCache.ts`

Changes:
- Add progressive profiling level support
- Track profiling level per sheet

```typescript
// Add profiling levels
export type ProfilingLevel =
  | 'inventory'    // Level 0: Sheet names + used ranges (instant)
  | 'headers'      // Level 1: + Headers + row counts (on focus)
  | 'types'        // Level 2: + Column types + basic stats (on first question)
  | 'full';        // Level 3: + Relationships + quality signals (on complex questions)

export interface ProfileCacheEntry {
  profile: SheetProfile;
  sheetName: string;
  version: number;
  cachedAt: number;
  level: ProfilingLevel;  // NEW
}

/** Get profile at minimum required level, or null if not available */
export function getCachedProfileAtLevel(
  sheetName: string,
  minLevel: ProfilingLevel
): SheetProfile | null;

/** Check if profile needs upgrade to higher level */
export function needsLevelUpgrade(
  sheetName: string,
  requiredLevel: ProfilingLevel
): boolean;
```

#### 3. `apps/addin/src/components/controls/ControlPanel.tsx`

Changes:
- Add progress bar for profiling operations
- Show profiling status indicator

```typescript
import { ProgressBar } from '@fluentui/react-components';

export function ControlPanel() {
  const { profilingProgress, isProfileLoading } = useExcelStore();

  return (
    <div className={styles.container}>
      {/* ... existing header ... */}

      {isProfileLoading && (
        <div className={styles.progressContainer}>
          <Text size={200}>Analyzing sheet...</Text>
          <ProgressBar
            value={profilingProgress}
            max={1}
            thickness="medium"
          />
          <Text size={100}>{Math.round(profilingProgress * 100)}%</Text>
        </div>
      )}

      {/* ... existing content ... */}
    </div>
  );
}
```

#### 4. `apps/addin/src/store/excelStore.ts`

Changes:
- Add profiling progress state
- Add profiling level tracking

```typescript
interface ExcelStore {
  // ... existing state ...

  // NEW: Profiling progress
  profilingProgress: number;
  isProfileLoading: boolean;
  currentProfilingLevel: ProfilingLevel | null;

  // NEW: Actions
  setProfilingProgress: (progress: number) => void;
  setProfileLoading: (loading: boolean) => void;
}
```

### Implementation Steps

#### Step 1: Create Chunked Reader (Day 1)

1. Create `chunkedReader.ts` with `readLargeRange` function
2. Implement column filtering (only load requested columns)
3. Add abort support with `AbortSignal`
4. Add yield between chunks to prevent UI freeze
5. Create `streamLargeRange` generator version

#### Step 2: Create Streaming Stats (Day 2)

1. Create `streamingStats.ts` with `StreamingStats` class
2. Implement Welford's algorithm for mean/variance
3. Add `StreamingPercentiles` with reservoir sampling
4. Add `StreamingUnique` for cardinality estimation (optional, can use Set for small data)
5. Write unit tests for accuracy vs full-data calculation

#### Step 3: Integrate with Profiler (Day 3)

1. Update `profiler.ts` to use streaming for large sheets
2. Add threshold constant (e.g., 10,000 rows triggers streaming mode)
3. Compute column profiles from streaming stats
4. Preserve existing behavior for small sheets

#### Step 4: Progressive Profiling (Day 4)

1. Add profiling levels to `profileCache.ts`
2. Implement level-aware cache retrieval
3. Add background profiling on sheet activation
4. Debounce re-profiling on sheet changes

#### Step 5: UI Integration (Day 5)

1. Add progress state to `excelStore.ts`
2. Add `ProgressBar` to `ControlPanel.tsx`
3. Wire up progress callbacks from profiler
4. Add "Analyzing sheet..." status message

#### Step 6: Testing & Optimization (Day 6-7)

1. Test with 100K+ row sheets
2. Verify memory usage stays bounded
3. Test abort/cancel behavior
4. Test cross-platform (Windows, Mac, Web)
5. Adjust chunk sizes based on performance

### Code Snippets

#### Welford's Algorithm Implementation

```typescript
// apps/addin/src/lib/excel/streamingStats.ts

export class StreamingStats {
  private n = 0;
  private mean = 0;
  private m2 = 0;  // Sum of squared differences from mean
  private sum = 0;
  private min = Infinity;
  private max = -Infinity;

  add(value: number): void {
    if (!Number.isFinite(value)) return;

    this.n++;
    this.sum += value;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);

    // Welford's online algorithm for numerical stability
    const delta = value - this.mean;
    this.mean += delta / this.n;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2;
  }

  getStats(): StreamingStatsResult {
    if (this.n === 0) {
      return { count: 0, sum: 0, min: 0, max: 0, mean: 0, variance: 0, stdev: 0 };
    }

    const variance = this.n > 1 ? this.m2 / (this.n - 1) : 0;

    return {
      count: this.n,
      sum: this.sum,
      min: this.min,
      max: this.max,
      mean: this.mean,
      variance,
      stdev: Math.sqrt(variance),
    };
  }

  reset(): void {
    this.n = 0;
    this.mean = 0;
    this.m2 = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = -Infinity;
  }
}
```

#### Reservoir Sampling for Percentiles

```typescript
// apps/addin/src/lib/excel/streamingStats.ts

export class StreamingPercentiles {
  private reservoir: number[] = [];
  private readonly size: number;
  private n = 0;

  constructor(reservoirSize = 1000) {
    this.size = reservoirSize;
  }

  add(value: number): void {
    if (!Number.isFinite(value)) return;

    this.n++;

    if (this.reservoir.length < this.size) {
      this.reservoir.push(value);
    } else {
      // Reservoir sampling: replace with probability size/n
      const j = Math.floor(Math.random() * this.n);
      if (j < this.size) {
        this.reservoir[j] = value;
      }
    }
  }

  getPercentile(p: number): number {
    if (this.reservoir.length === 0) return 0;

    const sorted = [...this.reservoir].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  getIQR(): { q1: number; q3: number; iqr: number } {
    const q1 = this.getPercentile(25);
    const q3 = this.getPercentile(75);
    return { q1, q3, iqr: q3 - q1 };
  }

  isOutlier(value: number, multiplier = 1.5): boolean {
    const { q1, q3, iqr } = this.getIQR();
    return value < q1 - multiplier * iqr || value > q3 + multiplier * iqr;
  }
}
```

#### Chunked Reader with Generator

```typescript
// apps/addin/src/lib/excel/chunkedReader.ts

export async function* streamLargeRange(
  sheetName: string,
  address: string,
  options: ChunkedReaderOptions = {}
): AsyncGenerator<unknown[][], void, undefined> {
  const {
    chunkSize = 5000,
    columns,
    onProgress,
    abortSignal,
    yieldBetweenChunks = true
  } = options;

  await Excel.run(async (context) => {
    const sheet = sheetName
      ? context.workbook.worksheets.getItem(sheetName)
      : context.workbook.worksheets.getActiveWorksheet();

    const range = sheet.getRange(address);
    range.load(['rowCount', 'columnCount']);
    await context.sync();

    const totalRows = range.rowCount;
    const totalCols = range.columnCount;
    const chunks = Math.ceil(totalRows / chunkSize);

    for (let i = 0; i < chunks; i++) {
      if (abortSignal?.aborted) {
        return;
      }

      const startRow = i * chunkSize;
      const rowsToRead = Math.min(chunkSize, totalRows - startRow);

      const chunk = sheet.getRangeByIndexes(startRow, 0, rowsToRead, totalCols);
      chunk.load('values');

      // Untrack previous chunks to free memory
      if (i > 0) {
        context.trackedObjects.remove(chunk);
      }

      await context.sync();

      // Filter columns if specified
      let values = chunk.values;
      if (columns) {
        const indices = parseColumnSpec(columns);
        values = values.map(row => indices.map(idx => row[idx]));
      }

      yield values;

      onProgress?.((i + 1) / chunks);

      // Yield to event loop to prevent UI freeze
      if (yieldBetweenChunks) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  });
}
```

## Validation Gates

### Build
- [ ] `pnpm build` passes with no errors
- [ ] `pnpm typecheck` passes

### Lint
- [ ] `pnpm lint` passes
- [ ] No TypeScript errors in new files

### Tests
- [ ] Unit tests for `StreamingStats` accuracy
- [ ] Unit tests for `StreamingPercentiles` accuracy
- [ ] Unit tests for `readLargeRange` chunking
- [ ] Integration tests with mock Office.js context
- [ ] `pnpm test` passes

### Manual Testing
- [ ] Profile 100K row sheet in <5 seconds
- [ ] Progress bar updates smoothly during profiling
- [ ] Abort/cancel works mid-profile
- [ ] Memory usage stays bounded (check DevTools)
- [ ] Works on Windows Excel Desktop
- [ ] Works on Mac Excel Desktop
- [ ] Works on Excel Online (browser)

## Safety Considerations

### Memory Management
- Clear chunk arrays after processing
- Use generators to avoid storing full dataset
- Set reasonable MAX_PROFILE_ROWS limit (50K)
- Log warnings if memory pressure detected

### Error Handling
- Catch `RequestPayloadSizeLimitExceeded` and retry with smaller chunks
- Handle timeout errors gracefully
- Preserve partial results on abort

### Performance Guardrails
- Default chunk size: 5,000 rows (adjustable)
- Yield between chunks to keep UI responsive
- Progressive profiling to avoid blocking on sheet open
- Cache profiles to avoid re-computation

## Confidence Score

**8/10**

**Reasoning:**
- (+) Existing chunking pattern in `profiler.ts` provides clear foundation
- (+) Well-documented Office.js best practices available
- (+) Welford's algorithm is well-established and straightforward
- (+) Clear type definitions already exist in `profile.ts`
- (-) Cross-platform testing (Mac/Web) may reveal unexpected limits
- (-) Generator pattern with Office.js needs careful error handling
- (-) Memory profiling in add-in context is tricky

## Notes

### Decisions Made

1. **Chunk size default: 5,000 rows** - Conservative starting point per Microsoft docs
2. **Reservoir size: 1,000 samples** - Balances accuracy vs memory for percentiles
3. **Yield between chunks** - Prevents UI freeze, slight performance cost acceptable
4. **Progressive profiling** - Matches FEATURE_PLAN.md specification

### Future Improvements (Out of Scope)

- Parallel chunk reading (would require SharedArrayBuffer)
- Web Worker for stats computation (Office.js context sharing issues)
- Compressed localStorage cache for profiles
- Automatic chunk size tuning based on error rates

### Dependencies to Install

None - all implementations use native JavaScript/TypeScript.
