import React from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

let isOfficeInitialized = false;

const render = () => {
  const container = document.getElementById('root');
  if (!container) throw new Error('Root element not found');

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <FluentProvider theme={webLightTheme} style={{ height: '100%' }}>
        <ErrorBoundary>
          <App isOfficeInitialized={isOfficeInitialized} />
        </ErrorBoundary>
      </FluentProvider>
    </React.StrictMode>
  );
};

// Wait for Office.js to initialize
Office.onReady((info) => {
  if (info.host === Office.HostType.Excel) {
    isOfficeInitialized = true;
  }
  render();
});
