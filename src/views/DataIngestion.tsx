
import React, { useState } from 'react';
import { 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Database,
  Layers,
  ShieldCheck,
  Rocket,
  Settings2,
  Table,
  Zap,
  RefreshCw,
  Search
} from 'lucide-react';
import { OnboardingStep, IngestionStatus } from '@/types/riesgo';

const DataIngestion: React.FC = () => {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [isProcessing, setIsProcessing] = useState(false);

  const internalFields = [
    { key: 'check_in_date', label: 'Fecha de Entrada', required: true },
    { key: 'check_out_date', label: 'Fecha de Salida', required: true },
    { key: 'booking_channel', label: 'Canal de Reserva', required: true },
    { key: 'adr', label: 'ADR (Precio/Noche)', required: true },
    { key: 'total_amount', label: 'Importe Total', required: true },
    { key: 'customer_hash', label: 'ID Cliente / Email', required: false },
    { key: 'room_type', label: 'Tipo de Habitación', required: false },
  ];

  const detectedChannels = ['BKG_ESP', 'EXP_DIRECT', 'WEB_OFFICIAL', 'B2B_TUI', 'WALK_IN'];

  const handleNext = () => setStep(s => (s + 1) as OnboardingStep);
  const handleBack = () => setStep(s => (s - 1) as OnboardingStep);

  const renderProgress = () => (
    <div className="flex items-center justify-center mb-12 gap-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
            step === i ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 
            step > i ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-200 text-gray-400'
          }`}>
            {step > i ? <CheckCircle2 className="w-4 h-4" /> : i}
          </div>
          {i < 6 && <div className={`w-8 h-0.5 ${step > i ? 'bg-green-500' : 'bg-gray-200'}`} />}
        </div>
      ))}
    </div>
  );

  // STEP 1: UPLOAD
  const StepUpload = () => (
    <div className="max-w-2xl mx-auto text-center space-y-8 animate-in fade-in">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Inicia tu Inteligencia de Riesgo</h2>
        <p className="text-gray-500 mt-2 text-lg">Sube tu histórico de reservas para detectar fugas de EBITDA.</p>
      </div>
      <div className="border-4 border-dashed border-blue-50 bg-blue-50/20 rounded-3xl p-16 flex flex-col items-center group hover:bg-blue-50/50 transition-all cursor-pointer" onClick={handleNext}>
        <div className="w-20 h-20 bg-blue-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-blue-200 group-hover:scale-110 transition-transform">
          <Upload className="w-10 h-10" />
        </div>
        <p className="text-blue-900 font-bold text-xl">Arrastra tu CSV de PMS aquí</p>
        <p className="text-blue-600/60 text-sm mt-2 font-medium">Soportamos Opera, Cloudbeds, Mews y personalizados.</p>
      </div>
    </div>
  );

  // STEP 2: FIELD MAPPING
  const StepMapping = () => (
    <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><Table className="w-5 h-5 text-blue-600" /> Mapeo de Columnas CSV</h3>
          <span className="text-xs font-bold text-gray-400 uppercase">Debacu Field Mapping Engine</span>
        </div>
        <div className="p-6 space-y-4">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                <th className="pb-4">Campo del Sistema</th>
                <th className="pb-4">Columna en tu CSV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {internalFields.map(f => (
                <tr key={f.key} className="group">
                  <td className="py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-700">{f.label}</span>
                      {f.required && <span className="text-[10px] text-red-500 font-bold uppercase">Requerido</span>}
                    </div>
                  </td>
                  <td className="py-4">
                    <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-600 outline-none hover:border-blue-400 transition-colors">
                      <option>Seleccionar columna...</option>
                      <option selected>{f.label.replace(' ', '_').toUpperCase()}</option>
                      <option>CSV_COL_01</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-between items-center">
        <button onClick={handleBack} className="flex items-center gap-2 font-bold text-gray-400 hover:text-gray-900 transition-colors"><ChevronLeft className="w-4 h-4" /> Atrás</button>
        <button onClick={handleNext} className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-blue-100 flex items-center gap-2 hover:bg-blue-700 transition-all">Siguiente: Canales <ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );

  // STEP 3: CHANNEL NORMALIZATION
  const StepChannels = () => (
    <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><Layers className="w-5 h-5 text-blue-600" /> Normalización de Canales</h3>
          <p className="text-xs text-gray-500 mt-1">Hemos detectado {detectedChannels.length} canales en tu archivo. Mapealos a los nombres estándar.</p>
        </div>
        <div className="p-0 overflow-hidden">
          {detectedChannels.map((raw, i) => (
            <div key={raw} className={`p-4 flex items-center justify-between border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
              <div className="flex items-center gap-3">
                <div className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs font-mono font-bold">{raw}</div>
                <ArrowRight className="w-4 h-4 text-gray-300" />
              </div>
              <select className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold text-blue-600 focus:ring-2 focus:ring-blue-600 outline-none min-w-[240px]">
                <option>Mapear a...</option>
                <option selected={raw.includes('BKG')}>Booking.com</option>
                <option selected={raw.includes('EXP')}>Expedia</option>
                <option selected={raw.includes('WEB')}>Web Directa</option>
                <option selected={raw.includes('B2B')}>B2B Agencies</option>
              </select>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between">
        <button onClick={handleBack} className="flex items-center gap-2 font-bold text-gray-400 hover:text-gray-900 transition-colors"><ChevronLeft className="w-4 h-4" /> Atrás</button>
        <button onClick={handleNext} className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg flex items-center gap-2">Siguiente: Políticas <ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );

  // STEP 4: POLICIES
  const StepPolicies = () => (
    <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {['Booking.com', 'Web Directa'].map((channel) => (
          <div key={channel} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
            <h3 className="font-bold text-gray-900 border-b pb-4 flex items-center justify-between">
              {channel}
              <Settings2 className="w-4 h-4 text-gray-300" />
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Comisión Canal (%)</label>
                <input type="number" defaultValue={channel === 'Web Directa' ? 0 : 15} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Coste Limpieza Extra / Incidente (€)</label>
                <input type="number" defaultValue={45} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center pt-4">
        <button onClick={handleBack} className="flex items-center gap-2 font-bold text-gray-400 hover:text-gray-900 transition-colors"><ChevronLeft className="w-4 h-4" /> Atrás</button>
        <button onClick={handleNext} className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg flex items-center gap-2">Finalizar Configuración <ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );

  // STEP 5: VALIDATION
  const StepValidation = () => (
    <div className="max-w-3xl mx-auto space-y-8 animate-in zoom-in-95">
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Validación de Datos Completa</h2>
        <p className="text-gray-500 mt-1 italic">"Dataset listo para el motor de Inteligencia de Riesgo"</p>
      </div>
      <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl p-8 space-y-6">
        <div className="flex justify-between items-center text-sm font-bold uppercase tracking-widest text-gray-400 border-b pb-4">
          <span>Resumen del Dataset</span>
          <span>Status: Optimal</span>
        </div>
        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-1">
            <span className="text-3xl font-black text-gray-900">12.840</span>
            <p className="text-xs font-bold text-gray-500 uppercase">Reservas Procesadas</p>
          </div>
          <div className="space-y-1 text-right">
            <span className="text-3xl font-black text-blue-600">1.24M €</span>
            <p className="text-xs font-bold text-gray-500 uppercase">Ingresos Identificados</p>
          </div>
        </div>
        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-3">
          <Zap className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
          <p className="text-sm text-blue-900 leading-relaxed font-medium">
            Se ha detectado una erosión histórica potencial de <strong>-8.2%</strong> en este dataset. El análisis profundo revelará el impacto exacto por canal y perfil de cliente.
          </p>
        </div>
      </div>
      <div className="flex justify-center pt-4">
        <button 
          onClick={() => {
            setIsProcessing(true);
            setTimeout(() => {
              setIsProcessing(false);
              handleNext();
            }, 3000);
          }} 
          className="bg-blue-600 text-white px-12 py-5 rounded-3xl font-black text-xl shadow-2xl shadow-blue-200 flex items-center gap-3 hover:scale-105 transition-all active:scale-95 disabled:opacity-50"
          disabled={isProcessing}
        >
          {isProcessing ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Rocket className="w-6 h-6" />}
          {isProcessing ? 'PROCESANDO...' : 'ACTIVAR ANÁLISIS DE RIESGO'}
        </button>
      </div>
    </div>
  );

  // STEP 6: PROCESSING/READY
  const StepReady = () => (
    <div className="max-w-2xl mx-auto text-center space-y-8 animate-in fade-in">
      <div className="w-24 h-24 bg-blue-600 rounded-3xl flex items-center justify-center text-white mx-auto shadow-2xl shadow-blue-300 animate-bounce">
        <Rocket className="w-12 h-12" />
      </div>
      <div className="space-y-2">
        <h2 className="text-4xl font-black text-gray-900 tracking-tight">¡Motor Activado!</h2>
        <p className="text-xl text-gray-500 font-medium">Debacu está analizando el riesgo cliente y el impacto real en tu EBITDA.</p>
      </div>
      <div className="p-8 bg-white rounded-3xl border border-gray-100 shadow-lg text-left relative overflow-hidden group">
        <div className="relative z-10 flex items-center gap-6">
          <div className="flex-1 space-y-2">
            <div className="flex justify-between text-xs font-bold text-blue-600 uppercase tracking-widest">
              <span>Procesando Inteligencia</span>
              <span>75%</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 w-3/4 rounded-full animate-pulse shadow-[0_0_10px_rgba(37,99,235,0.5)]" />
            </div>
          </div>
          <div className="p-4 bg-blue-50 rounded-2xl">
            <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        </div>
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-blue-600/5 rounded-full blur-3xl group-hover:bg-blue-600/10 transition-all duration-1000" />
      </div>
      <div className="pt-8 space-y-4">
        <button onClick={() => window.location.reload()} className="px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-black transition-all flex items-center gap-2 mx-auto">
          Ir al Dashboard <ChevronRight className="w-4 h-4" />
        </button>
        <p className="text-xs text-gray-400 font-medium">Recibirás una alerta por email cuando el análisis del dataset histórico haya finalizado por completo.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen py-10">
      {renderProgress()}
      {step === 1 && <StepUpload />}
      {step === 2 && <StepMapping />}
      {step === 3 && <StepChannels />}
      {step === 4 && <StepPolicies />}
      {step === 5 && <StepValidation />}
      {step === 6 && <StepReady />}
    </div>
  );
};

export default DataIngestion;
