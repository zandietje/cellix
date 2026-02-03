# Safety Controls Reference

## Overview

Cellix implements multiple layers of safety controls to prevent unintended data loss or corruption in Excel workbooks.

## Safety Principles

1. **Preview First** - Users see exactly what will change before it happens
2. **Explicit Consent** - Users must confirm significant operations
3. **Bounded Operations** - Hard limits on operation scope
4. **Audit Trail** - All operations logged for accountability
5. **No Destructive Defaults** - Conservative behavior by default

## Control Layers

### Layer 1: Tool Whitelist

Only explicitly allowed tools can be executed:

```typescript
const TOOL_WHITELIST = [
  // Write tools (require preview)
  'write_range',
  'set_formula',
  'set_formulas',
  'format_range',
  'create_sheet',
  'add_table',
  'highlight_cells',
  'add_summary_row',
  'create_chart',

  // Read tools (no preview needed)
  'read_range',
  'get_selection',
  'get_context',
  'get_sheet_names',
  'get_table_metadata',

  // Analytics tools (no Excel modification)
  'explain_kpi',
  'compare_periods',
  'compare_platforms',
  'detect_anomalies',
  'suggest_actions',
  'interpret_trend',

  // Data tools (preview for imports)
  'sync_orders',
  'sync_campaigns',
  'import_to_sheet',
  'refresh_data',
] as const;

function isToolAllowed(name: string): boolean {
  return TOOL_WHITELIST.includes(name as any);
}
```

### Layer 2: Parameter Validation

All parameters validated with Zod before execution:

```typescript
// Address validation (A1 notation)
const addressSchema = z.string().regex(
  /^('?[\w\s]+'?!)?[A-Z]+[0-9]+(:[A-Z]+[0-9]+)?$/,
  'Invalid Excel address format'
);

// Formula validation
const formulaSchema = z.string()
  .startsWith('=', 'Formula must start with =')
  .refine(
    (f) => !f.toLowerCase().includes('http'),
    'External links not allowed'
  )
  .refine(
    (f) => !f.toLowerCase().includes('workbook('),
    'Workbook functions not allowed'
  )
  .refine(
    (f) => !f.toLowerCase().includes('call('),
    'CALL function not allowed'
  );

// Values validation
const valuesSchema = z.array(z.array(
  z.union([z.string(), z.number(), z.boolean(), z.null()])
)).refine(
  (v) => v.length > 0 && v[0].length > 0,
  'Values cannot be empty'
);
```

### Layer 3: Operation Limits

Hard limits on operation scope:

```typescript
const SAFETY_LIMITS = {
  // Maximum cells per write operation
  MAX_CELLS_PER_WRITE: 500,

  // Confirmation threshold
  CONFIRM_THRESHOLD_CELLS: 50,

  // Maximum rows to sample for AI context
  MAX_CONTEXT_ROWS: 50,

  // Maximum sheets per workbook operation
  MAX_SHEETS_CREATE: 1,

  // Formula complexity limit (characters)
  MAX_FORMULA_LENGTH: 1000,
};

function checkCellLimit(address: string, values?: unknown[][]): void {
  const cellCount = values
    ? values.length * values[0].length
    : calculateCellCount(address);

  if (cellCount > SAFETY_LIMITS.MAX_CELLS_PER_WRITE) {
    throw new SafetyError(
      `Operation affects ${cellCount} cells. Maximum allowed: ${SAFETY_LIMITS.MAX_CELLS_PER_WRITE}`
    );
  }
}
```

### Layer 4: Preview System

All write operations generate previews:

```typescript
interface PreviewAction {
  id: string;
  tool: string;
  description: string;
  affectedRange: string;
  cellCount: number;
  requiresConfirmation: boolean;
  changes: PreviewChange[];
  timestamp: number;
}

interface PreviewChange {
  type: 'write' | 'formula' | 'format' | 'structure';
  range: string;
  before?: unknown;  // Current value (if overwriting)
  after: unknown;    // New value
}

function generatePreview(toolCall: ValidatedToolCall): PreviewAction {
  const cellCount = calculateCellCount(toolCall.parameters.address);

  return {
    id: crypto.randomUUID(),
    tool: toolCall.name,
    description: formatToolDescription(toolCall),
    affectedRange: toolCall.parameters.address,
    cellCount,
    requiresConfirmation: cellCount > SAFETY_LIMITS.CONFIRM_THRESHOLD_CELLS,
    changes: generateChanges(toolCall),
    timestamp: Date.now(),
  };
}
```

### Layer 5: Confirmation Dialog

