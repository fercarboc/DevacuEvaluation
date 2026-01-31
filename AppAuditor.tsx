
import React, { useState } from 'react';
import { PlanTier, TabId } from './auditor';
import { TABS } from './constantsAuditor';
import LayoutAuditor from './components/LayoutAuditor';
import SummaryViewAuditor from './views/SummaryViewAuditor';
import RiskAuditViewAuditor from './views/RiskAuditViewAuditor';
import StatsViewAuditor from './views/StatsViewAuditor';
import HistoryViewAuditor from './views/HistoryViewAuditor';
import ExportsViewAuditor from './views/ExportsViewAuditor';
import ConfigViewAuditor from './views/ConfigViewAuditor';

const App: React.FC = () => {
  const [currentPlan, setCurrentPlan] = useState<PlanTier>(PlanTier.MEDIUM);
  const [activeTab, setActiveTab] = useState<TabId>(TabId.RESUMEN);

  const tierWeight = {
    [PlanTier.FREE]: 0,
    [PlanTier.BASIC]: 1,
    [PlanTier.MEDIUM]: 2,
    [PlanTier.PREMIUM]: 3,
  };

  const isTabAccessible = (tabMinTier: PlanTier) => {
    return tierWeight[currentPlan] >= tierWeight[tabMinTier];
  };

  const renderContent = () => {
    switch (activeTab) {
      case TabId.RESUMEN:
        return <SummaryViewAuditor currentPlan={currentPlan} />;
      case TabId.RIESGO:
        return <RiskAuditViewAuditor currentPlan={currentPlan} />;
      case TabId.ESTADISTICAS:
        return <StatsViewAuditor currentPlan={currentPlan} />;
      case TabId.HISTORICO:
        return <HistoryViewAuditor currentPlan={currentPlan} />;
      case TabId.EXPORTACIONES:
        return <ExportsViewAuditor currentPlan={currentPlan} />;
      case TabId.CONFIGURACION:
        return <ConfigViewAuditor currentPlan={currentPlan} />;
      default:
        return <SummaryViewAuditor currentPlan={currentPlan} />;
    }
  };

  return (
    <LayoutAuditor
      currentPlan={currentPlan}
      onPlanChange={setCurrentPlan}
      activeTab={activeTab}
      onTabChange={(tabId) => {
        const tab = TABS.find(t => t.id === tabId);
        if (tab && isTabAccessible(tab.minTier)) {
          setActiveTab(tabId);
        }
      }}
      isTabAccessible={isTabAccessible}
    >
      <div className="animate-in fade-in duration-500">
        {renderContent()}
      </div>
    </LayoutAuditor>
  );
};

export default App;
