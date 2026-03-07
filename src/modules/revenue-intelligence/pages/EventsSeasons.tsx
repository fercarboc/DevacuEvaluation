import React, { useState } from 'react';
import { useRevenue } from '../context/RevenueContext';
import { CalendarDays, Plus, Trash2, AlertTriangle, Info, Calendar as CalendarIcon } from 'lucide-react';
import { EventType, EventImpact } from '../types';

const EventsSeasons: React.FC = () => {
  const { events, addEvent, deleteEvent, properties, activePropertyId } = useRevenue();
  const [showForm, setShowForm] = useState(false);
  const activeProperty = properties.find(p => p.id === activePropertyId);

  const [formData, setFormData] = useState({
    name: '',
    type: 'FAIR' as EventType,
    startDate: '',
    endDate: '',
    impact: 'MEDIUM' as EventImpact,
    note: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addEvent(formData);
    setFormData({
      name: '',
      type: 'FAIR',
      startDate: '',
      endDate: '',
      impact: 'MEDIUM',
      note: ''
    });
    setShowForm(false);
  };

  const getImpactColor = (impact: EventImpact) => {
    switch (impact) {
      case 'HIGH': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'MEDIUM': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'LOW': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Eventos y Temporadas</h1>
          <p className="text-gray-500">Gestión de fechas relevantes para {activeProperty?.name}</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
        >
          <Plus size={20} />
          Añadir Evento
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-blue-100 animate-in fade-in slide-in-from-top-4">
          <h2 className="text-xl font-bold mb-6">Nuevo Evento / Temporada</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">Nombre del Evento</label>
              <input 
                type="text" 
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Ej: Feria de Abril, Puente de Mayo..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Tipo</label>
              <select 
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value as EventType})}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none bg-white"
              >
                <option value="FAIR">Feria</option>
                <option value="BRIDGE">Puente</option>
                <option value="HIGH_SEASON">Temporada Alta</option>
                <option value="LOW_SEASON">Temporada Baja</option>
                <option value="HOLIDAY">Festivo</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Fecha Inicio</label>
              <input 
                type="date" 
                required
                value={formData.startDate}
                onChange={e => setFormData({...formData, startDate: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Fecha Fin</label>
              <input 
                type="date" 
                required
                value={formData.endDate}
                onChange={e => setFormData({...formData, endDate: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Impacto</label>
              <select 
                value={formData.impact}
                onChange={e => setFormData({...formData, impact: e.target.value as EventImpact})}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none bg-white"
              >
                <option value="HIGH">Alto</option>
                <option value="MEDIUM">Medio</option>
                <option value="LOW">Bajo</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-bold text-gray-700 mb-2">Notas (Opcional)</label>
              <textarea 
                value={formData.note}
                onChange={e => setFormData({...formData, note: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all h-24"
              />
            </div>
            <div className="md:col-span-3 flex justify-end gap-4">
              <button 
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-2xl transition-all"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-8 py-3 bg-gray-900 text-white rounded-2xl font-bold hover:bg-gray-800 transition-all"
              >
                Guardar Evento
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-8 py-5">Evento / Temporada</th>
                <th className="px-6 py-5">Tipo</th>
                <th className="px-6 py-5">Desde</th>
                <th className="px-6 py-5">Hasta</th>
                <th className="px-6 py-5">Impacto</th>
                <th className="px-8 py-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-center text-gray-400">
                    <CalendarDays size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="font-bold">No hay eventos configurados para esta propiedad</p>
                  </td>
                </tr>
              ) : (
                events.sort((a, b) => a.startDate.localeCompare(b.startDate)).map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-50 p-2 rounded-xl text-blue-600">
                          <CalendarIcon size={18} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{event.name}</p>
                          {event.note && <p className="text-xs text-gray-400">{event.note}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="px-3 py-1 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-600 uppercase tracking-wider">
                        {event.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-5 font-medium text-gray-600">{event.startDate}</td>
                    <td className="px-6 py-5 font-medium text-gray-600">{event.endDate}</td>
                    <td className="px-6 py-5">
                      <span className={`px-3 py-1 rounded-lg text-[10px] font-bold border ${getImpactColor(event.impact)}`}>
                        {event.impact}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button 
                        onClick={() => deleteEvent(event.id)}
                        className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl flex items-start gap-4">
        <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
          <AlertTriangle size={20} />
        </div>
        <div>
          <h4 className="font-bold text-amber-900 mb-1">Importante</h4>
          <p className="text-sm text-amber-800 leading-relaxed">
            Los eventos y temporadas configurados aquí se mostrarán automáticamente en las tablas de 
            <span className="font-bold"> Pickup Avanzado</span> y <span className="font-bold">Día x Día</span> 
            para ayudarte a contextualizar los cambios en la demanda y el ritmo de ventas.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EventsSeasons;