Large operations require explicit confirmation:

```typescript
// In React component
function ConfirmationDialog({ preview }: { preview: PreviewAction }) {
  return (
    <Dialog open={preview.requiresConfirmation}>
      <DialogTitle>Confirm Operation</DialogTitle>
      <DialogContent>
        <Text>
          This operation will modify {preview.cellCount} cells in{' '}
          {preview.affectedRange}.
        </Text>
        <Text weight="semibold">
          Are you sure you want to proceed?
        </Text>
        <ChangesList changes={preview.changes} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button appearance="primary" onClick={onConfirm}>
          Confirm ({preview.cellCount} cells)
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

### Layer 6: Formula Safety

Specific checks for formula operations:

```typescript
const FORBIDDEN_FORMULA_PATTERNS = [
  /https?:\/\//i,           // External URLs
  /workbook\(/i,            // Workbook references
  /call\(/i,                // CALL function (XLM)
  /register\(/i,            // REGISTER function
  /webservice\(/i,          // Web service calls
  /\[.+\]/,                 // External workbook references
];

function isFormulaSafe(formula: string): boolean {
  for (const pattern of FORBIDDEN_FORMULA_PATTERNS) {
    if (pattern.test(formula)) {
      return false;
    }
  }
  return true;
}
```

### Layer 7: Audit Logging

All operations logged:

```typescript
interface AuditEntry {
  user_id: string;
  session_id: string;
  action: 'execute' | 'preview' | 'cancel' | 'error';
  tool_name: string;
  parameters: Record<string, unknown>;
  result: 'success' | 'error' | 'cancelled' | 'preview';
  error_message?: string;
  affected_range?: string;
  cell_count?: number;
  execution_time_ms?: number;
  created_at: Date;
}

async function logAudit(entry: AuditEntry): Promise<void> {
  await supabase.from('audit_log').insert(entry);
}

// Usage in execution flow
async function executeWithAudit(
  toolCall: ValidatedToolCall,
  userId: string
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    const result = await executeToolCall(toolCall);

    await logAudit({
      user_id: userId,
      action: 'execute',
      tool_name: toolCall.name,
      parameters: toolCall.parameters,
      result: 'success',
      affected_range: toolCall.parameters.address,
      cell_count: result.cellCount,
      execution_time_ms: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    await logAudit({
      user_id: userId,
      action: 'execute',
      tool_name: toolCall.name,
      parameters: toolCall.parameters,
      result: 'error',
      error_message: error.message,
      execution_time_ms: Date.now() - startTime,
    });

    throw error;
  }
}
```

## Blocked Operations (v1)

The following operations are NOT allowed in v1:

| Operation | Reason |
|-----------|--------|
| Delete sheet | Destructive, no undo |
| Delete workbook | Destructive |
| External links in formulas | Security risk |
| Macros/VBA | Security risk |
| Workbook references | Scope creep |
| More than 500 cells/write | Performance |

## Error Messages

User-friendly error messages:

```typescript
const SAFETY_ERROR_MESSAGES = {
  CELL_LIMIT_EXCEEDED:
    'This operation would modify {count} cells, which exceeds the safety limit of 500. Please select a smaller range.',

  FORMULA_UNSAFE:
    'This formula contains elements that are not allowed for security reasons. External links and certain functions are restricted.',

  TOOL_NOT_ALLOWED:
    'This operation is not available. Please use one of the supported tools.',

  PREVIEW_REQUIRED:
    'This operation requires preview before execution. Please review the changes first.',

  CONFIRMATION_REQUIRED:
    'This operation will modify {count} cells. Please confirm to proceed.',
};
```

## Testing Safety Controls

```typescript
describe('Safety Controls', () => {
  describe('Cell Limits', () => {
    it('blocks operations exceeding 500 cells', () => {
      const largeRange = 'A1:Z50'; // 1300 cells
      expect(() => checkCellLimit(largeRange)).toThrow();
    });

    it('allows operations within limit', () => {
      const smallRange = 'A1:J10'; // 100 cells
      expect(() => checkCellLimit(smallRange)).not.toThrow();
    });
  });

  describe('Formula Safety', () => {
    it('blocks external URLs', () => {
      expect(isFormulaSafe('=WEBSERVICE("https://evil.com")')).toBe(false);
    });

    it('allows standard formulas', () => {
      expect(isFormulaSafe('=SUM(A1:A10)')).toBe(true);
      expect(isFormulaSafe('=VLOOKUP(A1,B:C,2,FALSE)')).toBe(true);
    });
  });
});
```
