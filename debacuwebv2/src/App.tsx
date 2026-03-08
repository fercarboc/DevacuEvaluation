/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronRight, 
  Menu, 
  X, 
  Check, 
  ArrowRight,
  Globe,
  Zap,
  BarChart3,
  ShieldCheck,
  Smartphone,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Twitter,
  Linkedin,
  Github
} from 'lucide-react';
import { DashboardMockup } from './components/DashboardMockup';
import { TechnologyPage } from './components/TechnologyPage';
import { TechnicalDocs } from './components/TechnicalDocs';
import { ArchitecturePage } from './components/ArchitecturePage';
import { ProductPage } from './components/ProductPage';
import { AccessRequestPage } from './components/AccessRequestPage';
import { LoginPage } from './components/LoginPage';
import { 
  ProblemSection, 
  FeaturesSection, 
  HowItWorks, 
  TechSection, 
  UseCases, 
  TargetAudience, 
  InnovationSection 
} from './components/LandingSections';
import { cn } from './lib/utils';

type Page = 'home' | 'product' | 'technology' | 'pricing' | 'contact' | 'blog' | 'docs' | 'architecture' | 'request-access' | 'login';

const Navbar = ({ currentPage, setCurrentPage }: { currentPage: Page, setCurrentPage: (p: Page) => void }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems: { label: string, value: Page }[] = [
    { label: 'Producto', value: 'product' },
    { label: 'Tecnología', value: 'technology' },
    { label: 'Docs', value: 'docs' },
    { label: 'Planes', value: 'pricing' },
    { label: 'Blog', value: 'blog' },
    { label: 'Contacto', value: 'contact' },
  ];

  return (
    <nav className={cn(
      "fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-6 py-4",
      isScrolled ? "bg-[#020617]/80 backdrop-blur-md border-b border-white/[0.08]" : "bg-transparent"
    )}>
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-12">
          <button 
            onClick={() => setCurrentPage('home')}
            className="text-2xl font-bold tracking-tighter text-white flex items-center gap-2"
          >
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
              <div className="w-4 h-4 bg-white rounded-sm" />
            </div>
            debacu
          </button>
          
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <button 
                key={item.value} 
                onClick={() => setCurrentPage(item.value)}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-white",
                  currentPage === item.value ? "text-blue-400" : "text-slate-400"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <button 
            onClick={() => setCurrentPage('login')}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Acceso
          </button>
          <button 
            onClick={() => setCurrentPage('request-access')}
            className="btn-primary text-sm px-5 py-2.5"
          >
            Solicitar acceso
          </button>
        </div>

        <button 
          className="md:hidden text-white"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-full left-0 right-0 bg-[#020617] border-b border-white/[0.08] p-6 md:hidden"
          >
            <div className="flex flex-col gap-4">
              {navItems.map((item) => (
                <button 
                  key={item.value} 
                  onClick={() => { setCurrentPage(item.value); setIsMobileMenuOpen(false); }}
                  className={cn(
                    "text-lg font-medium text-left",
                    currentPage === item.value ? "text-blue-400" : "text-slate-400"
                  )}
                >
                  {item.label}
                </button>
              ))}
              <hr className="border-white/[0.08] my-2" />
              <button 
                onClick={() => { setCurrentPage('request-access'); setIsMobileMenuOpen(false); }}
                className="btn-primary w-full justify-center"
              >
                Solicitar acceso
              </button>
              <button 
                onClick={() => { setCurrentPage('login'); setIsMobileMenuOpen(false); }}
                className="btn-secondary w-full justify-center"
              >
                Acceso
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const PricingPage = () => {
  const plans = [
    {
      name: "FREE",
      price: "0€",
      description: "Para pruebas y pequeños alojamientos.",
      features: ["1 propiedad", "Registro básico de incidencias", "Panel de datos básico", "Soporte limitado"],
      isPopular: false,
      cta: "Empezar Gratis"
    },
    {
      name: "BASIC",
      price: "55€",
      description: "Para hoteles independientes que empiezan su digitalización.",
      features: ["1 propiedad", "Evaluación de riesgo", "Panel de revenue básico", "Alertas operativas", "Importación CSV"],
      isPopular: false,
      cta: "Elegir Basic"
    },
    {
      name: "MEDIUM",
      price: "95€",
      description: "Para hoteles que quieren análisis avanzado y proactivo.",
      features: ["2 propiedades", "Revenue intelligence completo", "Análisis por canal y segmento", "Panel de tendencias", "Alertas inteligentes"],
      isPopular: true,
      cta: "Elegir Medium"
    },
    {
      name: "PREMIUM",
      price: "145€",
      description: "La potencia total de la IA para maximizar resultados.",
      features: ["4 propiedades", "Inteligencia artificial avanzada", "Análisis predictivo", "Exportaciones avanzadas", "Soporte 24/7"],
      isPopular: false,
      cta: "Elegir Premium"
    },
    {
      name: "ENTERPRISE",
      price: "Consultar",
      description: "Para grandes cadenas y grupos hoteleros.",
      features: ["Propiedades ilimitadas", "Conexión directa API", "Integración con PMS", "Custom Reporting", "Account Manager"],
      isPopular: false,
      cta: "Contactar"
    }
  ];

  const comparisonFeatures = [
    { name: "Propiedades", free: "1", basic: "1", medium: "2", premium: "4", enterprise: "Ilimitadas" },
    { name: "Registro de incidencias", free: "Básico", basic: "Estructurado", medium: "Avanzado", premium: "Completo", enterprise: "Personalizado" },
    { name: "Evaluación de riesgo", free: false, basic: true, medium: true, premium: true, enterprise: true },
    { name: "Panel de revenue", free: "Básico", basic: "Básico", medium: "Completo", premium: "Avanzado", enterprise: "Enterprise" },
    { name: "Alertas operativas", free: false, basic: true, medium: true, premium: true, enterprise: true },
    { name: "Importación CSV", free: false, basic: true, medium: true, premium: true, enterprise: true },
    { name: "Dashboard analítico", free: "Limitado", basic: true, medium: true, premium: true, enterprise: true },
    { name: "Revenue intelligence completo", free: false, basic: false, medium: true, premium: true, enterprise: true },
    { name: "Análisis por canal y segmento", free: false, basic: false, medium: true, premium: true, enterprise: true },
    { name: "Panel de tendencias", free: false, basic: false, medium: true, premium: true, enterprise: true },
    { name: "Alertas inteligentes", free: false, basic: false, medium: true, premium: true, enterprise: true },
    { name: "Inteligencia artificial avanzada", free: false, basic: false, medium: false, premium: true, enterprise: true },
    { name: "Análisis predictivo", free: false, basic: false, medium: false, premium: true, enterprise: true },
    { name: "Exportaciones avanzadas", free: false, basic: false, medium: false, premium: true, enterprise: true },
    { name: "Conexión API / PMS", free: false, basic: false, medium: false, premium: false, enterprise: true },
    { name: "Soporte", free: "Email", basic: "Email", medium: "Prioritario", premium: "24/7", enterprise: "Dedicado" },
  ];

  return (
    <section className="section-padding pt-32">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-display font-bold mb-6">Planes adaptados a tu negocio</h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-lg">
            Elige el plan que mejor se adapte al tamaño y necesidades de tu alojamiento. Sin permanencia, escala cuando quieras.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-24">
          {plans.map((plan, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                "glass-card p-6 flex flex-col relative",
                plan.isPopular && "border-blue-500/50 ring-1 ring-blue-500/50 bg-blue-500/[0.03]"
              )}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                  Más Recomendado
                </div>
              )}
              <h3 className="text-lg font-bold mb-2">{plan.name}</h3>
              <div className="mb-4">
                <span className="text-3xl font-bold">{plan.price}</span>
                {plan.name !== "ENTERPRISE" && <span className="text-slate-500 text-sm ml-1">/mes</span>}
              </div>
              <p className="text-slate-400 text-[10px] mb-6 leading-relaxed h-10">{plan.description}</p>
              
              <div className="space-y-3 mb-6 flex-grow">
                {plan.features.map((feature, j) => (
                  <div key={j} className="flex items-start gap-2 text-[10px] text-slate-300">
                    <Check size={12} className="text-blue-500 shrink-0 mt-0.5" />
                    {feature}
                  </div>
                ))}
              </div>

              <button className={cn(
                "w-full py-2.5 rounded-lg font-bold text-xs transition-all",
                plan.isPopular ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20" : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
              )}>
                {plan.cta}
              </button>
            </motion.div>
          ))}
        </div>

        {/* Comparison Table */}
        <div className="mt-32">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-display font-bold mb-4">Comparativa de funciones</h2>
            <p className="text-slate-500">Analiza en detalle qué incluye cada nivel de servicio.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-6 px-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">Función</th>
                  <th className="py-6 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">Free</th>
                  <th className="py-6 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">Basic</th>
                  <th className="py-6 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">Medium</th>
                  <th className="py-6 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">Premium</th>
                  <th className="py-6 px-4 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((feature, i) => (
                  <tr key={i} className="border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 px-4 text-sm text-slate-300">{feature.name}</td>
                    <td className="py-4 px-4 text-center text-sm">
                      {typeof feature.free === 'boolean' ? (
                        feature.free ? <Check size={16} className="text-blue-500 mx-auto" /> : <X size={16} className="text-slate-700 mx-auto" />
                      ) : <span className="text-slate-500">{feature.free}</span>}
                    </td>
                    <td className="py-4 px-4 text-center text-sm">
                      {typeof feature.basic === 'boolean' ? (
                        feature.basic ? <Check size={16} className="text-blue-500 mx-auto" /> : <X size={16} className="text-slate-700 mx-auto" />
                      ) : <span className="text-slate-500">{feature.basic}</span>}
                    </td>
                    <td className="py-4 px-4 text-center text-sm">
                      {typeof feature.medium === 'boolean' ? (
                        feature.medium ? <Check size={16} className="text-blue-500 mx-auto" /> : <X size={16} className="text-slate-700 mx-auto" />
                      ) : <span className="text-slate-500 font-bold text-blue-400">{feature.medium}</span>}
                    </td>
                    <td className="py-4 px-4 text-center text-sm">
                      {typeof feature.premium === 'boolean' ? (
                        feature.premium ? <Check size={16} className="text-blue-500 mx-auto" /> : <X size={16} className="text-slate-700 mx-auto" />
                      ) : <span className="text-white font-bold">{feature.premium}</span>}
                    </td>
                    <td className="py-4 px-4 text-center text-sm">
                      {typeof feature.enterprise === 'boolean' ? (
                        feature.enterprise ? <Check size={16} className="text-blue-500 mx-auto" /> : <X size={16} className="text-slate-700 mx-auto" />
                      ) : <span className="text-blue-400 font-bold">{feature.enterprise}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-8 text-[10px] text-slate-600 text-center">
            * Sujeto a política de uso razonable. Los precios no incluyen IVA.
          </p>
        </div>
      </div>
    </section>
  );
};

