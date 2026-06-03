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
import './App.css';

export default function App() {
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
