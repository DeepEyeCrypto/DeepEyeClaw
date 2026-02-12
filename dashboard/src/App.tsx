import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { CachePage } from "./pages/CachePage";
import { ProvidersPage } from "./pages/ProvidersPage";
import { ConfigPage } from "./pages/ConfigPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="cache" element={<CachePage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="config" element={<ConfigPage />} />
      </Route>
    </Routes>
  );
}
