import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import RevenueLayout from './RevenueLayout';
import RevenueDashboard from './pages/RevenueDashboard';
import PickupAnalysis from './pages/PickupAnalysis';
import PickupAdvanced from './pages/PickupAdvanced';
import DayByDay from './pages/DayByDay';
import MonthlyComparison from './pages/MonthlyComparison';
import SettingsProperties from './pages/SettingsProperties';
import ImportData from './pages/ImportData';
import Reports from './pages/Reports';
import EventsSeasons from './pages/EventsSeasons';
import ChannelsSegments from './pages/ChannelsSegments';
import LoginPage from './pages/LoginPage';
import AccountPage from './pages/AccountPage';
import RequireAuth from './components/RequireAuth';

const RevenueRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<LoginPage />} />

      {/* Private Routes */}
      <Route 
        path="/revenue" 
        element={
          <RequireAuth>
            <RevenueLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<RevenueDashboard />} />
        <Route path="pickup" element={<PickupAnalysis />} />
        <Route path="pickup-advanced" element={<PickupAdvanced />} />
        <Route path="daily" element={<DayByDay />} />
        <Route path="monthly" element={<MonthlyComparison />} />
        <Route path="channels" element={<ChannelsSegments />} />
        <Route path="import" element={<ImportData />} />
        <Route path="reports" element={<Reports />} />
        <Route path="events" element={<EventsSeasons />} />
        <Route path="settings-properties" element={<SettingsProperties />} />
      </Route>

      <Route 
        path="/account" 
        element={
          <RequireAuth>
            <RevenueLayout />
          </RequireAuth>
        }
      >
        <Route index element={<AccountPage />} />
      </Route>

      {/* Redirect from root to the revenue dashboard */}
      <Route path="/" element={<Navigate to="/revenue/dashboard" replace />} />
    </Routes>
  );
};

export default RevenueRoutes;