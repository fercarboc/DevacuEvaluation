import React from "react";
import LegalLayout from "./LegalLayout";

export default function Privacidad() {
  return (
    <LegalLayout title="Política de Privacidad" subtitle="Información sobre el tratamiento de datos personales">
      <h2 className="text-lg font-semibold">1. Responsable del tratamiento</h2>
      <ul className="mt-3 list-disc pl-6">
        <li><b>Responsable:</b> [DEBACU HOTELS SL]</li>
        <li><b>CIF/NIF:</b> [B-55381214]</li>
        <li><b>Dirección:</b> [C/CANTALEJO,13-1º A]</li>
        <li><b>Email:</b> [informacion@debacu.com]</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">2. Finalidades</h2>
      <p className="mt-2">Tratamos datos para:</p>
      <ul className="mt-3 list-disc pl-6">
        <li>Gestionar el alta, autenticación, acceso y administración de cuentas.</li>
        <li>Permitir consultas y registro de incidencias con trazabilidad y auditoría interna.</li>
        <li>Gestionar comunicaciones operativas y soporte.</li>
        <li>Gestionar la suscripción, facturación y pagos (p.ej. Stripe) cuando aplique.</li>
        <li>Mejorar seguridad: prevención de fraude, control de acceso, registro de actividad (logs).</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">3. Base jurídica</h2>
      <ul className="mt-3 list-disc pl-6">
        <li><b>Ejecución de contrato</b> (art. 6.1.b RGPD): prestación del servicio y gestión de cuenta.</li>
        <li><b>Interés legítimo</b> (art. 6.1.f RGPD): seguridad, prevención de abuso, auditoría y trazabilidad.</li>
        <li><b>Obligación legal</b> (art. 6.1.c RGPD): facturación y obligaciones contables/fiscales.</li>
        <li><b>Consentimiento</b> (art. 6.1.a RGPD): cookies no necesarias, comunicaciones comerciales si se aplican.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">4. Tipos de datos</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>Datos de cuenta: email, nombre, empresa, teléfono (opcional).</li>
        <li>Datos de acceso: credenciales y tokens (almacenamiento seguro).</li>
        <li>Datos de facturación: razón social, CIF, dirección, referencias de pago (no almacenamos la tarjeta).</li>
        <li>Datos de uso: logs, auditoría, acciones realizadas, fechas, IP aproximada y dispositivo (si aplica).</li>
        <li>Datos registrados por el cliente: incidencias con criterios estructurados definidos por la Plataforma.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">5. Minimización y configuración</h2>
      <p className="mt-2">
        La Plataforma está diseñada con criterios de minimización: se fomenta el registro estructurado y necesario para
        fines operativos. El cliente debe evitar introducir datos excesivos o no pertinentes.
      </p>

      <h2 className="mt-8 text-lg font-semibold">6. Destinatarios</h2>
      <p className="mt-2">
        No cedemos datos a terceros salvo obligación legal o para la prestación del servicio mediante proveedores:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li><b>Pasarela de pago:</b> Stripe (facturación y suscripciones).</li>
        <li><b>Infraestructura / hosting:</b> [PROVEEDOR] (p.ej. Supabase/Cloud).</li>
        <li><b>Correo transaccional:</b> [PROVEEDOR] (p.ej. Brevo) si se utiliza.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">7. Transferencias internacionales</h2>
      <p className="mt-2">
        Algunos proveedores pueden procesar datos fuera del EEE. En tal caso, se aplicarán garantías adecuadas
        (p.ej. Cláusulas Contractuales Tipo) según corresponda.
      </p>

      <h2 className="mt-8 text-lg font-semibold">8. Plazos de conservación</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>Cuenta: durante la relación contractual y mientras sea necesaria para el servicio.</li>
        <li>Facturación: según plazos legales aplicables.</li>
        <li>Logs y auditoría: el tiempo estrictamente necesario para seguridad y trazabilidad (p.ej. 6–24 meses).</li>
        <li>Incidencias: según configuración del cliente o política interna, evitando conservación indefinida sin justificación.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">9. Derechos</h2>
      <p className="mt-2">
        Puedes ejercer acceso, rectificación, supresión, oposición, limitación y portabilidad enviando un email a
        <b> [EMAIL PRIVACIDAD]</b>, acreditando identidad. También puedes reclamar ante la AEPD.
      </p>

      <h2 className="mt-8 text-lg font-semibold">10. Seguridad</h2>
      <p className="mt-2">
        Adoptamos medidas técnicas y organizativas razonables: control de acceso, cifrado en tránsito, segregación de datos,
        registros de auditoría y políticas de mínimos privilegios.
      </p>

      <h2 className="mt-8 text-lg font-semibold">11. Cambios</h2>
      <p className="mt-2">
        Podremos actualizar esta política por razones legales o técnicas. Publicaremos la versión vigente en este sitio.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: [FECHA].
      </p>
    </LegalLayout>
  );
}
