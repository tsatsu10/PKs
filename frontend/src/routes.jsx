import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import ObjectNew from './pages/ObjectNew';
import QuickCapture from './pages/QuickCapture';
import ObjectDetail from './pages/ObjectDetail';
import Settings from './pages/Settings';
import PromptBank from './pages/PromptBank';
import Templates from './pages/Templates';
import Notifications from './pages/Notifications';
import AuditLogs from './pages/AuditLogs';
import Integrations from './pages/Integrations';
import PasteBin from './pages/PasteBin';
import Journal from './pages/Journal';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

const withProtected = (children) => <ProtectedRoute>{children}</ProtectedRoute>;

/**
 * Route configuration: path, element.
 * Centralizing routes here keeps App.jsx minimal and makes adding/removing routes easier.
 */
export const routeConfig = [
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/', element: withProtected(<Dashboard />) },
  { path: '/objects/new', element: withProtected(<ObjectNew />) },
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
];
