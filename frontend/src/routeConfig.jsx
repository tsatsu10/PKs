/**
 * Route configuration and loading fallback for the app.
 */
import { lazy } from 'react';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingScreen from './components/LoadingScreen';

export const PageLoadFallback = LoadingScreen;

const withErrorBoundary = (children) => <ErrorBoundary>{children}</ErrorBoundary>;

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

const protectedLayout = withErrorBoundary(
  <ProtectedRoute>
    <AppShell />
  </ProtectedRoute>
);

/**
 * Public routes: path + element.
 */
/* eslint-disable-next-line react-refresh/only-export-components */
export const publicRoutes = [
  { path: '/login', element: withErrorBoundary(<Login />) },
  { path: '/register', element: withErrorBoundary(<Register />) },
  { path: '/forgot-password', element: withErrorBoundary(<ForgotPassword />) },
  { path: '/reset-password', element: withErrorBoundary(<ResetPassword />) },
];

/**
 * Authenticated child routes under a single AppShell (no remount on navigation).
 */
/* eslint-disable-next-line react-refresh/only-export-components */
export const protectedChildRoutes = [
  { path: '/', element: withErrorBoundary(<Dashboard />) },
  { path: '/objects/new', element: withErrorBoundary(<ObjectNew />) },
  { path: '/objects/by-slug/:slug', element: withErrorBoundary(<ObjectBySlug />) },
  { path: '/quick', element: withErrorBoundary(<QuickCapture />) },
  { path: '/objects/:id', element: withErrorBoundary(<ObjectDetail />) },
  { path: '/settings', element: withErrorBoundary(<Settings />) },
  { path: '/prompts', element: withErrorBoundary(<PromptBank />) },
  { path: '/templates', element: withErrorBoundary(<Templates />) },
  { path: '/notifications', element: withErrorBoundary(<Notifications />) },
  { path: '/audit-logs', element: withErrorBoundary(<AuditLogs />) },
  { path: '/integrations', element: withErrorBoundary(<Integrations />) },
  { path: '/paste', element: withErrorBoundary(<PasteBin />) },
  { path: '/journal', element: withErrorBoundary(<Journal />) },
  { path: '/about', element: withErrorBoundary(<About />) },
  { path: '/search', element: withErrorBoundary(<Search />) },
  { path: '/trash', element: withErrorBoundary(<Trash />) },
  { path: '/import', element: withErrorBoundary(<Import />) },
];

/** Layout route element wrapping all protectedChildRoutes. */
/* eslint-disable-next-line react-refresh/only-export-components */
export const protectedLayoutRoute = { element: protectedLayout, children: protectedChildRoutes };

/** @deprecated Use publicRoutes + protectedLayoutRoute — kept for tests importing routeConfig */
/* eslint-disable-next-line react-refresh/only-export-components */
export const routeConfig = [
  ...publicRoutes,
  ...protectedChildRoutes.map(({ path }) => ({ path, element: protectedLayout })),
];
