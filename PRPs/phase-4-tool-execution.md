# PRP: Phase 4 - Tool Execution Engine

## Overview
Implement the preview-first tool execution system - Cellix's core differentiator. All Excel write operations must show a preview before execution, with validation, safety controls, and audit logging. Users see exactly what will change before any modifications happen.

## Context
- **Phase:** 4 (MVP Week 4)
- **Dependencies:** Phase 1-3 complete (chat UI, Excel helpers, AI integration)
- **Blocking:** This completes the MVP core functionality

## Related Files

### Existing Files to Leverage
- `apps/addin/src/lib/excel/writer.ts` - Excel write functions (already have validation)
- `apps/addin/src/lib/excel/reader.ts` - Excel read functions (for diff generation)
- `apps/addin/src/lib/excel/validation.ts` - Address/formula validation (reuse)
- `apps/addin/src/lib/constants.ts` - Safety limits (SAFETY_LIMITS)
- `apps/addin/src/store/chatStore.ts` - Chat state with tool calls
- `apps/backend/src/services/tools/schemas.ts` - Tool parameter schemas
- `packages/shared/src/types/chat.ts` - ToolCall, ToolCallStatus types
- `packages/shared/src/types/excel.ts` - WriteResult, FormatOptions types

### Existing Patterns to Follow
- Zustand stores: `chatStore.ts`, `excelStore.ts`, `uiStore.ts`
- Fluent UI components: `MessageBubble.tsx`, `ControlPanel.tsx`
- Excel.run() batching pattern in `reader.ts`, `writer.ts`
- Type exports from `packages/shared`

