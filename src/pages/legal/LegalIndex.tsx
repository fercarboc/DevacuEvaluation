import React from "react";
import { Link } from "react-router-dom";
import LegalLayout from "./LegalLayout";

const Item = ({ to, title, desc }: { to: string; title: string; desc: string }) => (
  <Link
    to={to}
    className="block rounded-xl border border-slate-200 bg-slate-50 p-4 hover:bg-white"
  >
    <div className="text-sm font-semibold text-slate-900">{title}</div>
    <div className="mt-1 text-sm text-slate-600">{desc}</div>
  </Link>
);

export default function LegalIndex() {
  return (
    <LegalLayout
      title="Centro legal"
      subtitle="Documentos informativos para uso profesional y acceso restringido."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Item to="/legal/aviso-legal" title="Aviso Legal" desc="Titularidad, condiciones de uso y limitación de responsabilidad." />
        <Item to="/legal/privacidad" title="Política de Privacidad" desc="Tratamiento de datos, base legal, derechos y medidas." />
        <Item to="/legal/cookies" title="Política de Cookies" desc="Cookies técnicas y analíticas, configuración y consentimiento." />
        <Item to="/legal/terminos" title="Términos y Condiciones" desc="Condiciones de acceso, cuentas, pagos, suscripción y cancelación." />
        <Item to="/legal/politica-acceso-uso" title="Política de Acceso y Uso Profesional" desc="No público, no indexable, uso interno, trazabilidad y auditoría." />
        <Item to="/legal/dpa" title="Encargo de Tratamiento (DPA)" desc="Modelo para clientes B2B: responsable/encargado, subencargados, medidas." />
        <Item to="/legal/seguridad" title="Seguridad y Auditoría" desc="Buenas prácticas, controles, retención, logs y gestión de incidentes." />
        <Item to="/legal/disclaimer" title="Cláusulas y Disclaimer" desc="No lista pública, no autoridad, uso orientado a operación." />
      </div>
    </LegalLayout>
  );
}