const ContactPage = () => (
  <section className="section-padding pt-32">
    <div className="max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-2 gap-16">
        <div>
          <h1 className="text-4xl md:text-6xl font-display font-bold mb-8">Hablemos de tu hotel</h1>
          <p className="text-slate-400 text-lg mb-12">
            Nuestro equipo de expertos en hospitality y tecnología está listo para ayudarte a transformar tus datos en rentabilidad.
          </p>
          
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20">
                <Mail className="text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold">Email</p>
                <p className="text-white">contacto@debacu.com</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-600/10 flex items-center justify-center border border-emerald-500/20">
                <Phone className="text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold">Teléfono</p>
                <p className="text-white">+34 910 000 000</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet-600/10 flex items-center justify-center border border-violet-500/20">
                <MapPin className="text-violet-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold">Ubicación</p>
                <p className="text-white">Paseo de la Castellana, Madrid, ES</p>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-8 border-white/[0.05]">
          <form className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Nombre</label>
                <input type="text" className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" placeholder="Tu nombre" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                <input type="email" className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" placeholder="tu@email.com" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Hotel / Empresa</label>
              <input type="text" className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" placeholder="Nombre de tu alojamiento" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Mensaje</label>
              <textarea rows={4} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500/50" placeholder="¿Cómo podemos ayudarte?"></textarea>
            </div>
            <button className="btn-primary w-full py-4">Enviar Mensaje</button>
          </form>
        </div>
      </div>
    </div>
  </section>
);

