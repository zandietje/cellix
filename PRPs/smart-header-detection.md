# PRP: Smart Header Detection & Multi-Section Sheet Understanding

## Overview

The profiling system assumes row 1 always contains column headers. This completely breaks for real-world Excel sheets that have:
- Empty row(s) at the top
- Multi-level hierarchical headers (section headers + sub-headers)
- Pivot-table layouts with side-by-side data sections
- Merged cells or grouped headers spanning multiple rows

This PRP implements smart header detection that scans the first N rows to find the actual header row, merges multi-level headers into descriptive column names, and correctly identifies where data starts.

## Context

- **Phase:** Post-MVP (Enhancement to Phase 5 Sheet Intelligence)
- **Priority:** Critical — Without this, the AI cannot understand most real-world ecommerce exports
- **Dependencies:** Phase 5A-5C (Profile system, smart retrieval)
- **Estimated Effort:** 2-3 days

### Problem Statement (Real Example)

The user's "PVT Sales by SKU" sheet has this structure:

```
Row 1: (empty)
Row 2: | ... | Customer group2 | Brand.com | ... | Customer group2 | Shopee | ... | Customer group2 | Lazada | ... |
Row 3: (empty)
Row 4: | ... | Product Model Number | AH4 | Sum of Net Retail Sales | Sum of Quantity | ... | (repeated per section) |
Row 5+: (data)
```

**Current behavior:** Profiler extracts empty row 1 as headers → all 65 columns get `header: null`, `semantic: unknown`. The AI has zero understanding of the sheet.

**Expected behavior:** Profiler detects row 4 as the header row, row 2 as section headers, and produces column names like `"Shopee > Product Model Number"`, `"Shopee > Sum of Net Retail Sales"`, etc.

### Related Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `apps/addin/src/lib/excel/profiler.ts` | Sheet profile extraction | Smart header detection + multi-level merge |
| `apps/addin/src/lib/data/arquero.ts` | Arquero table creation | Dynamic header row support + deduplication |
| `apps/addin/src/lib/tools/readers.ts` | Read tool executors | Use detected headerRow for table creation |
| `apps/backend/src/services/ai/context.ts` | Context formatting for AI | Show section grouping info |
| `packages/shared/src/types/profile.ts` | Profile type definitions | Add headerRow, sections fields |

---

## Design

### Core Concept: Header Detection Algorithm

Scan the first N rows (default: 10) and score each row as a potential header row using multiple signals:

```
Score = fillRatio × textRatio × (1 - numberPenalty) × (1 - dataPatternPenalty) × uniqueBonus × lengthBonus × positionFactor
```

**Signals (weighted):**

| Signal | What it measures | Why it matters |
|--------|-----------------|----------------|
| `fillRatio` | fraction of non-empty cells | Headers fill most columns; empty rows score 0 |
| `textRatio` | fraction of non-empty cells that are actual text strings | Headers are text, not numbers |
| `numberPenalty` | fraction of non-empty cells that are numbers | Data rows have lots of numbers; headers don't |
| `dataPatternPenalty` | fraction of non-empty cells that look like dates, currencies, or formatted numbers | Data rows contain date/currency patterns; headers don't. Catches text-heavy data rows (SKU lists with embedded dates/prices) that `numberPenalty` alone would miss |
| `uniqueBonus` | ratio of unique values to filled cells | Headers have moderate-high uniqueness (>0.6), but NOT requiring 100% since pivot headers repeat across sections |
| `lengthBonus` | inverse of average text length | Headers are short (5-25 chars); titles/notes are long (>40 chars) |
| `positionFactor` | slight penalty for rows far from top | Headers are usually in first few rows |

**Minimum threshold:** `fillRatio >= 0.2` (lowered from 0.3 to handle wide sheets with blank separator columns between sections).

**Fallback: Synthetic headers (NOT row 0).** If no row scores above 0, row 0 is most likely garbage (empty, a title, or data). Instead of poisoning semantics with bad headers:
- Set `headerRow = -1` (no headers detected)
- Generate synthetic headers: `ColumnA`, `ColumnB`, ..., `ColumnAA`, etc. (using column letters for natural reference)
- Set `dataStartRow` = first non-empty row in the sheet
- This avoids the old behavior where an empty row 0 produced all-null headers with `semantic: unknown`

### Section Header Detection

A row qualifies as a **candidate section header** if:
1. It appears above the detected header row
2. It has significantly fewer non-empty cells than the header row (< 50%)
3. ALL non-empty cells are text strings (explicit `typeof === 'string'` check)
4. It has at least 2 non-empty cells (single-label rows are titles, not sections)

When multiple candidate section rows exist, **pick the best one** (not combine all):
- Score each candidate by: label count, known-platform matches, semantic meaningfulness, **proximity to header row**
- **Proximity bias:** The section row is typically the one immediately above the header (or within 1-2 rows). A sparse row at row 0 with "Shopee" in it is less likely to be the section row than one at row 2 when headers are at row 3. Give a bonus of +3 if the row is within 2 rows of the header, +1 if within 4 rows, and 0 otherwise
- Use the top-scoring row as THE section row
- This avoids accidentally picking a title-ish row far from the header that happens to contain a known platform name

