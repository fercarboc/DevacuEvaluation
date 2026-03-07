import React from 'react';
import { PlanType } from '../types';
import { ShieldCheck, ShieldAlert, Zap, Globe } from 'lucide-react';

interface PlanBadgeProps {
  plan: PlanType;
}

const PlanBadge: React.FC<PlanBadgeProps> = ({ plan }) => {
  const getPlanStyles = () => {
    switch (plan) {
      case 'Básico':
        return {
          bg: 'bg-slate-100',
          text: 'text-slate-700',
          icon: ShieldAlert,
          label: 'Plan Básico'
        };
      case 'Medium':
        return {
          bg: 'bg-blue-100',
          text: 'text-blue-700',
          icon: Zap,
          label: 'Plan Medium'
        };
      case 'Premium':
        return {
          bg: 'bg-indigo-100',
          text: 'text-indigo-700',
          icon: ShieldCheck,
          label: 'Plan Premium'
        };
      case 'Grandes Cadenas':
        return {
          bg: 'bg-amber-100',
          text: 'text-amber-700',
          icon: Globe,
          label: 'Enterprise'
        };
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-700',
          icon: ShieldAlert,
          label: plan
        };
    }
  };

  const styles = getPlanStyles();
  const Icon = styles.icon;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${styles.bg} ${styles.text} text-xs font-bold uppercase tracking-wider`}>
      <Icon size={14} />
      <span>{styles.label}</span>
    </div>
  );
};

export default PlanBadge;