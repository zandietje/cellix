import React from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

// Only render after Office.js is ready — guarantees Office API is available
Office.onReady(() => {
  const container = document.getElementById('root');
  if (!container) throw new Error('Root element not found');

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <FluentProvider theme={webLightTheme} style={{ height: '100%' }}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </FluentProvider>
    </React.StrictMode>
  );
});
