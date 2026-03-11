import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  CheckCircle2, 
  ArrowLeft, 
  Building2, 
  User, 
  Activity, 
  ShieldCheck,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { cn } from './utils';

interface FormData {
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  phone: string;
  website: string;
  hotelName: string;
  legalName: string;
  taxId: string;
  accommodationType: string;
  roomCount: string;
  employeeCount: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  pms: string;
  revenueAnalysisStatus: string;
  mainInterest: string;
  monthlyBookings: string;
  comments: string;
  privacyAccepted: boolean;
  representationConfirmed: boolean;
  manualReviewAccepted: boolean;
}

const initialFormData: FormData = {
  firstName: '',
  lastName: '',
  role: '',
  email: '',
  phone: '',
  website: '',
  hotelName: '',
  legalName: '',
  taxId: '',
  accommodationType: '',
  roomCount: '',
  employeeCount: '',
  address: '',
  postalCode: '',
  city: '',
  province: '',
  country: '',
  pms: '',
  revenueAnalysisStatus: '',
  mainInterest: '',
  monthlyBookings: '',
  comments: '',
  privacyAccepted: false,
  representationConfirmed: false,
  manualReviewAccepted: false,
};

export const AccessRequestPage = ({ onBack }: { onBack: () => void }) => {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const validate = () => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!formData.firstName) newErrors.firstName = 'El nombre es obligatorio';
    if (!formData.lastName) newErrors.lastName = 'Los apellidos son obligatorios';
    if (!formData.email) {
      newErrors.email = 'El email es obligatorio';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'El formato del email no es válido';
    }
    if (!formData.phone) newErrors.phone = 'El teléfono es obligatorio';
    if (!formData.hotelName) newErrors.hotelName = 'El nombre del alojamiento es obligatorio';
    if (!formData.taxId) newErrors.taxId = 'El CIF/NIF es obligatorio';
    if (!formData.accommodationType) newErrors.accommodationType = 'El tipo de alojamiento es obligatorio';
    if (!formData.roomCount) newErrors.roomCount = 'El número de habitaciones es obligatorio';
    if (!formData.city) newErrors.city = 'La ciudad es obligatoria';
    if (!formData.country) newErrors.country = 'El país es obligatorio';
    if (!formData.privacyAccepted) newErrors.privacyAccepted = 'Debes aceptar la política de privacidad';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsSuccess(true);
      } else {
        alert('Error al enviar la solicitud. Por favor, inténtalo de nuevo.');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Error de conexión. Por favor, inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    if (errors[name as keyof FormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-20 bg-[#020617]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-xl w-full glass-card p-12 text-center border-emerald-500/20 bg-emerald-500/5"
        >
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-8 text-emerald-500">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="text-3xl font-display font-bold text-white mb-4">Solicitud recibida correctamente</h2>
          <p className="text-slate-400 mb-12 leading-relaxed">
            Hemos recibido tu solicitud de acceso. Nuestro equipo revisará la información del alojamiento y, si la validación es correcta, recibirás un email con la invitación para activar tu cuenta y crear tu contraseña.
          </p>
          <button 
            onClick={onBack}
            className="btn-primary w-full py-4"
          >
            Volver al inicio
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] pt-32 pb-20 px-6">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors mb-8 group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          Volver
        </button>

        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">Solicitar acceso a Debacu</h1>
          <p className="text-slate-400 text-lg">
            Completa el formulario para que podamos validar tu alojamiento y habilitar el acceso a la plataforma.
          </p>
          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-3 text-sm text-blue-400">
            <ShieldCheck size={20} className="shrink-0" />
            <p>Debacu revisa cada solicitud manualmente para verificar que corresponde a un alojamiento real o empresa del sector hospitality.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-12">
          {/* Bloque 1: Datos de contacto */}
          <div className="glass-card p-8 border-white/[0.05]">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-500">
                <User size={20} />
              </div>
              <h3 className="text-xl font-bold text-white">Datos de contacto</h3>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Nombre *</label>
                <input 
                  type="text" 
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className={cn(
                    "w-full bg-white/5 border rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors",
                    errors.firstName ? "border-red-500/50" : "border-white/10"
                  )} 
                  placeholder="Tu nombre" 
                />
                {errors.firstName && <p className="text-[10px] text-red-500">{errors.firstName}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Apellidos *</label>
                <input 
                  type="text" 
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className={cn(
                    "w-full bg-white/5 border rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors",
                    errors.lastName ? "border-red-500/50" : "border-white/10"
                  )} 
                  placeholder="Tus apellidos" 
                />
                {errors.lastName && <p className="text-[10px] text-red-500">{errors.lastName}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Cargo / Puesto</label>
                <input 
                  type="text" 
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" 
                  placeholder="Ej: Director de Operaciones" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Email Profesional *</label>
                <input 
                  type="email" 
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={cn(
                    "w-full bg-white/5 border rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors",
                    errors.email ? "border-red-500/50" : "border-white/10"
                  )} 
                  placeholder="tu@empresa.com" 
                />
                {errors.email && <p className="text-[10px] text-red-500">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Teléfono *</label>
                <input 
                  type="tel" 
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className={cn(
                    "w-full bg-white/5 border rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors",
                    errors.phone ? "border-red-500/50" : "border-white/10"
                  )} 
                  placeholder="+34 000 000 000" 
                />
                {errors.phone && <p className="text-[10px] text-red-500">{errors.phone}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Web del hotel o empresa</label>
                <input 
                  type="url" 
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" 
                  placeholder="https://www.tu-hotel.com" 
                />
              </div>
            </div>
          </div>

          {/* Bloque 2: Datos del alojamiento */}
          <div className="glass-card p-8 border-white/[0.05]">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-lg bg-emerald-600/10 flex items-center justify-center text-emerald-500">
                <Building2 size={20} />
              </div>
              <h3 className="text-xl font-bold text-white">Datos del alojamiento o empresa</h3>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Nombre comercial del hotel / alojamiento *</label>
                <input 
                  type="text" 
                  name="hotelName"
                  value={formData.hotelName}
                  onChange={handleChange}
                  className={cn(
                    "w-full bg-white/5 border rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors",
                    errors.hotelName ? "border-red-500/50" : "border-white/10"
                  )} 
                  placeholder="Nombre del hotel" 
                />
                {errors.hotelName && <p className="text-[10px] text-red-500">{errors.hotelName}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Razón Social</label>
                <input 
                  type="text" 
                  name="legalName"
                  value={formData.legalName}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" 
                  placeholder="Nombre legal de la empresa" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">CIF / NIF Empresa *</label>
                <input 
                  type="text" 
                  name="taxId"
                  value={formData.taxId}
                  onChange={handleChange}
                  className={cn(
                    "w-full bg-white/5 border rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors",
                    errors.taxId ? "border-red-500/50" : "border-white/10"
                  )} 
                  placeholder="B00000000" 
                />
                {errors.taxId && <p className="text-[10px] text-red-500">{errors.taxId}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Tipo de alojamiento *</label>
                <select 
                  name="accommodationType"
                  value={formData.accommodationType}
                  onChange={handleChange}
                  className={cn(
                    "w-full bg-white/5 border rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors appearance-none",
                    errors.accommodationType ? "border-red-500/50" : "border-white/10"
                  )}
                >
                  <option value="" className="bg-slate-900">Seleccionar...</option>
                  <option value="hotel" className="bg-slate-900">Hotel</option>
                  <option value="apartahotel" className="bg-slate-900">Apartahotel</option>
                  <option value="apartamentos" className="bg-slate-900">Apartamentos turísticos</option>
                  <option value="rural" className="bg-slate-900">Casa rural</option>
                  <option value="hostal" className="bg-slate-900">Hostal</option>
                  <option value="otro" className="bg-slate-900">Otro</option>
                </select>
                {errors.accommodationType && <p className="text-[10px] text-red-500">{errors.accommodationType}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Número de habitaciones *</label>
                <input 
                  type="number" 
                  name="roomCount"
                  value={formData.roomCount}
                  onChange={handleChange}
                  className={cn(
                    "w-full bg-white/5 border rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors",
                    errors.roomCount ? "border-red-500/50" : "border-white/10"
                  )} 
                  placeholder="0" 
                />
                {errors.roomCount && <p className="text-[10px] text-red-500">{errors.roomCount}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Número estimado de empleados</label>
                <input 
                  type="number" 
                  name="employeeCount"
                  value={formData.employeeCount}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" 
                  placeholder="0" 
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Dirección</label>
                <input 
                  type="text" 
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" 
                  placeholder="Calle, número, planta" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Código Postal</label>
                <input 
                  type="text" 
                  name="postalCode"
                  value={formData.postalCode}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" 
                  placeholder="00000" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Ciudad *</label>
                <input 
                  type="text" 
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className={cn(
                    "w-full bg-white/5 border rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors",
                    errors.city ? "border-red-500/50" : "border-white/10"
                  )} 
                  placeholder="Ciudad" 
                />
                {errors.city && <p className="text-[10px] text-red-500">{errors.city}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Provincia / Estado</label>
                <input 
                  type="text" 
                  name="province"
                  value={formData.province}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" 
                  placeholder="Provincia" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">País *</label>
                <input 
                  type="text" 
                  name="country"
                  value={formData.country}
                  onChange={handleChange}
                  className={cn(
                    "w-full bg-white/5 border rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors",
                    errors.country ? "border-red-500/50" : "border-white/10"
                  )} 
                  placeholder="España" 
                />
                {errors.country && <p className="text-[10px] text-red-500">{errors.country}</p>}
              </div>
            </div>
          </div>

          {/* Bloque 3: Información operativa */}
          <div className="glass-card p-8 border-white/[0.05]">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-lg bg-violet-600/10 flex items-center justify-center text-violet-500">
                <Activity size={20} />
              </div>
              <h3 className="text-xl font-bold text-white">Información operativa</h3>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">PMS Actual</label>
                <input 
                  type="text" 
                  name="pms"
                  value={formData.pms}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" 
                  placeholder="Ej: Opera, Mews, Cloudbeds..." 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">¿Trabaja con análisis de revenue?</label>
                <select 
                  name="revenueAnalysisStatus"
                  value={formData.revenueAnalysisStatus}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50 appearance-none"
                >
                  <option value="" className="bg-slate-900">Seleccionar...</option>
                  <option value="si" className="bg-slate-900">Sí</option>
                  <option value="no" className="bg-slate-900">No</option>
                  <option value="parcialmente" className="bg-slate-900">Parcialmente</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Interés principal en Debacu</label>
                <select 
                  name="mainInterest"
                  value={formData.mainInterest}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50 appearance-none"
                >
                  <option value="" className="bg-slate-900">Seleccionar...</option>
                  <option value="riesgo" className="bg-slate-900">Riesgo operativo</option>
                  <option value="revenue" className="bg-slate-900">Revenue intelligence</option>
                  <option value="trazabilidad" className="bg-slate-900">Control y trazabilidad</option>
                  <option value="ia" className="bg-slate-900">IA aplicada a la operativa</option>
                  <option value="otro" className="bg-slate-900">Otro</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Reservas mensuales estimadas</label>
                <input 
                  type="text" 
                  name="monthlyBookings"
                  value={formData.monthlyBookings}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" 
                  placeholder="Ej: 500 - 1000" 
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Observaciones o comentarios</label>
                <textarea 
                  name="comments"
                  value={formData.comments}
                  onChange={handleChange}
                  rows={4} 
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" 
                  placeholder="Cuéntanos más sobre tus necesidades..."
                ></textarea>
              </div>
            </div>
          </div>

          {/* Bloque 4: Verificación */}
          <div className="glass-card p-8 border-white/[0.05] space-y-6">
            <div className="space-y-4">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  name="representationConfirmed"
                  checked={formData.representationConfirmed}
                  onChange={handleChange}
                  className="mt-1 w-4 h-4 rounded border-white/10 bg-white/5 text-blue-600 focus:ring-0 focus:ring-offset-0" 
                />
                <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">Confirmo que represento al alojamiento o empresa indicada</span>
              </label>
              
              <label className="flex items-start gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  name="privacyAccepted"
                  checked={formData.privacyAccepted}
                  onChange={handleChange}
                  className={cn(
                    "mt-1 w-4 h-4 rounded border-white/10 bg-white/5 text-blue-600 focus:ring-0 focus:ring-offset-0",
                    errors.privacyAccepted && "border-red-500/50"
                  )} 
                />
                <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">Acepto la <button type="button" className="text-blue-500 hover:underline">política de privacidad</button> *</span>
              </label>
              {errors.privacyAccepted && <p className="text-[10px] text-red-500 ml-7">{errors.privacyAccepted}</p>}

              <label className="flex items-start gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  name="manualReviewAccepted"
                  checked={formData.manualReviewAccepted}
                  onChange={handleChange}
                  className="mt-1 w-4 h-4 rounded border-white/10 bg-white/5 text-blue-600 focus:ring-0 focus:ring-offset-0" 
                />
                <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">Acepto que Debacu revise manualmente esta solicitud antes de conceder acceso</span>
              </label>
            </div>

            <div className="pt-6 border-t border-white/[0.05]">
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="btn-primary w-full py-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Enviando solicitud...
                  </>
                ) : (
                  'Enviar solicitud'
                )}
              </button>
              <p className="text-[10px] text-slate-600 text-center mt-4">
                Debacu revisa manualmente las solicitudes para proteger la integridad de la plataforma y garantizar que el acceso se concede únicamente a empresas y alojamientos reales del sector.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
