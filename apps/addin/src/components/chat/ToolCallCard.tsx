/**
 * ToolCallCard component for displaying tool calls in chat messages.
 * Shows tool name, status, and a summary of parameters.
 */

import {
  makeStyles,
  tokens,
  Text,
  Badge,
  Tooltip,
} from '@fluentui/react-components';
import {
  Wrench24Regular,
  CheckmarkCircle24Regular,
  DismissCircle24Regular,
  Clock24Regular,
  Eye24Regular,
  Warning24Regular,
} from '@fluentui/react-icons';
import { isWriteTool } from '@cellix/shared';
import type { ToolCall, ToolCallStatus } from '@cellix/shared';
import { ToolResultDisplay } from './ToolResultDisplay';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusSmall,
    marginTop: tokens.spacingVerticalS,
  },
  icon: {
    flexShrink: 0,
    marginTop: '2px',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  toolName: {
    fontWeight: tokens.fontWeightSemibold,
    textTransform: 'capitalize',
  },
  params: {
    marginTop: tokens.spacingVerticalXS,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  paramItem: {
    display: 'inline',
  },
});

interface ToolCallCardProps {
  toolCall: ToolCall;
}

// Status to badge mapping
const statusConfig: Record<
  ToolCallStatus,
  { color: 'informative' | 'success' | 'warning' | 'danger' | 'important'; label: string; icon: React.ReactNode }
> = {
  pending: {
    color: 'informative',
    label: 'Pending',
    icon: <Clock24Regular />,
  },
  preview: {
    color: 'warning',
    label: 'Preview',
    icon: <Eye24Regular />,
  },
  executed: {
    color: 'success',
    label: 'Executed',
    icon: <CheckmarkCircle24Regular />,
  },
  cancelled: {
    color: 'important',
    label: 'Cancelled',
    icon: <DismissCircle24Regular />,
  },
  error: {
    color: 'danger',
    label: 'Error',
    icon: <Warning24Regular />,
  },
};

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const styles = useStyles();

  const { name, parameters, status, error, result } = toolCall;
  const config = statusConfig[status];

  // Format tool name for display
  const formatToolName = (toolName: string) => {
    return toolName.replace(/_/g, ' ');
  };

  // Get parameter summary
  const getParamSummary = (): string => {
    const params = parameters as Record<string, unknown>;
    const parts: string[] = [];

    if (params.address) {
      parts.push(`${params.address}`);
    }

    if (params.formula && typeof params.formula === 'string') {
      const formula = params.formula.length > 30
        ? params.formula.substring(0, 30) + '...'
        : params.formula;
      parts.push(`formula: ${formula}`);
    }

    if (params.values && Array.isArray(params.values)) {
      const values = params.values as unknown[][];
      const rows = values.length;
      const cols = values[0]?.length || 0;
      parts.push(`${rows}x${cols} values`);
    }

    if (params.name) {
      parts.push(`name: ${params.name}`);
    }

    if (params.color) {
      parts.push(`color: ${params.color}`);
    }

    // Read tool parameters
    if (params.columns && Array.isArray(params.columns)) {
      parts.push(`columns: ${(params.columns as string[]).join(', ')}`);
    }

    if (params.groupBy && Array.isArray(params.groupBy)) {
      parts.push(`group by: ${(params.groupBy as string[]).join(', ')}`);
    }

    if (params.column && typeof params.column === 'string' && !params.columns) {
      parts.push(`column: ${params.column}`);
    }

    if (params.query && typeof params.query === 'string') {
      parts.push(`query: "${params.query}"`);
    }

    if (params.sheet && typeof params.sheet === 'string') {
      parts.push(`sheet: ${params.sheet}`);
    }

    if (params.method && typeof params.method === 'string') {
      parts.push(`method: ${params.method}`);
    }

    return parts.join(' | ') || 'No parameters';
  };

  return (
    <div className={styles.container}>
      <Wrench24Regular className={styles.icon} />
      <div className={styles.content}>
        <div className={styles.header}>
          <Text className={styles.toolName}>{formatToolName(name)}</Text>
          <Tooltip content={error || config.label} relationship="label">
            <Badge
              appearance="filled"
              color={config.color}
              size="small"
            >
              {config.label}
            </Badge>
          </Tooltip>
        </div>
        <Text className={styles.params}>{getParamSummary()}</Text>
        {error && (
          <Text
            size={200}
            style={{ color: tokens.colorPaletteRedForeground1, marginTop: tokens.spacingVerticalXS, display: 'block' }}
          >
            {error}
          </Text>
        )}
        {status === 'executed' && result != null && !isWriteTool(name) && (
          <ToolResultDisplay toolName={name} result={result} />
        )}
      </div>
    </div>
  );
}
