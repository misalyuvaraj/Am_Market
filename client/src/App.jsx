import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LangProvider } from "./i18n";
import Layout from "./Layout";
import Dashboard from "./pages/Dashboard";
import Markets from "./pages/Markets";
import OptionChain from "./pages/OptionChain";
import StrategyBuilder from "./pages/StrategyBuilder";
import { EasyOptions, Wizard } from "./pages/Wizard";
import { Heatmap, OILab, Screener } from "./pages/Labs";
import { BtcLab, Copilot, Fiidii, News, Technicals } from "./pages/More";
import Forex from "./pages/Forex";
import LiveAction from "./pages/LiveAction";
import MlLab from "./pages/MlLab";

export default function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/live" element={<LiveAction />} />
            <Route path="/live/:symbol" element={<LiveAction />} />
            <Route path="/markets" element={<Markets />} />
            <Route path="/option-chain" element={<OptionChain />} />
            <Route path="/builder" element={<StrategyBuilder />} />
            <Route path="/wizard" element={<Wizard />} />
            <Route path="/easy" element={<EasyOptions />} />
            <Route path="/oi" element={<OILab />} />
            <Route path="/heatmap" element={<Heatmap />} />
            <Route path="/screener" element={<Screener />} />
            <Route path="/technicals" element={<Technicals />} />
            <Route path="/fiidii" element={<Fiidii />} />
            <Route path="/news" element={<News />} />
            <Route path="/btc" element={<BtcLab />} />
            <Route path="/forex" element={<Forex />} />
            <Route path="/ml" element={<MlLab />} />
            <Route path="/copilot" element={<Copilot />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LangProvider>
  );
}