### Known-Platform Dictionary (Domain-Specific Boost)

For ecommerce context, boost section row scoring when labels match known platforms:

```typescript
const KNOWN_PLATFORMS = [
  'shopee', 'lazada', 'tiktok', 'tiktok shop', 'brand.com',
  'offline', 'amazon', 'tokopedia', 'bukalapak', 'blibli',
  'zalora', 'jd.id', 'wholesale', 'retail', 'b2b', 'b2c',
];
```

If a section row contains labels matching known platforms, give it a strong scoring bonus. This makes "Shopee" win over "Customer group2" as the section label.

### Column Name Construction (Forward-Fill)

Build section prefixes using a single-pass forward-fill on the chosen section row:

```typescript
// One pass: forward-fill section labels across columns
const prefixByCol: string[] = [];
let currentLabel = '';
for (let c = 0; c < row.length; c++) {
  if (row[c] != null && row[c] !== '') currentLabel = String(row[c]);
  prefixByCol[c] = currentLabel;
}
```

Then for each column at index `i`:
- `qualifiedName = prefixByCol[i] ? `${prefixByCol[i]} > ${header}` : undefined`

**Handling adjacent field-name/value pairs** (e.g., "Customer group2" | "Shopee"):
When two adjacent non-empty cells exist and one matches a known platform, prefer the platform name as the section label. Otherwise, use the rightmost non-empty value (it's usually the more specific label).

### Data Start Row

`dataStartRow` = first row after `headerRow` that has at least one non-empty cell. Skip any empty gap rows immediately after the header.

### Row Indices: Absolute, Not Relative

All indices (`headerRow`, `dataStartRow`) are **absolute 0-based sheet indices** (row 0 = Excel row 1). This holds true regardless of whether values come from a capped sample, chunked read, or streaming. Tools that consume these indices must use raw sheet data starting from row 0.

---

## Implementation Steps

### Step 1: Add types to shared profile types

**File:** `packages/shared/src/types/profile.ts`

Add to `SheetProfile`:
```typescript
export interface SheetProfile {
  // ... existing fields ...

  /** Detected header row (0-based absolute index). -1 if no headers detected. */
  headerRow: number;
  /** Row where actual data starts (0-based absolute index) */
  dataStartRow: number;
  /** Section groups detected in the sheet (from multi-level headers) */
  sections?: SheetSection[];
  /** Debug info about header detection (for troubleshooting) */
  headerDetection?: HeaderDetectionDebug;
}

/** A section group detected from multi-level headers */
export interface SheetSection {
  /** Section name (e.g., "Shopee", "Brand.com") */
  name: string;
  /** Starting column index (0-based, inclusive) */
  startCol: number;
  /** Ending column index (0-based, inclusive) */
  endCol: number;
  /** Column letters range (e.g., "AI-AN") */
  columnRange: string;
}

/** Debug output from header detection (helps troubleshooting) */
export interface HeaderDetectionDebug {
  /** All candidate rows with their scores */
  candidates: Array<{ row: number; score: number }>;
  /** The chosen header row index */
  chosenRow: number;
  /** Section row index (-1 if none) */
  sectionRow: number;
}
```

Add to `ColumnProfile`:
```typescript
export interface ColumnProfile {
  // ... existing fields ...

  /** Section this column belongs to (from multi-level headers) */
  section?: string;
  /** Full qualified name including section prefix (e.g., "Shopee > Sum of Quantity") */
  qualifiedName?: string;
}
```

### Step 2: Implement header detection in profiler

**File:** `apps/addin/src/lib/excel/profiler.ts`

Create the detection functions:

```typescript
/** Maximum rows to scan for header detection */
const HEADER_SCAN_ROWS = 10;

/** Known ecommerce platform names for section detection boosting */
const KNOWN_PLATFORMS = new Set([
  'shopee', 'lazada', 'tiktok', 'tiktok shop', 'brand.com',
  'offline', 'amazon', 'tokopedia', 'bukalapak', 'blibli',
  'zalora', 'jd.id', 'wholesale', 'retail', 'b2b', 'b2c',
]);

interface HeaderDetectionResult {
  /** 0-based absolute index of the detected header row (-1 if none) */
  headerRow: number;
  /** 0-based absolute index where data starts */
  dataStartRow: number;
  /** Headers extracted from the detected row */
  headers: string[];
  /** Index of the chosen section row (-1 if none) */
  sectionRowIndex: number;
  /** Detected sections with column ranges */
  sections: SheetSection[];
  /** Debug info: all candidate scores */
  debug: HeaderDetectionDebug;
}

/** Date/currency/formatted-number patterns that indicate a data row, not a header */
const DATA_PATTERN = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}|^[$€£¥₱][\d,.]+|^[\d,.]+[$€£¥₱%]|^\d{1,3}(,\d{3})+(\.\d+)?$/;

/**
 * Detect the actual header row by scoring the first N rows.
 * Uses multiple signals: fill ratio, text ratio, number penalty,
 * data-pattern penalty, uniqueness, average text length, and row position.
 */
function detectHeaderRow(values: unknown[][], totalCols: number): HeaderDetectionResult {
  const scanRows = Math.min(values.length, HEADER_SCAN_ROWS);

  if (scanRows === 0) {
    return {
      headerRow: -1, dataStartRow: 0, headers: [], sectionRowIndex: -1, sections: [],
      debug: { candidates: [], chosenRow: -1, sectionRow: -1 },
    };
  }

  // Score each row as a header candidate
  const candidates: Array<{ row: number; score: number }> = [];

  for (let r = 0; r < scanRows; r++) {
    const row = values[r];
    const nonEmpty = row.filter(cell => cell != null && cell !== '');

    if (nonEmpty.length === 0) {
      candidates.push({ row: r, score: 0 });
      continue;
    }

    // 1. Fill ratio: what fraction of total columns are non-empty
    const fillRatio = nonEmpty.length / totalCols;

    // Minimum fill: at least 20% of columns should be non-empty
    if (fillRatio < 0.2) {
      candidates.push({ row: r, score: 0 });
      continue;
    }

    // 2. Text ratio: fraction of non-empty cells that are actual text strings
    //    IMPORTANT: Only typeof === 'string' counts as text. Not booleans, not objects.
    const textCells = nonEmpty.filter(cell => typeof cell === 'string' && String(cell).trim() !== '');
    const textRatio = textCells.length / nonEmpty.length;

    // 3. Number penalty: fraction of non-empty cells that are numbers
    //    Data rows have lots of numbers; headers don't.
    const numericCells = nonEmpty.filter(cell => typeof cell === 'number');
    const numberPenalty = numericCells.length / nonEmpty.length;

    // 4. Data-pattern penalty: fraction of text cells that look like dates, currencies,
    //    or formatted numbers. Catches text-heavy data rows (SKU lists with prices/dates)
    //    that numberPenalty alone would miss.
    const dataPatternCells = textCells.filter(cell => DATA_PATTERN.test(String(cell).trim()));
    const dataPatternPenalty = textCells.length > 0 ? dataPatternCells.length / textCells.length : 0;

    // 5. Uniqueness: ratio of unique values to filled cells
    //    Headers have moderate-high uniqueness, but pivot headers repeat
    //    across sections ("Sum of Quantity" x3), so we accept >0.6 not 1.0.
    const uniqueValues = new Set(nonEmpty.map(v => String(v).toLowerCase().trim()));
    const uniqueRatio = uniqueValues.size / nonEmpty.length;
    const uniqueBonus = uniqueRatio > 0.6 ? 1.3 : uniqueRatio > 0.3 ? 1.0 : 0.8;

    // 6. Average text length: headers are short (5-25 chars), titles are long (>40)
    const avgLen = textCells.length > 0
      ? textCells.reduce((sum, cell) => sum + String(cell).length, 0) / textCells.length
      : 0;
    const lengthBonus = avgLen > 0 && avgLen <= 30 ? 1.2 : avgLen > 40 ? 0.6 : 1.0;

    // 7. Position: slight preference for rows closer to top
    //    Don't over-penalize rows 6-10 (some exports have titles + blank + header at row 8)
    const positionFactor = 1.0 - (r * 0.015);

    // Combined score
    const score = fillRatio * textRatio * (1 - numberPenalty) * (1 - dataPatternPenalty)
      * uniqueBonus * lengthBonus * positionFactor;

    candidates.push({ row: r, score });
  }

  // Find the best header row
  let headerRow = -1;
  let bestScore = 0;
  for (const c of candidates) {
    if (c.score > bestScore) {
      bestScore = c.score;
      headerRow = c.row;
    }
  }

  // If best score is 0, no valid header found — use synthetic headers
  // (NOT row 0, which is likely garbage: empty, a title, or data)
  if (bestScore === 0) {
    const syntheticHeaders = Array.from({ length: totalCols }, (_, i) =>
      `Column${numberToColumn(i + 1)}`
    );
    // Find first non-empty row as data start
    let firstDataRow = 0;
    for (let r = 0; r < values.length; r++) {
      if (values[r].some(cell => cell != null && cell !== '')) {
        firstDataRow = r;
        break;
      }
    }
    return {
      headerRow: -1, dataStartRow: firstDataRow, headers: syntheticHeaders,
      sectionRowIndex: -1, sections: [],
      debug: { candidates, chosenRow: -1, sectionRow: -1 },
    };
  }

  // Extract headers from detected row
  const headers = values[headerRow].map(cell => String(cell ?? ''));

  // Find data start row (first non-empty row after header)
  let dataStartRow = headerRow + 1;
  while (dataStartRow < values.length) {
    const row = values[dataStartRow];
    const nonEmpty = row.filter(cell => cell != null && cell !== '');
    if (nonEmpty.length > 0) break;
    dataStartRow++;
  }

  // ═══════════════════════════════════════════════════════
  // Section detection: pick the BEST section row above headerRow
  // ═══════════════════════════════════════════════════════
  const headerNonEmptyCount = values[headerRow].filter(cell => cell != null && cell !== '').length;

  interface SectionCandidate {
    rowIndex: number;
    labels: string[];
    score: number;
  }

  const sectionCandidates: SectionCandidate[] = [];

  for (let r = 0; r < headerRow; r++) {
    const row = values[r];
    const nonEmpty = row.filter(cell => cell != null && cell !== '');
    const nonEmptyCount = nonEmpty.length;

    // Must have at least 2 labels (single-label rows are titles)
    if (nonEmptyCount < 2) continue;

    // Must be sparser than header row (<50% fill)
    if (nonEmptyCount >= headerNonEmptyCount * 0.5) continue;

    // All non-empty cells must be text strings
    const allText = nonEmpty.every(cell => typeof cell === 'string' && String(cell).trim() !== '');
    if (!allText) continue;

    // Extract labels
    const labels = nonEmpty.map(cell => String(cell).trim());

    // Score this section row
    let sectionScore = labels.length; // more labels = better

    // Big bonus for known platform names
    const platformMatches = labels.filter(l => KNOWN_PLATFORMS.has(l.toLowerCase()));
    sectionScore += platformMatches.length * 5;

    // Slight bonus for short labels (section names are usually short)
    const avgLabelLen = labels.reduce((s, l) => s + l.length, 0) / labels.length;
    if (avgLabelLen <= 15) sectionScore += 2;

    // Proximity bias: section row is typically within 1-2 rows of the header.
    // A title row at row 0 with "Shopee" shouldn't beat a proper section row
    // at row 2 when headers are at row 3.
    const distance = headerRow - r;
    if (distance <= 2) sectionScore += 3;
    else if (distance <= 4) sectionScore += 1;
    // distance > 4: no proximity bonus

    sectionCandidates.push({ rowIndex: r, labels, score: sectionScore });
  }

  // Pick the best section row (highest score)
  let sectionRowIndex = -1;
  let sections: SheetSection[] = [];

  if (sectionCandidates.length > 0) {
    sectionCandidates.sort((a, b) => b.score - a.score);
    const bestSection = sectionCandidates[0];
    sectionRowIndex = bestSection.rowIndex;
    sections = extractSectionsFromRow(values[sectionRowIndex], totalCols);
  }

  // Log detection results for debugging
  console.debug('[Profiler] Header detection:', {
    chosenRow: headerRow,
    score: bestScore,
    runnerUp: candidates.filter(c => c.row !== headerRow).sort((a, b) => b.score - a.score)[0],
    sectionRow: sectionRowIndex,
    sectionLabels: sectionCandidates[0]?.labels,
  });

  return {
    headerRow,
    dataStartRow,
    headers,
    sectionRowIndex,
    sections,
    debug: {
      candidates: candidates.filter(c => c.score > 0),
      chosenRow: headerRow,
      sectionRow: sectionRowIndex,
    },
  };
}

/**
 * Extract section definitions from a sparse row using forward-fill.
 * Each non-empty cell starts a new section label that fills rightward
 * until the next non-empty cell.
 *
 * Special handling for adjacent field-name/value pairs common in pivots:
 * e.g., "Customer group2" | "Shopee" → prefer "Shopee" (more specific)
 * When two adjacent non-empty cells exist and one matches a known platform,
 * the platform name becomes the section label.
 */
function extractSectionsFromRow(row: unknown[], totalCols: number): SheetSection[] {
  // Forward-fill: build a prefix label for every column
  const prefixByCol: string[] = new Array(totalCols).fill('');
  let currentLabel = '';

  for (let c = 0; c < row.length && c < totalCols; c++) {
    const cell = row[c];
    if (cell != null && cell !== '') {
      const cellStr = String(cell).trim();

      // Check if next cell is also non-empty (adjacent pair)
      const nextCell = c + 1 < row.length ? row[c + 1] : null;
      if (nextCell != null && nextCell !== '') {
        const nextStr = String(nextCell).trim();
        // Prefer the known platform name, or the second (more specific) label
        if (KNOWN_PLATFORMS.has(nextStr.toLowerCase())) {
          currentLabel = nextStr;
          prefixByCol[c] = currentLabel;
          c++; // skip next cell, we consumed it
          prefixByCol[c] = currentLabel;
          continue;
        } else if (KNOWN_PLATFORMS.has(cellStr.toLowerCase())) {
          currentLabel = cellStr;
        } else {
          // Neither is a known platform — use the second (usually more specific)
          currentLabel = nextStr;
          prefixByCol[c] = currentLabel;
          c++; // skip next cell
          prefixByCol[c] = currentLabel;
          continue;
        }
      } else {
        currentLabel = cellStr;
      }
    }
    prefixByCol[c] = currentLabel;
  }

  // Build sections from contiguous runs of the same label
  const sections: SheetSection[] = [];
  let currentSection: { name: string; startCol: number } | null = null;

  for (let c = 0; c < totalCols; c++) {
    const label = prefixByCol[c];
    if (!label) {
      // No section — close current if any
      if (currentSection) {
        sections.push({
          name: currentSection.name,
          startCol: currentSection.startCol,
          endCol: c - 1,
          columnRange: `${numberToColumn(currentSection.startCol + 1)}-${numberToColumn(c)}`,
        });
        currentSection = null;
      }
      continue;
    }

    if (!currentSection || currentSection.name !== label) {
      // Close previous section
      if (currentSection) {
        sections.push({
          name: currentSection.name,
          startCol: currentSection.startCol,
          endCol: c - 1,
          columnRange: `${numberToColumn(currentSection.startCol + 1)}-${numberToColumn(c)}`,
        });
      }
      // Start new section
      currentSection = { name: label, startCol: c };
    }
  }

  // Close last section
  if (currentSection) {
    sections.push({
      name: currentSection.name,
      startCol: currentSection.startCol,
      endCol: totalCols - 1,
      columnRange: `${numberToColumn(currentSection.startCol + 1)}-${numberToColumn(totalCols)}`,
    });
  }

  return sections;
}
```

### Step 3: Update profiler to use header detection

**File:** `apps/addin/src/lib/excel/profiler.ts`

Replace the hardcoded `cappedValues[0]` header extraction in `extractSheetProfile` (around line 148):

**Before:**
```typescript
const headers = cappedValues.length > 0 ? cappedValues[0].map((cell) => String(cell ?? '')) : [];
const columns = buildColumnProfiles(cappedValues, headers);
```

**After:**
```typescript
const detection = detectHeaderRow(cappedValues, totalCols);
const headers = detection.headers;

// Build a virtual values array with: [header row, data rows...]
// This lets buildColumnProfiles and createTable work correctly
// regardless of where headers and data are in the original sheet.
const dataValues = detection.dataStartRow < cappedValues.length
  ? [
      headers.map((h, i) => h || `Column${i + 1}`),
      ...cappedValues.slice(detection.dataStartRow),
    ]
  : [headers.map((h, i) => h || `Column${i + 1}`)];

const columns = buildColumnProfiles(dataValues, headers);

// Enrich columns with section info and qualified names
for (const col of columns) {
  const section = detection.sections.find(
    s => col.index >= s.startCol && col.index <= s.endCol
  );
  if (section) {
    col.section = section.name;
    if (col.header) {
      col.qualifiedName = `${section.name} > ${col.header}`;
    } else {
      // Blank header under a section: use column letter as fallback
      col.qualifiedName = `${section.name} > Column ${col.letter}`;
    }
  }
}
```

Include detection results in the returned `SheetProfile`:
```typescript
return {
  sheetName: metadata.sheetName,
  usedRange: rangeAddress,
  rowCount: totalRows,
  columnCount: totalCols,
  columns,
  tables,
  headerRow: detection.headerRow,
  dataStartRow: detection.dataStartRow,
  sections: detection.sections.length > 0 ? detection.sections : undefined,
  headerDetection: detection.debug,
  extractedAt: Date.now(),
  version: 2, // Bumped from 1 → invalidates old caches
};
```

### Step 4: Update streaming profiler path

**File:** `apps/addin/src/lib/excel/profiler.ts`

The `extractProfileWithStreaming` function hardcodes row 0 as headers (line 472):

```typescript
const headerRange = sheet.getRangeByIndexes(0, 0, 1, totalCols);
```

**Change to:** Read first 10 rows, run `detectHeaderRow`, then use the detected row:

```typescript
// Read first HEADER_SCAN_ROWS rows for header detection
const scanRowCount = Math.min(HEADER_SCAN_ROWS, totalRows);
const scanRange = sheet.getRangeByIndexes(0, 0, scanRowCount, totalCols);
scanRange.load('values');
await context.sync();

const detection = detectHeaderRow(scanRange.values, totalCols);
headers = detection.headers;
```

Also update the streaming loop to skip rows before `detection.dataStartRow`:

```typescript
// Track absolute row index to skip pre-data rows
let absoluteRowIndex = 0;
let isFirstChunk = true;

for await (const chunk of streamLargeRange(sheetName, undefined, { chunkSize, onProgress, abortSignal })) {
  for (const row of chunk) {
    // Skip all rows before dataStartRow (headers, section rows, empty gaps)
    if (absoluteRowIndex <= detection.dataStartRow - 1) {
      // But count the header row for first-chunk logic
      absoluteRowIndex++;
      continue;
    }
    absoluteRowIndex++;
    processedRows++;

    // ... existing per-row stats logic ...
  }
  isFirstChunk = false;
}
```

Include the same `headerRow`, `dataStartRow`, `sections`, `headerDetection` fields in the streaming profile result.

### Step 5: Update Arquero table creation with deduplication

**File:** `apps/addin/src/lib/data/arquero.ts`

Update `createTable` to support a custom header row index and **deduplicate column names** (Arquero requires unique column names):

```typescript
/**
 * Create an Arquero table from Excel-style 2D array.
 * @param values - 2D array of values
 * @param hasHeaders - Whether values include a header row
 * @param headerRowIndex - 0-based index of header row within the values array (default: 0)
 * @param dataStartIndex - 0-based index where data starts within values (default: headerRowIndex + 1)
 * @param qualifiedNames - Optional map of column index → qualified name (used as key for dedup)
 */
export function createTable(
  values: unknown[][],
  hasHeaders = true,
  headerRowIndex = 0,
  dataStartIndex?: number,
  qualifiedNames?: Map<number, string>
): ColumnTable | null {
  if (values.length === 0) return null;

  const effectiveDataStart = dataStartIndex ?? (hasHeaders ? headerRowIndex + 1 : 0);

  // Build raw headers
  const rawHeaders = hasHeaders
    ? values[headerRowIndex].map((h, i) => String(h ?? `Column${i + 1}`))
    : values[0].map((_, i) => `Column${i + 1}`);

  const dataRows = values.slice(effectiveDataStart);
  if (dataRows.length === 0) return null;

  // Deduplicate column names:
  // - Use qualifiedName if available (already unique by design: "Shopee > Sum of Quantity")
  // - Otherwise, suffix duplicates with __2, __3, etc.
  const usedNames = new Map<string, number>();
  const finalHeaders: string[] = [];

  for (let i = 0; i < rawHeaders.length; i++) {
    let name = qualifiedNames?.get(i) || rawHeaders[i] || `Column${i + 1}`;

    // Deduplicate
    const count = usedNames.get(name) || 0;
    if (count > 0) {
      name = `${name}__${count + 1}`;
    }
    usedNames.set(qualifiedNames?.get(i) || rawHeaders[i] || `Column${i + 1}`, count + 1);
    finalHeaders.push(name);
  }

  // Build column-oriented format
  const columns: Record<string, unknown[]> = {};
  finalHeaders.forEach((header, colIndex) => {
    columns[header] = dataRows.map((row) => row[colIndex]);
  });

  return aq.table(columns);
}
```

### Step 6: Update read tools to use detected header row

**File:** `apps/addin/src/lib/tools/readers.ts`

**6a. Update all tool executors** to use the profile's `headerRow` and `dataStartRow`:

```typescript
export async function executeSelectRows(params: SelectRowsParams): Promise<SelectRowsResult> {
  const profile = await executeGetProfile({ sheet: params.sheet });
  const values = await readSheetData(params.sheet);

  if (values.length === 0) {
    return { rows: [], total: 0, columns: [] };
  }

  // Use detected header row from profile instead of assuming row 0
  const headerRow = profile.headerRow ?? 0;
  const dataStart = profile.dataStartRow ?? headerRow + 1;

  // Build qualified name map for Arquero dedup
  const qualifiedNames = new Map<number, string>();
  for (const col of profile.columns) {
    if (col.qualifiedName) {
      qualifiedNames.set(col.index, col.qualifiedName);
    }
  }

  const table = createTable(values, true, headerRow, dataStart, qualifiedNames);
  // ... rest of existing logic (filters, orderBy, pagination) ...
}
```

Apply the same pattern to `executeGroupAggregate`, `executeFindOutliers`, `executeSearchValues`.

**6b. Improve `resolveColumn`** with normalized, section-aware matching:

```typescript
/**
 * Resolve column reference (letter, header name, or qualified name) to
 * the actual column name as it appears in the Arquero table.
 * Supports: column letters, exact headers, qualified names, fuzzy matching.
 */
function resolveColumn(ref: string, profile: SheetProfile): string {
  const normalRef = ref.trim().toLowerCase();

  // 1. Column letter (A, B, AA, etc.) → qualified name or header
  if (/^[A-Z]+$/i.test(ref)) {
    const idx = columnToNumber(ref.toUpperCase()) - 1;
    const col = profile.columns[idx];
    return col?.qualifiedName ?? col?.header ?? ref;
  }

  // 2. Exact match on qualifiedName (case-insensitive, trimmed)
  const byQualified = profile.columns.find(
    c => c.qualifiedName?.trim().toLowerCase() === normalRef
  );
  if (byQualified) return byQualified.qualifiedName ?? byQualified.header ?? ref;

  // 3. Exact match on header name (case-insensitive, trimmed)
  const byHeader = profile.columns.find(
    c => c.header?.trim().toLowerCase() === normalRef
  );
  if (byHeader) return byHeader.qualifiedName ?? byHeader.header ?? ref;

  // 4. Fuzzy: ref is contained within a qualified name or header
  const byFuzzy = profile.columns.find(c =>
    c.qualifiedName?.toLowerCase().includes(normalRef) ||
    c.header?.toLowerCase().includes(normalRef)
  );
  if (byFuzzy) return byFuzzy.qualifiedName ?? byFuzzy.header ?? ref;

  // 5. Section-aware: if ref contains a section name, match columns in that section
  if (profile.sections) {
    for (const section of profile.sections) {
      if (normalRef.includes(section.name.toLowerCase())) {
        // User referenced a section — find best matching column within it
        const sectionCols = profile.columns.filter(c => c.section === section.name);
        const remaining = normalRef.replace(section.name.toLowerCase(), '').trim();
        if (remaining) {
          const match = sectionCols.find(c => c.header?.toLowerCase().includes(remaining));
          if (match) return match.qualifiedName ?? match.header ?? ref;
        }
      }
    }
  }

  // 6. No match — return as-is and let Arquero handle the error
  return ref;
}
```

### Step 7: Update context formatting for AI

**File:** `apps/backend/src/services/ai/context.ts`

**7a.** Update the column table in `formatProfileContext` to show qualified names and section info:

```typescript
// In the column table loop:
for (const col of profile.columns.slice(0, MAX_PROFILE_COLUMNS)) {
  // Show qualified name when available, otherwise header, otherwise "-"
  const displayHeader = col.qualifiedName
    ? escapeMarkdown(col.qualifiedName)
    : col.header
      ? escapeMarkdown(col.header)
      : '-';
  const info = formatColumnInfo(col);
  lines.push(
    `| ${col.letter} | ${displayHeader} | ${col.dataType} | ${col.inferredName} | ${info} |`
  );
}
```

**7b.** Add section summary block after the column table:

```typescript
// Section info for multi-section sheets
if (profile.sections && profile.sections.length > 0) {
  lines.push('\n### Data Sections\n');
  lines.push('This sheet has multiple data sections arranged side by side:\n');
  for (const section of profile.sections) {
    const sectionCols = profile.columns.filter(c => c.section === section.name);
    const colHeaders = sectionCols
      .filter(c => c.header)
      .map(c => c.header)
      .slice(0, 5)
      .join(', ');
    lines.push(`- **${section.name}** (columns ${section.columnRange}): ${colHeaders}`);
  }
  lines.push('');
  lines.push('When querying a specific section, use the section-prefixed column names (e.g., "Shopee > Sum of Quantity").');
}
```

**7c.** Add header detection info:
```typescript
// Header detection note
if (profile.headerRow > 0) {
  lines.push(`\n*Note: Headers detected on row ${profile.headerRow + 1}, data starts on row ${profile.dataStartRow + 1}.*`);
}
```

### Step 8: Update planner prompt with section awareness

**File:** `apps/backend/src/services/ai/planner.ts`

Add to the planner system prompt (in the `PLANNER_SYSTEM_PROMPT` string) after the existing tool descriptions:

```
## Multi-Section Sheets:
- Some sheets have data organized in side-by-side sections (e.g., "Brand.com", "Shopee", "Lazada")
- The Excel Context will list detected sections and their column ranges
- Columns will show section prefixes like "Shopee > Sum of Quantity" or "Lazada > Product Model Number"
- When users ask about a specific platform/section, the query REQUIRES reading Excel → ANALYSIS intent
- Use select_rows or group_aggregate with the section-prefixed column names
- Example: "best selling product from Shopee" → ANALYSIS, tool: select_rows (filter/sort Shopee section columns)
- Example: "compare Brand.com vs Lazada" → ANALYSIS, tool: group_aggregate or select_rows
```

---

## Validation Gates

### Build Check
```bash
pnpm build
```

### Type Check
```bash
pnpm exec tsc --noEmit
```

### Manual Testing Scenarios

1. **Simple sheet (row 1 headers):** Should work exactly as before. `headerRow=0`, `dataStartRow=1`, no sections. Backward compatible.
2. **Empty row 1, headers on row 2:** Should detect row 2 as header row. `headerRow=1`, `dataStartRow=2`.
3. **Multi-level headers (user's sheet):** Should detect row 4 as header (0-indexed: 3), row 2 as section row (0-indexed: 1). Sections: "Brand.com", "Shopee", "Lazada". Qualified names: "Shopee > Product Model Number", etc.
4. **Completely empty sheet:** Should handle gracefully — empty profile, `headerRow=-1`.
5. **Sheet with all numbers (no text headers):** Should use synthetic headers `ColumnA, ColumnB, ...` since no row scores as a header. `headerRow=-1`, `dataStartRow` = first non-empty row.
6. **Sheet with merged cells in header area:** Forward-fill handles this — merged cells show value in leftmost cell, empty in the rest.
7. **Sheet with title row at top:** Title row ("Sales Report Q4 2025") should lose to actual header row because: few unique values (1 cell), low fill ratio, and high average text length.
8. **Wide sheet with blank separator columns:** fillRatio threshold of 0.2 allows detection even with sparse fills.
9. **Text-heavy data rows (SKU lists with dates/prices):** Data-pattern penalty prevents rows like `| SKU-001 | $12.99 | 2025-01-15 | Widget |` from scoring as headers, even though they're mostly text strings.
10. **Section row far from header:** If row 0 has "Shopee" as a title label and row 2 has proper section labels, proximity bias ensures row 2 wins (closer to headers at row 3).

### Test: Ask AI about sectioned sheet
1. Open "PVT Sales by SKU" sheet
2. Ask "Which product is the best selling from Shopee?"
3. Expected: AI correctly identifies Shopee section columns, uses select_rows with Shopee-prefixed columns
4. Ask "Which columns contain Shopee products?"
5. Expected: AI lists the Shopee section columns with their qualified names
6. Ask "Compare Brand.com vs Shopee sales"
7. Expected: AI queries both sections and compares totals

---

## Safety Considerations

1. **Backward compatibility:** `headerRow` defaults to 0 when not set, so existing simple sheets and old cached profiles keep working. Profile version bumped to 2 to invalidate stale caches.
2. **Performance:** Header detection scans only 10 rows — negligible cost. Section detection adds one forward-fill pass per candidate row.
3. **Edge cases:** If detection fails (all scores = 0), generate synthetic headers (`ColumnA`, `ColumnB`, ...) and set `dataStartRow` to the first non-empty row. This avoids poisoning semantics with garbage from row 0 (which is often empty or a title when detection fails).
4. **Cache invalidation:** Profile version incremented from 1 → 2. Old caches auto-invalidate on version mismatch.
5. **Section overlap:** Sections are non-overlapping by design (forward-fill produces contiguous, non-overlapping ranges).
6. **Arquero dedup:** Qualified names are unique across sections. If headers are truly identical within the same section (rare), suffix dedup (__2, __3) prevents silent overwrites.
7. **Row index alignment:** All indices are absolute 0-based sheet indices. `readSheetData` always reads from row 0, ensuring alignment with `headerRow` and `dataStartRow`.

---

## Files to Create

None — all changes are to existing files.

## Files to Modify

| File | Change Summary |
|------|----------------|
| `packages/shared/src/types/profile.ts` | Add `headerRow`, `dataStartRow`, `sections`, `headerDetection` to `SheetProfile`. Add `SheetSection`, `HeaderDetectionDebug` types. Add `section`, `qualifiedName` to `ColumnProfile`. |
| `apps/addin/src/lib/excel/profiler.ts` | Add `detectHeaderRow()` with multi-signal scoring, `extractSectionsFromRow()` with forward-fill and known-platform support. Update both `extractSheetProfile` (small sheet) and `extractProfileWithStreaming` (large sheet) paths. Bump profile version to 2. |
| `apps/addin/src/lib/data/arquero.ts` | Update `createTable()` with `headerRowIndex`, `dataStartIndex`, `qualifiedNames` params and deduplication logic. |
| `apps/addin/src/lib/tools/readers.ts` | Update all tool executors (`executeSelectRows`, `executeGroupAggregate`, `executeFindOutliers`, `executeSearchValues`) to use `profile.headerRow`/`profile.dataStartRow`. Rewrite `resolveColumn()` with normalized, case-insensitive, section-aware matching (6 resolution strategies). |
| `apps/backend/src/services/ai/context.ts` | Show qualified names in column table. Add "Data Sections" block. Add header detection note. |
| `apps/backend/src/services/ai/planner.ts` | Add "Multi-Section Sheets" guidance to planner system prompt. |

## Deviation Risks

| Risk | Mitigation |
|------|------------|
| Header detection picks wrong row | 7-signal scoring (including data-pattern penalty for date/currency text). Fallback to synthetic headers instead of garbage row 0. Debug output logged. Can add manual override later. |
| Text-heavy data row scores as header (SKU lists, product names) | `dataPatternPenalty` catches dates, currencies, and formatted numbers even in text cells. Combined with `numberPenalty`, covers both numeric and text-pattern data rows. |
| Section detection picks "Customer group2" over "Shopee" | Known-platform dictionary gives 5x score boost. Adjacent-pair logic prefers the more specific label. |
| Section detection picks a title row far from headers | Proximity bias gives +3 bonus to rows within 2 of the header, preventing a distant row with a matching platform name from winning. |
| Qualified names too long for AI context | Section names truncated to 20 chars in context formatting. |
| Arquero column name collisions | Qualified names are unique across sections. Within-section duplicates get __N suffix. |
| Breaking change for cached profiles | Version bump 1→2 auto-invalidates. Old code seeing new fields treats them as optional (undefined). |
| readSheetData offset mismatch | All indices are absolute from row 0. Documented as invariant. Assert in debug mode. |
