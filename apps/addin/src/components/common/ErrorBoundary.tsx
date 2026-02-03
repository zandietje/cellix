import { Component, ErrorInfo, ReactNode } from 'react';
import { Text, Button, tokens } from '@fluentui/react-components';
import { ErrorCircle24Regular } from '@fluentui/react-icons';

const errorFallbackStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '24px',
    textAlign: 'center' as const,
    gap: '12px',
  },
  icon: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: '48px',
  },
};

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error for debugging
    console.error('ErrorBoundary caught:', error, errorInfo);
    // TODO: Report to Sentry in Phase 12
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <ErrorFallback onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

interface ErrorFallbackProps {
  onRetry: () => void;
}

function ErrorFallback({ onRetry }: ErrorFallbackProps) {
  return (
    <div style={errorFallbackStyles.container}>
      <ErrorCircle24Regular style={errorFallbackStyles.icon} />
      <Text size={500} weight="semibold">
        Something went wrong
      </Text>
      <Text size={300}>Please try again or refresh the add-in</Text>
      <Button appearance="primary" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}
