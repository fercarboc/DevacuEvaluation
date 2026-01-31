
import React from 'react';
import { PlanTier, TabId, TabConfig, KPI, HistoryEntry } from './auditor';
import { 
  LayoutDashboard, 
  ShieldAlert, 
  BarChart3, 
  History, 
  Download, 
  Settings 
} from 'lucide-react';

export const TABS: (TabConfig & { icon: React.ReactNode })[] = [
  { id: TabId.RESUMEN, label: 'Resumen', minTier: PlanTier.FREE, icon: <LayoutDashboard size={18} /> },
  { id: TabId.RIESGO, label: 'Auditoría de riesgo', minTier: PlanTier.BASIC, icon: <ShieldAlert size={18} /> },
  { id: TabId.ESTADISTICAS, label: 'Estadísticas operativas', minTier: PlanTier.MEDIUM, icon: <BarChart3 size={18} /> },
  { id: TabId.HISTORICO, label: 'Histórico de consultas', minTier: PlanTier.MEDIUM, icon: <History size={18} /> },
  { id: TabId.EXPORTACIONES, label: 'Exportaciones', minTier: PlanTier.MEDIUM, icon: <Download size={18} /> },
  { id: TabId.CONFIGURACION, label: 'Configuración / Avisos', minTier: PlanTier.FREE, icon: <Settings size={18} /> },
];

export const MOCK_KPIS: KPI[] = [
  { label: 'Consultas totales (mes)', value: 1248, variation: 12.5, type: 'total' },
  { label: '% Riesgo Bajo', value: '72%', variation: 5.2, type: 'risk-low' },
  { label: '% Riesgo Medio', value: '18%', variation: -2.1, type: 'risk-medium' },
  { label: '% Riesgo Alto', value: '10%', variation: 0.8, type: 'risk-high' },
];

export const MOCK_HISTORY: HistoryEntry[] = [
  { id: '1', date: '2024-05-15 14:22', type: 'Check-in Audit', risk: 'Bajo', userRole: 'Front Office Manager' },
  { id: '2', date: '2024-05-15 11:05', type: 'Behavioral Analysis', risk: 'Alto', userRole: 'Security Supervisor' },
  { id: '3', date: '2024-05-14 18:30', type: 'Payment Risk', risk: 'Medio', userRole: 'Receptionist' },
  { id: '4', date: '2024-05-14 09:12', type: 'Identification Audit', risk: 'Bajo', userRole: 'Night Auditor' },
  { id: '5', date: '2024-05-13 16:45', type: 'Behavioral Analysis', risk: 'Bajo', userRole: 'Front Office Manager' },
];

export const RISK_DISTRIBUTION_DATA = [
  { name: 'Bajo', value: 72, color: '#22c55e' },
  { name: 'Medio', value: 18, color: '#f59e0b' },
  { name: 'Alto', value: 10, color: '#ef4444' },
];

export const STATS_DAILY_DATA = [
  { date: '05-01', count: 42, highRisk: 4 },
  { date: '05-02', count: 55, highRisk: 6 },
  { date: '05-03', count: 48, highRisk: 3 },
  { date: '05-04', count: 70, highRisk: 12 },
  { date: '05-05', count: 62, highRisk: 8 },
  { date: '05-06', count: 35, highRisk: 2 },
  { date: '05-07', count: 50, highRisk: 5 },
];
