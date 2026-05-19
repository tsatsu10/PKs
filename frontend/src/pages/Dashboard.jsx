import DashboardView from '../features/dashboard/components/DashboardView';
import { useDashboardPage } from '../features/dashboard/hooks/useDashboardPage';
import './Dashboard.css';

/** Dashboard route — thin orchestrator. */
export default function Dashboard() {
  const page = useDashboardPage();
  return <DashboardView {...page} />;
}
