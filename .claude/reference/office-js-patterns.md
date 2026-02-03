# Office.js Patterns Reference

## Overview

Office.js is the JavaScript API for Excel add-ins. It uses a proxy-based object model that requires specific patterns for optimal performance.

## Core Concepts

### Request Context
All Excel operations must happen within an `Excel.run()` block:
```typescript
await Excel.run(async (context) => {
  // All operations here share the same context
  // Changes are queued until context.sync()
});
```

### Proxy Objects
Excel objects are proxies - they don't contain data until loaded:
```typescript
const range = sheet.getRange("A1:B10");
// range.values is undefined here!

range.load("values");
await context.sync();
// Now range.values contains the data
```

### Load Pattern
Always specify what properties to load:
```typescript
// Good - load only what you need
range.load(["values", "address"]);

// Bad - loads everything (slow)
range.load();
```

## Common Patterns

### Reading Data
```typescript
async function getSelectedRangeValues(): Promise<unknown[][]> {
  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load(["values", "address", "rowCount", "columnCount"]);
    await context.sync();

    return range.values;
  });
}
```

### Writing Data
```typescript
async function writeToRange(
  address: string,
  values: unknown[][]
): Promise<void> {
  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);

    range.values = values;
    await context.sync();
  });
}
```

### Batched Operations
```typescript
// Good - single sync for multiple operations
await Excel.run(async (context) => {
  const sheet = context.workbook.worksheets.getActiveWorksheet();

  const range1 = sheet.getRange("A1:B10");
  range1.values = data1;

  const range2 = sheet.getRange("C1:D10");
  range2.values = data2;

  const range3 = sheet.getRange("A1:D10");
  range3.format.font.bold = true;

  await context.sync(); // Single sync for all
});

// Bad - multiple syncs
await Excel.run(async (context) => {
  const sheet = context.workbook.worksheets.getActiveWorksheet();

  const range1 = sheet.getRange("A1:B10");
  range1.values = data1;
  await context.sync(); // Unnecessary sync

  const range2 = sheet.getRange("C1:D10");
  range2.values = data2;
  await context.sync(); // Unnecessary sync
});
```

### Error Handling
```typescript
async function safeExcelOperation(): Promise<Result> {
  try {
    return await Excel.run(async (context) => {
      // operations
    });
  } catch (error) {
    if (error instanceof OfficeExtension.Error) {
      switch (error.code) {
        case Excel.ErrorCodes.itemNotFound:
          return { error: "Range not found" };
        case Excel.ErrorCodes.invalidArgument:
          return { error: "Invalid range address" };
        case Excel.ErrorCodes.accessDenied:
          return { error: "Access denied to this range" };
        default:
          return { error: `Excel error: ${error.message}` };
      }
    }
    throw error;
  }
}
```

### Getting Sheet Information
```typescript
async function getSheetNames(): Promise<string[]> {
  return Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;
    sheets.load("items/name");
    await context.sync();

    return sheets.items.map(s => s.name);
  });
}
```

### Working with Tables
```typescript
async function getTableData(tableName: string): Promise<unknown[][]> {
  return Excel.run(async (context) => {
    const table = context.workbook.tables.getItem(tableName);
    const dataRange = table.getDataBodyRange();
    dataRange.load("values");
    await context.sync();

    return dataRange.values;
  });
}

async function createTable(
  address: string,
  name: string,
  hasHeaders: boolean
): Promise<void> {
  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const table = sheet.tables.add(address, hasHeaders);
    table.name = name;
    await context.sync();
  });
}
```

### Formatting
```typescript
async function formatRange(
  address: string,
  format: {
    fill?: string;
    fontColor?: string;
    bold?: boolean;
    numberFormat?: string;
  }
): Promise<void> {
  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);

    if (format.fill) {
      range.format.fill.color = format.fill;
    }
    if (format.fontColor) {
      range.format.font.color = format.fontColor;
    }
    if (format.bold !== undefined) {
      range.format.font.bold = format.bold;
    }
    if (format.numberFormat) {
      range.numberFormat = [[format.numberFormat]];
    }

    await context.sync();
  });
}
```

### Setting Formulas
```typescript
async function setFormula(
  address: string,
  formula: string
): Promise<void> {
  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const cell = sheet.getRange(address);

    cell.formulas = [[formula]];
    await context.sync();
  });
}

async function setFormulasR1C1(
  address: string,
  formula: string
): Promise<void> {
  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);

    range.formulasR1C1 = [[formula]];
    await context.sync();
  });
}
```

## Context Extraction Pattern

For Cellix, we extract context to send to AI:
```typescript
interface ExcelContext {
  selection: {
    address: string;
    values: unknown[][];
    headers: string[];
  };
  activeSheet: string;
  allSheets: string[];
  tables: { name: string; address: string }[];
}

async function extractContext(): Promise<ExcelContext> {
  return Excel.run(async (context) => {
    // Get selection
    const selection = context.workbook.getSelectedRange();
    selection.load(["address", "values", "rowCount", "columnCount"]);

    // Get active sheet
    const activeSheet = context.workbook.worksheets.getActiveWorksheet();
    activeSheet.load("name");

    // Get all sheets
    const sheets = context.workbook.worksheets;
    sheets.load("items/name");

    // Get tables
    const tables = context.workbook.tables;
    tables.load("items/name,items/getRange/address");

    await context.sync();

    // Sample large ranges (max 50 rows for AI)
    const values = selection.values;
    const sampledValues = values.length > 50 ? values.slice(0, 50) : values;

    return {
      selection: {
        address: selection.address,
        values: sampledValues,
        headers: sampledValues[0] as string[],
      },
      activeSheet: activeSheet.name,
      allSheets: sheets.items.map(s => s.name),
      tables: tables.items.map(t => ({
        name: t.name,
        address: t.getRange().address,
      })),
    };
  });
}
```

## Performance Tips

1. **Minimize syncs** - Batch operations before calling `context.sync()`
2. **Load selectively** - Only load properties you need
3. **Avoid loops with syncs** - Never put `sync()` inside a loop
4. **Track ranges** - Use `range.track()` for long-running operations
5. **Use suspendApiCalculationUntilNextSync** - For bulk writes:
   ```typescript
   context.application.suspendApiCalculationUntilNextSync();
   // bulk operations
   await context.sync();
   ```

## Cellix-Specific Rules

1. **Always validate addresses** before using them
2. **Cap cell operations** at 500 cells per write
3. **Sample large ranges** (max 50 rows) when extracting context
4. **Show preview** for all write operations
5. **Log all operations** to audit table
