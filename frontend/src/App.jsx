import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import { publicRoutes, protectedLayoutRoute, PageLoadFallback } from './routeConfig';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
        <ToastProvider>
        <BrowserRouter>
          <a href="#main-content" className="skip-link">Skip to main content</a>
          <Suspense fallback={<PageLoadFallback />}>
            <Routes>
              {publicRoutes.map(({ path, element }) => (
                <Route key={path} path={path} element={element} />
              ))}
              <Route element={protectedLayoutRoute.element}>
                {protectedLayoutRoute.children.map(({ path, element }) => (
                  <Route key={path || 'index'} path={path || '/'} element={element} />
                ))}
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