## Documentation References
- [Fluent UI Dialog](https://react.fluentui.dev/?path=/docs/components-dialog--default)
- [Fluent UI Card](https://react.fluentui.dev/?path=/docs/components-card--default)
- [Fluent UI Table](https://react.fluentui.dev/?path=/docs/components-table--default)
- [Office.js Excel API](https://learn.microsoft.com/en-us/javascript/api/excel)

## Research Findings

### Existing Patterns in Codebase

1. **Validation Already Implemented** (`validation.ts`):
   - `isValidAddress()` - A1 notation validation
   - `isFormulaAllowed()` - Formula safety checks
   - `validateCellCount()` - Cell limit enforcement
   - `requiresConfirmation()` - >50 cell threshold check

2. **Safety Constants Already Defined** (`constants.ts`):
   ```typescript
   SAFETY_LIMITS = {
     MAX_CELLS_PER_WRITE: 500,
     CONFIRM_THRESHOLD_CELLS: 50,
     MAX_FORMULA_LENGTH: 1000,
     // ...
   }
   ```

3. **ToolCall Type Already Exists** (`packages/shared/src/types/chat.ts`):
   ```typescript
   export type ToolCallStatus = 'pending' | 'preview' | 'executed' | 'cancelled' | 'error';
   export interface ToolCall {
     id: string;
     name: string;
     parameters: Record<string, unknown>;
     status: ToolCallStatus;
     error?: string;
     result?: unknown;
   }
   ```

4. **Writer Functions Return WriteResult** (`writer.ts`):
   - Already return `{ success, cellCount, error }` structure
   - Already validate before write
   - NOTE comments indicate Phase 4 preview wrapper needed

5. **Chat Store Parses Tool Calls** (`chatStore.ts`):
   - `updateLastAssistantMessage()` already parses tool calls
   - Sets status to `'pending'` by default

### Key Integration Points

1. **ChatPane.tsx** processes tool calls but doesn't execute them yet
2. **MessageBubble.tsx** displays messages but not tool calls
3. **App.tsx** has simple layout - preview panel will be added alongside chat

## Implementation Plan

### Files to Create

#### 1. Types (`apps/addin/src/lib/tools/types.ts`)
```typescript
// Extend existing ToolCall with execution-specific fields
export interface PreviewData {
  toolCall: ToolCall;
  affectedRange: string;
  cellCount: number;
  changes: CellChange[];
  warnings: string[];
  requiresConfirmation: boolean;
  validation: ValidationResult;
}

export interface CellChange {
  address: string;
  currentValue: unknown;
  newValue: unknown;
  isOverwrite: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: 'INVALID_ADDRESS' | 'SIZE_LIMIT_EXCEEDED' | 'INVALID_FORMULA' | 'UNSAFE_FORMULA' | 'TYPE_ERROR';
}

export interface ExecutionResult {
  success: boolean;
  toolCallId: string;
  cellsAffected: number;
  executionTimeMs: number;
  error?: string;
}

export interface AuditLogEntry {
  timestamp: number;
  toolName: string;
  parameters: Record<string, unknown>;
  result: 'success' | 'error' | 'cancelled';
  errorMessage?: string;
  cellsAffected: number;
  executionTimeMs: number;
}
```

#### 2. Preview Store (`apps/addin/src/store/previewStore.ts`)
```typescript
import { create } from 'zustand';
import type { PreviewData, ExecutionResult } from '../lib/tools/types';

interface PreviewState {
  pendingActions: PreviewData[];
  isExecuting: boolean;
  executionResults: ExecutionResult[];

  addPendingAction: (preview: PreviewData) => void;
  removePendingAction: (toolCallId: string) => void;
  approveAction: (toolCallId: string) => void;
  rejectAction: (toolCallId: string) => void;
  approveAll: () => void;
  rejectAll: () => void;
  setExecuting: (executing: boolean) => void;
  addExecutionResult: (result: ExecutionResult) => void;
  clearAll: () => void;
}
```

#### 3. Validator (`apps/addin/src/lib/tools/validator.ts`)
```typescript
// Consolidate validation from existing validation.ts
// Add tool-call-specific validation wrapper
export function validateToolCall(toolCall: ToolCall): ValidationResult;
export function validateWriteRange(params: WriteRangeParams): ValidationResult;
export function validateSetFormula(params: SetFormulaParams): ValidationResult;
export function validateFormatRange(params: FormatRangeParams): ValidationResult;
```

#### 4. Preview Generator (`apps/addin/src/lib/tools/preview.ts`)
```typescript
// Generate preview data for each tool call type
export async function generatePreview(toolCall: ToolCall): Promise<PreviewData>;
// Builds CellChange[] by reading current values
async function buildChanges(address: string, newValues: unknown[][]): Promise<CellChange[]>;
```

#### 5. Executor (`apps/addin/src/lib/tools/executor.ts`)
```typescript
// Execute approved tool calls
export async function executeToolCall(toolCall: ToolCall): Promise<ExecutionResult>;
export async function executeApprovedActions(
  previews: PreviewData[],
  onProgress: (result: ExecutionResult) => void
): Promise<ExecutionResult[]>;
```

#### 6. Audit Logger (`apps/addin/src/lib/tools/audit.ts`)
```typescript
// Local audit log (backend persistence in future)
export function logToolExecution(entry: AuditLogEntry): void;
export function getAuditLog(): AuditLogEntry[];
```

#### 7. Index Export (`apps/addin/src/lib/tools/index.ts`)
```typescript
export * from './types';
export * from './validator';
export * from './preview';
export * from './executor';
export * from './audit';
```

#### 8. Preview Panel (`apps/addin/src/components/preview/PreviewPanel.tsx`)
```typescript
// Main preview container showing pending actions
// Execute All / Reject All buttons
// Confirmation dialog for >50 cells
```

#### 9. Action Card (`apps/addin/src/components/preview/ActionCard.tsx`)
```typescript
// Individual tool call preview card
// Shows: tool name, affected range, cell count, warnings
// Approve/Reject buttons per action
// "View changes" to open diff
```

#### 10. Diff Dialog (`apps/addin/src/components/preview/DiffDialog.tsx`)
```typescript
// Dialog showing before/after cell values
// Table format: Cell | Current | New
// "overwrite" badge for non-empty cells
```

#### 11. Tool Call Display (`apps/addin/src/components/chat/ToolCallCard.tsx`)
```typescript
// Render tool calls in message bubbles
// Show: tool name, status badge, parameters summary
// Click to view in preview panel
```

#### 12. Preview Index (`apps/addin/src/components/preview/index.ts`)
```typescript
export { PreviewPanel } from './PreviewPanel';
export { ActionCard } from './ActionCard';
export { DiffDialog } from './DiffDialog';
```

### Files to Modify

#### 1. `apps/addin/src/App.tsx`
- Add PreviewPanel alongside ChatPane
- Layout: ControlPanel | ChatPane | PreviewPanel (when visible)

#### 2. `apps/addin/src/store/index.ts`
- Export `usePreviewStore`

#### 3. `apps/addin/src/store/chatStore.ts`
- Add action to update tool call status
- `updateToolCallStatus(messageId: string, toolCallId: string, status: ToolCallStatus)`

#### 4. `apps/addin/src/components/chat/MessageBubble.tsx`
- Render tool calls using ToolCallCard
- Show tool call section below message content

#### 5. `apps/addin/src/components/chat/ChatPane.tsx`
- After AI response with tool calls, generate previews
- Add previews to previewStore

#### 6. `packages/shared/src/types/chat.ts`
- Add 'approved' to ToolCallStatus if needed

### Implementation Steps

#### Step 1: Create Types and Store (Foundation)
1. Create `apps/addin/src/lib/tools/types.ts` with all interfaces
2. Create `apps/addin/src/store/previewStore.ts` with Zustand store
3. Update `apps/addin/src/store/index.ts` to export new store

#### Step 2: Implement Validation Layer
1. Create `apps/addin/src/lib/tools/validator.ts`
2. Reuse validation functions from `excel/validation.ts`
3. Add tool-call-specific wrapper functions

#### Step 3: Implement Preview Generator
1. Create `apps/addin/src/lib/tools/preview.ts`
2. Use `readRange()` to get current values for diff
3. Calculate cell changes and detect overwrites

#### Step 4: Implement Executor
1. Create `apps/addin/src/lib/tools/executor.ts`
2. Map tool names to writer functions
3. Execute sequentially with progress callback
4. Handle errors gracefully

#### Step 5: Implement Audit Logger
1. Create `apps/addin/src/lib/tools/audit.ts`
2. In-memory log array for now
3. Console.log for debugging

#### Step 6: Create Tool Index
1. Create `apps/addin/src/lib/tools/index.ts`
2. Export all tool utilities

#### Step 7: Build Preview UI Components
1. Create `ActionCard.tsx` - individual action card
2. Create `DiffDialog.tsx` - before/after comparison
3. Create `PreviewPanel.tsx` - main container
4. Create index export

#### Step 8: Build Tool Call Display
1. Create `ToolCallCard.tsx` for message bubbles
2. Show tool name, status, parameters

#### Step 9: Integrate with Chat
1. Update `MessageBubble.tsx` to render tool calls
2. Update `ChatPane.tsx` to generate previews after AI response
3. Connect to previewStore

#### Step 10: Update App Layout
1. Modify `App.tsx` to include PreviewPanel
2. Conditionally show when pendingActions.length > 0

#### Step 11: Wire Up Execution Flow
1. PreviewPanel "Execute All" triggers executor
2. Update tool call status in chatStore
3. Log to audit
4. Clear previews on success

### Code Snippets

#### Preview Store Pattern
```typescript
export const usePreviewStore = create<PreviewState>((set, get) => ({
  pendingActions: [],
  isExecuting: false,
  executionResults: [],

  addPendingAction: (preview) =>
    set((state) => ({
      pendingActions: [...state.pendingActions, preview],
    })),

  approveAction: (toolCallId) =>
    set((state) => ({
      pendingActions: state.pendingActions.map((p) =>
        p.toolCall.id === toolCallId
          ? { ...p, toolCall: { ...p.toolCall, status: 'approved' as const } }
          : p
      ),
    })),

  rejectAction: (toolCallId) =>
    set((state) => ({
      pendingActions: state.pendingActions.filter(
        (p) => p.toolCall.id !== toolCallId
      ),
    })),

  // ... other actions
}));
```

#### Preview Generation Pattern
```typescript
export async function generatePreview(toolCall: ToolCall): Promise<PreviewData> {
  const validation = validateToolCall(toolCall);
  const warnings = validation.errors.map((e) => e.message);

  switch (toolCall.name) {
    case 'write_range': {
      const params = toolCall.parameters as WriteRangeParams;
      const cellCount = params.values.length * (params.values[0]?.length || 0);

      let changes: CellChange[] = [];
      try {
        const currentValues = await readRange(params.address);
        changes = buildCellChanges(params.address, currentValues, params.values);
      } catch {
        // Range might not exist yet
        changes = buildCellChanges(params.address, [], params.values);
      }

      return {
        toolCall,
        affectedRange: params.address,
        cellCount,
        changes,
        warnings,
        requiresConfirmation: cellCount > SAFETY_LIMITS.CONFIRM_THRESHOLD_CELLS,
        validation,
      };
    }
    // ... other cases
  }
}
```

#### Executor Pattern
```typescript
export async function executeToolCall(toolCall: ToolCall): Promise<ExecutionResult> {
  const startTime = performance.now();

  // Validate again before execution
  const validation = validateToolCall(toolCall);
  if (!validation.valid) {
    return {
      success: false,
      toolCallId: toolCall.id,
      cellsAffected: 0,
      executionTimeMs: performance.now() - startTime,
      error: validation.errors.map((e) => e.message).join('; '),
    };
  }

  try {
    let result: WriteResult;

    switch (toolCall.name) {
      case 'write_range':
        const writeParams = toolCall.parameters as WriteRangeParams;
        result = await writeRange(writeParams.address, writeParams.values);
        break;
      // ... other cases
    }

    // Log to audit
    logToolExecution({
      timestamp: Date.now(),
      toolName: toolCall.name,
      parameters: toolCall.parameters,
      result: result.success ? 'success' : 'error',
      errorMessage: result.error,
      cellsAffected: result.cellCount,
      executionTimeMs: performance.now() - startTime,
    });

    return {
      success: result.success,
      toolCallId: toolCall.id,
      cellsAffected: result.cellCount,
      executionTimeMs: performance.now() - startTime,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      toolCallId: toolCall.id,
      cellsAffected: 0,
      executionTimeMs: performance.now() - startTime,
      error: error instanceof Error ? error.message : 'Execution failed',
    };
  }
}
```

#### Chat Integration Pattern
```typescript
// In ChatPane.tsx, after stream completes with tool calls:
const handleToolCalls = async (toolCalls: ToolCall[]) => {
  for (const toolCall of toolCalls) {
    const preview = await generatePreview(toolCall);
    usePreviewStore.getState().addPendingAction(preview);
  }
};
```

## Validation Gates

### Build
- [ ] `pnpm build` passes with no errors
- [ ] No TypeScript errors in new files

### Lint
- [ ] `pnpm lint` passes
- [ ] No eslint warnings in new code

### Type Safety
- [ ] All tool parameters properly typed
- [ ] No `any` types in implementation
- [ ] Shared types properly exported

### Manual Testing
- [ ] Preview panel appears when AI suggests tool calls
- [ ] Cell changes display correctly in diff view
- [ ] Confirmation dialog appears for >50 cells
- [ ] Execute All writes to Excel correctly
- [ ] Reject All clears pending actions
- [ ] Individual approve/reject works
- [ ] Invalid addresses show validation errors
- [ ] Unsafe formulas are blocked
- [ ] >500 cell operations are blocked
- [ ] Audit log captures all executions
- [ ] Tool call status updates in chat

### Safety Verification
- [ ] Cannot execute without preview
- [ ] Cannot bypass confirmation for large writes
- [ ] External links in formulas blocked
- [ ] WEBSERVICE/CALL functions blocked
- [ ] Sheet deletion not possible

## Safety Considerations

### Preview Requirements
- ALL write operations MUST show preview first
- User MUST explicitly approve before execution
- Cannot programmatically bypass preview

### Validation Rules
- Address: Valid A1 notation (`/^('?[^'[\]:*?/\\]+'?!)?[A-Za-z]{1,3}[0-9]{1,7}(:[A-Za-z]{1,3}[0-9]{1,7})?$/`)
- Cell Count: Max 500 cells per operation
- Formula: No external links, no dangerous functions
- Confirmation: Required for >50 cells

### Error Handling
- Validation errors prevent preview generation
- Execution errors logged and reported to user
- Failed execution does not corrupt data (Office.js transactions)
- Graceful degradation if Excel context unavailable

### Audit Trail
- Log all tool executions (success and failure)
- Store: timestamp, tool, params, result, cells affected, duration
- Local storage initially, backend persistence in future phase

## Confidence Score
**9/10** - High confidence

**Reasoning:**
- All foundational code exists (validation, writer, types)
- Clear patterns established in Phase 1-3
- Safety limits already defined
- ToolCall type already has status field
- Writer functions already return proper results
- Only UI components are truly new work

**Risks:**
- Fluent UI Table component complexity (mitigated: use simple table)
- Preview panel layout in taskpane width (mitigated: collapsible/dialog)

## Notes

### Decisions Made
1. **Local audit log first** - Backend persistence deferred to avoid Supabase setup complexity
2. **No undo/rollback** - Rely on Excel's native Ctrl+Z for now
3. **Sequential execution** - Simpler than parallel, matches user expectation
4. **Preview in side panel** - Not a modal, allows seeing chat context

### Future Enhancements (Not in Scope)
- Backend audit log persistence
- Undo stack beyond Excel native
- Batch operations optimization
- Real-time collaboration awareness

### Testing Data
Use these tool calls for manual testing:
```json
{
  "name": "write_range",
  "parameters": {
    "address": "A1:C3",
    "values": [["Name", "Sales", "Growth"], ["Widget A", 1000, "15%"], ["Widget B", 2500, "22%"]],
    "reason": "Adding sample sales data"
  }
}

{
  "name": "set_formula",
  "parameters": {
    "address": "D2",
    "formula": "=B2*C2",
    "reason": "Calculate projected growth"
  }
}

{
  "name": "highlight_cells",
  "parameters": {
    "address": "C2:C3",
    "color": "#90EE90",
    "reason": "Highlight positive growth"
  }
}
```
