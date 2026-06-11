import { useEffect, useRef } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Products from './pages/Products';
import ProductChat from './pages/ProductChat';
import RequirementChat from './pages/RequirementChat';
import ConversationList from './pages/ConversationList';
import Settings from './pages/Settings';
import { getSyncConfig, isAutoSyncEnabled, syncAll } from './utils/sync';
import './App.css';

const AUTO_SYNC_MS = 5 * 60 * 1000; // 5 分钟

export default function App() {
  const syncingRef = useRef(false);

  // ── 自动同步 ──
  useEffect(() => {
    const runSync = async () => {
      const cfg = getSyncConfig();
      if (!cfg.enabled || !isAutoSyncEnabled()) return;
      if (syncingRef.current) return; // 上一次还没结束，跳过
      syncingRef.current = true;
      try {
        await syncAll();
        console.log('[auto-sync] 同步完成', new Date().toLocaleTimeString('zh-CN'));
      } catch (e) {
        console.warn('[auto-sync] 同步失败:', e.message);
      } finally {
        syncingRef.current = false;
      }
    };

    // 首次立即同步
    runSync();

    // 之后每 5 分钟同步
    const id = setInterval(runSync, AUTO_SYNC_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id/chat" element={<ProductChat />} />
          <Route path="/assistant" element={<ConversationList />} />
          <Route path="/assistant/:id" element={<RequirementChat />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
