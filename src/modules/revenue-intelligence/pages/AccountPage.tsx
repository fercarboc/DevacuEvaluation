import React, { useState } from 'react';
import { useAuth, PlanCode } from '../context/AuthContext';
import { User, Shield, CreditCard, Check, Building2, Mail, Phone, Briefcase, Save, Lock, AlertCircle, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const AccountPage: React.FC = () => {
  const { user, updateProfile, changePassword, setPlan } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'plans'>('profile');
  
  // Profile Form State
  const [profileData, setProfileData] = useState({
    fullName: user?.fullName || '',
    phone: user?.phone || '',
    company: user?.company || '',
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Security Form State
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });
  const [isChangingPw, setIsChangingPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileSuccess(false);
    
    // Mock delay
    await new Promise(r => setTimeout(r, 800));
    updateProfile(profileData);
    
    setIsSavingProfile(false);
    setProfileSuccess(true);
    setTimeout(() => setProfileSuccess(false), 3000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);

    if (passwords.new.length < 8) {
      setPwError('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (passwords.new !== passwords.confirm) {
      setPwError('Las contraseñas no coinciden');
      return;
    }

    setIsChangingPw(true);
    try {
      await changePassword(passwords.current, passwords.new);
      setPwSuccess(true);
      setPasswords({ current: '', new: '', confirm: '' });
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err) {
      setPwError('Error al cambiar la contraseña');
    } finally {
      setIsChangingPw(false);
    }
  };

  const plans: { code: PlanCode; name: string; price: string; features: string[]; limit: string }[] = [
    { 
      code: 'FREE', 
      name: 'Free Trial', 
      price: '0€', 
      limit: '1 Propiedad',
      features: ['Dashboard Básico', 'Día x Día', '30 días de prueba'] 
    },
    { 
      code: 'BASIC', 
      name: 'Basic', 
      price: '49€/mes', 
      limit: '1 Propiedad',
      features: ['Dashboard Completo', 'Pickup Avanzado', 'Importación CSV'] 
    },
    { 
      code: 'MEDIUM', 
      name: 'Medium', 
      price: '129€/mes', 
      limit: '3 Propiedades',
      features: ['Todo en Basic', 'Informes PDF', 'Eventos y Temporadas'] 
    },
    { 
      code: 'PREMIUM', 
      name: 'Premium', 
      price: '299€/mes', 
      limit: '10 Propiedades',
      features: ['Todo en Medium', 'Soporte Prioritario', 'Multi-usuario'] 
    },
    { 
      code: 'ENTERPRISE', 
      name: 'Enterprise', 
      price: 'Custom', 
      limit: 'Ilimitado',
      features: ['Todo en Premium', 'API Access', 'Custom Dashboards'] 
    },
  ];

  const calculateTrialDays = () => {
    if (!user?.trialEndsAt) return 0;
    const end = new Date(user.trialEndsAt);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Mi Cuenta</h1>
          <p className="text-gray-500 mt-1">Gestiona tu perfil, seguridad y suscripción</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'profile' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <User size={18} />
            Perfil
          </button>
          <button 
            onClick={() => setActiveTab('security')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'security' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Shield size={18} />
            Seguridad
          </button>
          <button 
            onClick={() => setActiveTab('plans')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'plans' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <CreditCard size={18} />
            Planes
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'profile' && (
          <motion.div 
            key="profile"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100">
                <h3 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-3">
                  <User className="text-blue-600" />
                  Datos del perfil
                </h3>
                
                <form onSubmit={handleSaveProfile} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Nombre y Apellidos</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                          type="text"
                          value={profileData.fullName}
                          onChange={e => setProfileData({...profileData, fullName: e.target.value})}
                          className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-medium"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                          type="email"
                          disabled
                          value={user?.email}
                          className="w-full pl-12 pr-4 py-3.5 bg-gray-100 border border-gray-200 rounded-2xl text-gray-500 text-sm font-medium cursor-not-allowed"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Teléfono</label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                          type="text"
                          value={profileData.phone}
                          onChange={e => setProfileData({...profileData, phone: e.target.value})}
                          placeholder="+34 600 000 000"
                          className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-medium"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Empresa</label>
                      <div className="relative">
                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                          type="text"
                          value={profileData.company}
                          onChange={e => setProfileData({...profileData, company: e.target.value})}
                          placeholder="Nombre de tu cadena u hotel"
                          className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-medium"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Cargo / Rol</label>
                      <div className="relative">
                        <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                          type="text"
                          disabled
                          value={user?.role === 'ADMIN' ? 'Administrador de Sistema' : 'Revenue Manager'}
                          className="w-full pl-12 pr-4 py-3.5 bg-gray-100 border border-gray-200 rounded-2xl text-gray-500 text-sm font-medium cursor-not-allowed"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-2">
                      {profileSuccess && (
                        <motion.span 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="text-emerald-600 text-sm font-bold flex items-center gap-1"
                        >
                          <Check size={16} /> ¡Cambios guardados!
                        </motion.span>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={isSavingProfile}
                      className="flex items-center gap-2 px-8 py-3.5 bg-gray-900 text-white rounded-2xl font-bold text-sm hover:bg-gray-800 transition-all shadow-lg shadow-gray-200 disabled:opacity-50"
                    >
                      {isSavingProfile ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : <Save size={18} />}
                      Guardar cambios
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-blue-600 p-8 rounded-[32px] shadow-xl shadow-blue-100 text-white">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <CreditCard size={24} />
                  </div>
                  <h4 className="font-bold text-lg">Tu Plan Actual</h4>
                </div>
                <div className="mb-6">
                  <span className="px-3 py-1 bg-white/20 rounded-lg text-xs font-bold uppercase tracking-widest">
                    {user?.planCode}
                  </span>
                  <div className="mt-4">
                    <p className="text-3xl font-bold">
                      {plans.find(p => p.code === user?.planCode)?.price}
                    </p>
                    {user?.planCode === 'FREE' && (
                      <p className="text-blue-100 text-sm mt-2 font-medium">
                        Quedan <span className="font-bold text-white">{calculateTrialDays()} días</span> de prueba
                      </p>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => setActiveTab('plans')}
                  className="w-full py-3 bg-white text-blue-600 rounded-2xl font-bold text-sm hover:bg-blue-50 transition-colors"
                >
                  Mejorar plan
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'security' && (
          <motion.div 
            key="security"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-2xl mx-auto"
          >
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100">
              <h3 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-3">
                <Lock className="text-blue-600" />
                Cambiar contraseña
              </h3>

              <form onSubmit={handleChangePassword} className="space-y-6">
                {pwError && (
                  <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl flex items-center gap-3 text-sm">
                    <AlertCircle size={18} />
                    <span className="font-medium">{pwError}</span>
                  </div>
                )}
                {pwSuccess && (
                  <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-2xl flex items-center gap-3 text-sm">
                    <Check size={18} />
                    <span className="font-medium">¡Contraseña actualizada correctamente!</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Contraseña actual</label>
                  <input
                    type="password"
                    required
                    value={passwords.current}
                    onChange={e => setPasswords({...passwords, current: e.target.value})}
                    className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Nueva contraseña</label>
                    <input
                      type="password"
                      required
                      value={passwords.new}
                      onChange={e => setPasswords({...passwords, new: e.target.value})}
                      className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Repetir nueva contraseña</label>
                    <input
                      type="password"
                      required
                      value={passwords.confirm}
                      onChange={e => setPasswords({...passwords, confirm: e.target.value})}
                      className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-medium"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isChangingPw}
                    className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold text-sm hover:bg-gray-800 transition-all shadow-lg shadow-gray-200 disabled:opacity-50"
                  >
                    {isChangingPw ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
                    ) : 'Actualizar contraseña'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}

        {activeTab === 'plans' && (
          <motion.div 
            key="plans"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {plans.map((plan) => (
                <div 
                  key={plan.code}
                  className={`relative p-6 rounded-[32px] border transition-all ${
                    user?.planCode === plan.code 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-100 scale-105 z-10' 
                    : 'bg-white border-gray-100 hover:border-blue-200'
                  }`}
                >
                  {user?.planCode === plan.code && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gray-900 text-white text-[10px] font-bold rounded-full uppercase tracking-widest">
                      Actual
                    </div>
                  )}
                  <h4 className={`font-bold text-lg mb-1 ${user?.planCode === plan.code ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h4>
                  <p className={`text-2xl font-black mb-4 ${user?.planCode === plan.code ? 'text-white' : 'text-blue-600'}`}>{plan.price}</p>
                  
                  <div className={`text-[10px] font-bold uppercase tracking-widest mb-4 p-2 rounded-xl ${user?.planCode === plan.code ? 'bg-white/20' : 'bg-gray-50 text-gray-400'}`}>
                    {plan.limit}
                  </div>

                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] font-medium leading-tight">
                        <Check size={14} className={user?.planCode === plan.code ? 'text-white' : 'text-blue-500'} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {plan.code === 'ENTERPRISE' ? (
                    <button className="w-full py-3 bg-gray-900 text-white rounded-2xl font-bold text-xs hover:bg-gray-800 transition-all">
                      Contactar
                    </button>
                  ) : (
                    <button 
                      onClick={() => setPlan(plan.code)}
                      disabled={user?.planCode === plan.code}
                      className={`w-full py-3 rounded-2xl font-bold text-xs transition-all ${
                        user?.planCode === plan.code 
                        ? 'bg-white/20 text-white cursor-default' 
                        : 'bg-gray-100 text-gray-600 hover:bg-blue-600 hover:text-white'
                      }`}
                    >
                      {user?.planCode === plan.code ? 'Plan activo' : 'Seleccionar'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
              <h3 className="text-xl font-bold text-gray-900 mb-8">Comparativa de funcionalidades</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                    <tr>
                      <th className="pb-6">Funcionalidad</th>
                      <th className="pb-6 text-center">Free</th>
                      <th className="pb-6 text-center">Basic</th>
                      <th className="pb-6 text-center">Medium</th>
                      <th className="pb-6 text-center">Premium</th>
                      <th className="pb-6 text-center">Enterprise</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[
                      { name: 'Dashboard Básico', levels: [true, true, true, true, true] },
                      { name: 'Día x Día', levels: [true, true, true, true, true] },
                      { name: 'Pickup Avanzado', levels: [false, true, true, true, true] },
                      { name: 'Importación CSV', levels: [false, true, true, true, true] },
                      { name: 'Informes PDF', levels: [false, false, true, true, true] },
                      { name: 'Eventos y Temporadas', levels: [false, false, true, true, true] },
                      { name: 'Multi-propiedad', levels: ['1', '1', '3', '10', 'Ilimitado'] },
                    ].map((row, i) => (
                      <tr key={i} className="group hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 font-bold text-gray-700">{row.name}</td>
                        {row.levels.map((l, j) => (
                          <td key={j} className="py-4 text-center">
                            {typeof l === 'boolean' ? (
                              l ? <Check className="mx-auto text-emerald-500" size={18} /> : <span className="text-gray-200">—</span>
                            ) : (
                              <span className="font-bold text-gray-600">{l}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AccountPage;