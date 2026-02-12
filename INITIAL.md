## FEATURE:

**Cellix Phase 5D: Office.js Performance Optimization**

Handle large Excel sheets (100K+ rows) without hitting memory or API limits. Implement chunked reading, streaming statistics, and background profiling.

### Goal
Enable the add-in to work with enterprise-scale data while maintaining responsive UX.

### Deliverables

1. **Chunked Range Reader** (`apps/addin/src/lib/excel/chunkedReader.ts`)
   - `readLargeRange()` - Read in 5000-row chunks with progress callback
   - Abort support for cancellation
   - Memory-efficient streaming via generators

2. **Streaming Statistics** (`apps/addin/src/lib/excel/streamingStats.ts`)
   - `StreamingStats` class - Compute sum/avg/min/max/stddev without loading all data
   - Welford's algorithm for single-pass standard deviation
   - `StreamingPercentiles` - Reservoir sampling for outlier detection

3. **Background Profiling**
   - Progressive profiling levels (instant → on-focus → on-question)
   - "Analyzing sheet..." UI indicator
   - Debounced re-extraction on sheet changes

## EXAMPLES:

### Chunked Reader Usage
```typescript
const data = await readLargeRange("A1:Z100000", {
  chunkSize: 5000,
  columns: ["A", "B", "C"], // Only load needed columns
  onProgress: (percent) => setProgress(percent),
  abortSignal: controller.signal
});
```

### Streaming Stats Usage
```typescript
const stats = new StreamingStats();
for await (const chunk of readChunks(range)) {
  chunk.forEach(row => stats.add(row.value));
}
console.log(stats.getAvg(), stats.getStdDev());
```

## DOCUMENTATION:

- **Office.js Best Practices**: Batch operations, minimize `context.sync()`, use `range.load("values")`
- **Welford's Algorithm**: Single-pass variance calculation
- **Existing profiler**: `apps/addin/src/lib/excel/profiler.ts`
- **Profile cache**: `apps/addin/src/lib/excel/profileCache.ts`

## OTHER CONSIDERATIONS:

### Files to Create
```
apps/addin/src/lib/excel/chunkedReader.ts   # NEW: Chunked reading with progress
apps/addin/src/lib/excel/streamingStats.ts  # NEW: Memory-efficient statistics
```

### Files to Modify
```
apps/addin/src/lib/excel/profiler.ts        # UPDATE: Use chunked reading
apps/addin/src/lib/excel/profileCache.ts    # UPDATE: Progressive profiling levels
apps/addin/src/components/controls/ControlPanel.tsx  # ADD: Progress indicator
```

### Key Performance Rules
- Use `context.application.suspendApiCalculationUntilNextSync()` during large writes
- Never load entire 100K+ ranges in one call - chunk at 5000 rows
- Clear large arrays after processing to free memory
- Use generators for streaming where possible

### Gotchas
- Office.js has a ~5MB payload limit per `context.sync()` - chunk accordingly
- `range.track()` required for long-running operations across syncs
- Mac Excel has stricter memory limits than Windows - test both
- Web Excel (browser) may have different limits than desktop

### Success Criteria
- [ ] 100K row sheet profiles in <5 seconds
- [ ] Progress indicator shows during large operations
- [ ] No memory errors on sheets up to 500K rows
- [ ] Streaming stats match full-load stats (accuracy test)
- [ ] Abort cancels in-flight operations cleanly
