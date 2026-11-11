import React from 'react';
import {createRoot} from 'react-dom/client';
import ErrorBoundary from './error-boundary';
import AccountShell from './account-shell';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<ErrorBoundary><AccountShell/></ErrorBoundary>);
