/**
 * Route configuration and loading fallback for the app.
 * Kept in a separate file so routes.jsx could be component-only; App imports from here.
 */
import { lazy } from 'react';
import ProtectedRoute from './components/ProtectedRoute';

export const PageLoadFallback = () => (
  <div className="loading-screen" role="status" aria-live="polite" aria-label="Loading">
    <div className="loading-screen-logo-wrap">
      <img src="/pks-logo.svg" alt="" className="loading-screen-logo" width="64" height="64" />
    </div>
    <p className="loading-screen-text">Loading…</p>
  </div>
);

const Dashboard = lazy(() => import('./pages/Dashboard'));
const ObjectNew = lazy(() => import('./pages/ObjectNew'));
const QuickCapture = lazy(() => import('./pages/QuickCapture'));
const ObjectDetail = lazy(() => import('./pages/ObjectDetail'));
const Settings = lazy(() => import('./pages/Settings'));
const PromptBank = lazy(() => import('./pages/PromptBank'));
const Templates = lazy(() => import('./pages/Templates'));
const Notifications = lazy(() => import('./pages/Notifications'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Integrations = lazy(() => import('./pages/Integrations'));
const PasteBin = lazy(() => import('./pages/PasteBin'));
const Journal = lazy(() => import('./pages/Journal'));
const About = lazy(() => import('./pages/About'));
const Search = lazy(() => import('./pages/Search'));
const Trash = lazy(() => import('./pages/Trash'));
const ObjectBySlug = lazy(() => import('./pages/ObjectBySlug'));
const Import = lazy(() => import('./pages/Import'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

const withProtected = (children) => <ProtectedRoute>{children}</ProtectedRoute>;

/**
 * Route configuration: path, element.
 * Heavy pages are lazy-loaded for smaller initial bundle.
 */
/* eslint-disable-next-line react-refresh/only-export-components -- route config is data used by App, not a component */
export const routeConfig = [
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/', element: withProtected(<Dashboard />) },
  { path: '/objects/new', element: withProtected(<ObjectNew />) },
  { path: '/objects/by-slug/:slug', element: withProtected(<ObjectBySlug />) },
  { path: '/quick', element: withProtected(<QuickCapture />) },
  { path: '/objects/:id', element: withProtected(<ObjectDetail />) },
  { path: '/settings', element: withProtected(<Settings />) },
  { path: '/prompts', element: withProtected(<PromptBank />) },
  { path: '/templates', element: withProtected(<Templates />) },
  { path: '/notifications', element: withProtected(<Notifications />) },
  { path: '/audit-logs', element: withProtected(<AuditLogs />) },
  { path: '/integrations', element: withProtected(<Integrations />) },
  { path: '/paste', element: withProtected(<PasteBin />) },
  { path: '/journal', element: withProtected(<Journal />) },
  { path: '/about', element: withProtected(<About />) },
  { path: '/search', element: withProtected(<Search />) },
  { path: '/trash', element: withProtected(<Trash />) },
  { path: '/import', element: withProtected(<Import />) },
];
