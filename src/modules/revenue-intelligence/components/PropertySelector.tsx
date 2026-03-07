import React from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import { Property } from '../types';

interface PropertySelectorProps {
  properties: Property[];
  selectedId: string;
  onSelect: (id: string) => void;
}

const PropertySelector: React.FC<PropertySelectorProps> = ({ properties, selectedId, onSelect }) => {
  const selected = properties.find(p => p.id === selectedId) || properties[0];

  return (
    <div className="relative inline-block text-left">
      <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors">
        <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
          <Building2 size={20} />
        </div>
        <select
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          className="appearance-none bg-transparent pr-8 font-semibold text-gray-800 focus:outline-none cursor-pointer"
        >
          {properties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="absolute right-4 pointer-events-none text-gray-400">
          <ChevronDown size={16} />
        </div>
      </div>
    </div>
  );
};

export default PropertySelector;