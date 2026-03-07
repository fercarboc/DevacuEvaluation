import { Plan } from '../types';

export const mockPlans: Plan[] = [
  { id: 'Básico', maxProperties: 1 },
  { id: 'Medium', maxProperties: 3 },
  { id: 'Premium', maxProperties: 10 },
  { id: 'Grandes Cadenas', maxProperties: Infinity },
];

export const CURRENT_PLAN_ID: string = 'Premium';
