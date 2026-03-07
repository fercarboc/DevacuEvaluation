 import React, { useState, useMemo } from 'react';
import { mockProperties } from '../mock/mockProperties';
import { getMockPickup } from '../mock/mockPickup';
import PropertySelector from '../components/PropertySelector';
import PickupTable from '../components/PickupTable';
import { Calendar, History } from 'lucide-react';

const PickupAnalysis: React.FC = () => {
  const [selectedPropertyId, setSelectedPropertyId] = useState(mockProperties[0].id);
  const [daysAgo, setDaysAgo] = useState(30);

  const pickupData = useMemo(() => {
    return getMockPickup(selectedPropertyId, daysAgo);
  }, [selectedPropertyId, daysAgo]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pickup Analysis</h1>
          <p className="text-gray-500">Comparativa de ritmo de ventas vs histórico</p>
        </div>
        <PropertySelector 
          properties={mockProperties} 
          selectedId={selectedPropertyId} 
          onSelect={setSelectedPropertyId} 
        />
      </div>

      <div className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mr-4">
          <History size={18} />
          <span>Comparar con:</span>
        </div>
        <div className="flex gap-2">
          {[7, 15, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDaysAgo(d)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                daysAgo === d 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              Hace {d} días
            </button>
          ))}
          <button className="px-4 py-2 rounded-xl text-sm font-bold bg-gray-50 text-gray-600 hover:bg-gray-100 flex items-center gap-2">
            <Calendar size={16} />
            Año Anterior (LY)
          </button>
        </div>
      </div>

      <PickupTable data={pickupData} />
    </div>
  );
};

export default PickupAnalysis;