const BlogPage = () => (
  <section className="section-padding pt-32">
    <div className="max-w-7xl mx-auto">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-6xl font-display font-bold mb-6">Insights & Noticias</h1>
        <p className="text-slate-400 max-w-2xl mx-auto text-lg">
          Explora las últimas tendencias en tecnología hotelera, IA y gestión de revenue.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {[
          {
            title: "Cómo la IA está transformando el RevPAR en 2024",
            category: "Revenue",
            date: "Mar 05, 2024",
            img: "https://picsum.photos/seed/hotel1/800/600"
          },
          {
            title: "Gestión de riesgos: El factor olvidado en la rentabilidad",
            category: "Operaciones",
            date: "Feb 28, 2024",
            img: "https://picsum.photos/seed/hotel2/800/600"
          },
          {
            title: "Debacu lanza su nuevo motor de análisis predictivo",
            category: "Producto",
            date: "Feb 15, 2024",
            img: "https://picsum.photos/seed/hotel3/800/600"
          }
        ].map((post, i) => (
          <div key={i} className="glass-card overflow-hidden glass-card-hover group cursor-pointer">
            <div className="h-48 overflow-hidden relative">
              <img src={post.img} alt={post.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
              <div className="absolute top-4 left-4 px-3 py-1 bg-blue-600 text-[10px] font-bold rounded-full uppercase tracking-widest">
                {post.category}
              </div>
            </div>
            <div className="p-6">
              <p className="text-[10px] text-slate-500 font-bold mb-2">{post.date}</p>
              <h3 className="text-lg font-bold mb-4 group-hover:text-blue-400 transition-colors">{post.title}</h3>
              <div className="flex items-center gap-2 text-blue-400 text-xs font-bold">
                Leer más <ArrowRight size={14} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Footer = ({ setCurrentPage }: { setCurrentPage: (p: Page) => void }) => (
  <footer className="py-24 px-6 border-t border-white/[0.08] bg-slate-950/80">
    <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-12 mb-16">
      <div className="col-span-2">
        <div className="flex items-center gap-2 text-2xl font-bold mb-6">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
            <div className="w-4 h-4 bg-white rounded-sm" />
          </div>
          debacu
        </div>
        <p className="text-slate-500 text-sm max-w-xs mb-8">
          Inteligencia artificial desarrollada específicamente para el sector hospitality. Profesionalizando la toma de decisiones.
        </p>
        <div className="flex items-center gap-4">
          <Twitter size={20} className="text-slate-500 hover:text-white cursor-pointer transition-colors" />
          <Linkedin size={20} className="text-slate-500 hover:text-white cursor-pointer transition-colors" />
          <Github size={20} className="text-slate-500 hover:text-white cursor-pointer transition-colors" />
        </div>
      </div>
      
      <div>
        <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-6">Producto</h4>
        <ul className="space-y-4 text-sm text-slate-500">
          <li><button onClick={() => setCurrentPage('product')} className="hover:text-white">Características</button></li>
          <li><button onClick={() => setCurrentPage('technology')} className="hover:text-white">Tecnología</button></li>
          <li><button onClick={() => setCurrentPage('architecture')} className="hover:text-white">Arquitectura</button></li>
          <li><button onClick={() => setCurrentPage('docs')} className="hover:text-white">Documentación</button></li>
          <li><button onClick={() => setCurrentPage('pricing')} className="hover:text-white">Planes</button></li>
          <li><button onClick={() => setCurrentPage('request-access')} className="hover:text-white font-bold text-blue-400">Solicitar acceso</button></li>
        </ul>
      </div>

      <div>
        <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-6">Compañía</h4>
        <ul className="space-y-4 text-sm text-slate-500">
          <li><button className="hover:text-white">Sobre nosotros</button></li>
          <li><button onClick={() => setCurrentPage('blog')} className="hover:text-white">Blog</button></li>
          <li><button className="hover:text-white">Carreras</button></li>
          <li><button onClick={() => setCurrentPage('contact')} className="hover:text-white">Contacto</button></li>
        </ul>
      </div>

      <div>
        <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-6">Legal</h4>
        <ul className="space-y-4 text-sm text-slate-500">
          <li><button className="hover:text-white">Privacidad</button></li>
          <li><button className="hover:text-white">Términos</button></li>
          <li><button className="hover:text-white">Cookies</button></li>
        </ul>
      </div>
    </div>
    
    <div className="max-w-7xl mx-auto pt-8 border-t border-white/[0.05] flex flex-col md:flex-row items-center justify-between gap-4">
      <p className="text-xs text-slate-600">© 2024 Debacu AI Technologies S.L. Todos los derechos reservados.</p>
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <Globe size={14} />
        <span>Español (España)</span>
      </div>
    </div>
  </footer>
);

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  const renderPage = () => {
    switch (currentPage) {
      case 'pricing': return <PricingPage />;
      case 'contact': return <ContactPage />;
      case 'blog': return <BlogPage />;
      case 'technology': return <TechnologyPage setCurrentPage={setCurrentPage} />;
      case 'docs': return <TechnicalDocs setCurrentPage={setCurrentPage} />;
      case 'architecture': return <ArchitecturePage setCurrentPage={setCurrentPage} />;
      case 'product': return <ProductPage setCurrentPage={setCurrentPage} />;
      case 'request-access': return <AccessRequestPage onBack={() => setCurrentPage('home')} />;
      case 'login': return <LoginPage onBack={() => setCurrentPage('home')} onGoToRequest={() => setCurrentPage('request-access')} />;
      case 'home':
      default:
        return (
          <>
            {/* Hero Section */}
            <main className="pt-32 pb-24 px-6 relative overflow-hidden">
              {/* Background Dashboard Effect */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-[700px] opacity-15 blur-[100px] pointer-events-none -z-10 select-none overflow-hidden">
                <div className="scale-125 origin-top transform-gpu">
                  <DashboardMockup />
                </div>
              </div>

              <div className="max-w-7xl mx-auto text-center relative z-10">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-8">
                    <Zap size={12} />
                    Nueva Era Hospitality
                  </div>
                  <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold tracking-tight mb-8 max-w-5xl mx-auto leading-[1.1] text-gradient">
                    Inteligencia artificial para hoteles: riesgo, revenue y decisión operativa
                  </h1>
                  <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto mb-12">
                    Debacu es una plataforma SaaS que analiza datos operativos, incidencias y comportamiento para ayudar a los hoteles a detectar patrones, prevenir problemas y optimizar el revenue.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
                    <button 
                      onClick={() => setCurrentPage('request-access')}
                      className="btn-primary text-lg px-8 py-4 w-full sm:w-auto"
                    >
                      Solicitar acceso <ChevronRight size={20} />
                    </button>
                    <button onClick={() => setCurrentPage('technology')} className="btn-secondary text-lg px-8 py-4 w-full sm:w-auto">
                      Ver cómo funciona <ChevronRight size={20} />
                    </button>
                  </div>
                </motion.div>

                {/* Dashboard Preview */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 40 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="relative group"
                >
                  <div className="absolute -inset-10 bg-blue-600/20 blur-[100px] rounded-full opacity-50 -z-10 group-hover:opacity-70 transition-opacity" />
                  <DashboardMockup />
                  <p className="mt-12 text-slate-500 text-sm font-medium">
                    Para hoteles, apartamentos y alojamientos que buscan más control y mayor rentabilidad.
                  </p>
                </motion.div>
              </div>
            </main>

            <ProblemSection />
            <FeaturesSection />
            <HowItWorks />
            <TechSection />
            <UseCases />
            <TargetAudience />
            <InnovationSection />
          </>
        );
    }
  };

  return (
    <div className="relative min-h-screen">
      <Navbar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPage}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.3 }}
        >
          {renderPage()}
        </motion.div>
      </AnimatePresence>

      <Footer setCurrentPage={setCurrentPage} />
    </div>
  );
}
