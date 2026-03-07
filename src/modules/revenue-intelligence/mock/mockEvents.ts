import { EventRow, EventType, EventImpact } from '../types';

export const generateMockEvents = (propertyId: string): EventRow[] => {
  const events: EventRow[] = [];
  const now = new Date();
  
  const eventTemplates: { name: string; type: EventType; impact: EventImpact; month: number; day: number; duration: number }[] = [
    { name: 'Feria de Abril', type: 'FAIR', impact: 'HIGH', month: 3, day: 15, duration: 7 },
    { name: 'Semana Santa', type: 'HOLIDAY', impact: 'HIGH', month: 2, day: 28, duration: 5 },
    { name: 'Puente de Mayo', type: 'BRIDGE', impact: 'MEDIUM', month: 4, day: 1, duration: 3 },
    { name: 'Temporada de Verano', type: 'HIGH_SEASON', impact: 'HIGH', month: 6, day: 1, duration: 60 },
    { name: 'Navidad', type: 'HOLIDAY', impact: 'HIGH', month: 11, day: 24, duration: 10 },
    { name: 'Congreso Médico', type: 'FAIR', impact: 'MEDIUM', month: 9, day: 10, duration: 3 },
    { name: 'Black Friday', type: 'OTHER', impact: 'MEDIUM', month: 10, day: 25, duration: 3 },
    { name: 'Temporada Baja', type: 'LOW_SEASON', impact: 'LOW', month: 0, day: 15, duration: 30 },
  ];

  const currentYear = now.getFullYear();

  eventTemplates.forEach((template, idx) => {
    const startDate = new Date(currentYear, template.month, template.day);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + template.duration);

    events.push({
      id: `EVT-${idx}-${propertyId}`,
      propertyId,
      name: template.name,
      type: template.type,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      impact: template.impact,
      note: `Evento generado para ${template.name}`
    });
  });

  return events;
};
