// src/components/RatingForm.tsx
import React, { useState } from 'react';
import { StarRating } from './StarRating';
import { Save, AlertCircle, CheckCircle } from 'lucide-react';
import { addEvaluation } from '../services/evaluationService';

interface RatingFormProps {
  currentCustomerId: string;    // id del hotel/cliente en la central
  currentCustomerName: string;  // nombre del hotel/cliente
}

export const RatingForm: React.FC<RatingFormProps> = ({
  currentCustomerId,
  currentCustomerName,
}) => {
  const [formData, setFormData] = useState({
    fullName: '',
    document: '',
    email: '',
    phone: '',
    comment: '',
    value: 0,
    nationality: '',
    platform: '',
  });

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>(
    'idle'
  );

  // === Handlers con validación / normalización ===

  const handleFullNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Solo letras, espacios y tildes; sin números. Todo en MAYÚSCULAS
    const raw = e.target.value;
    const cleaned = raw.replace(/[0-9]/g, '');
    setFormData((prev) => ({ ...prev, fullName: cleaned.toUpperCase() }));
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Solo letras y números (DNI/NIE/Pasaporte), sin símbolos
    const raw = e.target.value;
    const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    setFormData((prev) => ({ ...prev, document: cleaned }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Solo dígitos, máximo 11
    const raw = e.target.value;
    const digitsOnly = raw.replace(/\D/g, '').slice(0, 11);
    setFormData((prev) => ({ ...prev, phone: digitsOnly }));
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, email: e.target.value.trim() }));
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, comment: e.target.value }));
  };

  const handleNationalityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      nationality: e.target.value.toUpperCase(),
    }));
  };

  const handlePlatformChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      platform: e.target.value,
    }));
  };

  const handleRatingChange = (val: number) => {
    setFormData((prev) => ({ ...prev, value: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.value) {
      alert('Por favor selecciona una puntuación (estrellas).');
      return;
    }

    if (!formData.fullName.trim()) {
      alert('El nombre completo es obligatorio.');
      return;
    }

    setStatus('submitting');
    try {
      const result = await addEvaluation(
        {
          document: formData.document.trim() || 'GEN-SIN-DOC',
          fullName: formData.fullName.trim(),
          nationality: formData.nationality.trim() || null,
          phone: formData.phone.trim() || null,
          email: formData.email.trim(),
          rating: formData.value,
          comment: formData.comment.trim() || null,
          platform: formData.platform.trim() || 'DEBACU_EVAL',
        },
        currentCustomerId,
        currentCustomerName
      );

      if (!result) {
        throw new Error('No se pudo guardar la valoración');
      }

      setStatus('success');
      // Reset después de 2s
      setTimeout(() => {
        setStatus('idle');
        setFormData({
          fullName: '',
          document: '',
          email: '',
          phone: '',
          comment: '',
          value: 0,
          nationality: '',
          platform: '',
        });
      }, 2000);
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  };

  const ratingLabel =
    formData.value === 1
      ? 'Malo'
      : formData.value === 2
      ? 'Regular'
      : formData.value === 3
      ? 'Normal'
      : formData.value === 4
      ? 'Bueno'
      : formData.value === 5
      ? 'Excelente'
      : 'Selecciona estrellas';

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-1">
          Nueva Valoración
        </h2>
        <p className="text-sm text-slate-600">
          Registra el comportamiento de un cliente para ayudar a toda la
          comunidad de alojamientos.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CARD IZQUIERDA: FORMULARIO */}
        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-sm">
            {status === 'success' ? (
              <div className="text-center py-10">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-800">
                  ¡Valoración registrada con éxito!
                </h3>
                <p className="text-slate-500 text-sm mt-1">
                  La valoración ha sido guardada en la base de datos.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Datos básicos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nombre Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.fullName}
                      onChange={handleFullNameChange}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="NOMBRE Y APELLIDOS"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Documento / ID
                    </label>
                    <input
                      type="text"
                      value={formData.document}
                      onChange={handleDocumentChange}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="DNI, NIE, PASAPORTE..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={handlePhoneChange}
                      maxLength={11}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="Ej: 600123456"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Sólo números, máximo 11 dígitos.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={handleEmailChange}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="cliente@email.com"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nacionalidad (código país)
                    </label>
                    <input
                      type="text"
                      value={formData.nationality}
                      onChange={handleNationalityChange}
                      maxLength={3}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm uppercase"
                      placeholder="ESP, FRA, GBR..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Plataforma / Origen
                    </label>
                    <input
                      type="text"
                      value={formData.platform}
                      onChange={handlePlatformChange}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="BOOKING, EXPEDIA, Motor Propio..."
                    />
                  </div>
                </div>

                {/* Valoración */}
                <div className="border-t border-slate-100 pt-4">
                  <label className="block text-xs font-medium text-slate-700 mb-2">
                    Valoración General *
                  </label>
                  <div className="flex items-center gap-4 mb-2">
                    <StarRating
                      rating={formData.value}
                      interactive={true}
                      onChange={handleRatingChange}
                      size="lg"
                    />
                    <span className="text-xs text-slate-500 font-medium">
                      {ratingLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Haz clic en las estrellas para seleccionar una puntuación de 1 a 5.
                  </p>
                </div>

                {/* Comentario */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Comentario *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={formData.comment}
                    onChange={handleCommentChange}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    placeholder="Describe tu experiencia con este cliente..."
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="w-full flex justify-center items-center px-6 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                  >
                    {status === 'submitting' ? (
                      'Guardando...'
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Registrar Valoración
                      </>
                    )}
                  </button>
                </div>

                {status === 'error' && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-xs mt-2">
                    <AlertCircle className="w-4 h-4" />
                    Ocurrió un error al guardar. Inténtalo de nuevo.
                  </div>
                )}
              </form>
            )}
          </div>
        </div>

        {/* CARD DERECHA: INFO / BENEFICIOS */}
        <div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 h-full flex flex-col text-sm">
            <h3 className="text-sm font-semibold text-indigo-900 mb-2">
              ¿Por qué es importante valorar a los clientes?
            </h3>
            <p className="text-xs text-indigo-900 mb-3">
              Si un hotel puede predecir el tipo de cliente que vendrá, le
              afecta enormemente de forma positiva: le permite personalizar
              servicios, optimizar recursos, ajustar precios (revenue
              management), mejorar la experiencia del cliente y aumentar la
              fidelización y la rentabilidad.
            </p>
            <p className="text-xs text-indigo-900 mb-3">
              Conocer el historial de comportamiento ayuda a adaptar la oferta
              (habitaciones, actividades, turnos de limpieza, personal de
              recepción, etc.) a las necesidades de familias, viajeros de
              negocios, parejas, grupos, antes incluso de su llegada. Esto se
              traduce en menos problemas, más satisfacción y mejores reseñas.
            </p>
            <p className="text-xs text-indigo-900 mt-1">
              También es útil para casas rurales, hostales, pisos turísticos,
              empresas de trasteros y cualquier negocio que gestione reservas:
              identificar clientes conflictivos o excelentes permite tomar
              mejores decisiones, reducir impagos y proteger tu negocio.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
