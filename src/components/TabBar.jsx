import { useLocation, useNavigate } from 'react-router-dom';

const tabs = [
  { path: '/', label: '首页', icon: '📊' },
  { path: '/customers', label: '客户', icon: '👥' },
  { path: '/products', label: '产品', icon: '📦' },
  { path: '/quick-quote', label: '报价', icon: '💰' },
  { path: '/settings', label: '设置', icon: '⚙️' },
];

export default function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.path}
          className={`tab-item ${isActive(tab.path) ? 'active' : ''}`}
          onClick={() => navigate(tab.path)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
