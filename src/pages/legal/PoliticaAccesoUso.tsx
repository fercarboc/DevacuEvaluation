import React from "react";
import LegalLayout from "./LegalLayout";

export default function PoliticaAccesoUso() {
  return (
    <LegalLayout title="Política de Acceso y Uso Profesional" subtitle="Acceso restringido, trazabilidad y uso interno">
      <h2 className="text-lg font-semibold">1. Acceso restringido</h2>
      <p className="mt-2">
        Debacu Evaluation360 es una plataforma privada destinada a profesionales del sector alojamiento. El acceso se concede
        de forma controlada a organizaciones verificadas y usuarios autorizados.
      </p>

      <h2 className="mt-8 text-lg font-semibold">2. Uso interno y no público</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>No es un registro público, no es indexable, ni está pensado para difusión externa.</li>
        <li>La información está orientada a protocolos internos y mejora operativa.</li>
        <li>Se prohíbe publicar, compartir o redistribuir contenidos fuera de la organización.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">3. Criterios estructurados</h2>
      <p className="mt-2">
        El sistema fomenta el registro por motivos/criterios estructurados, minimizando opiniones y evitando datos excesivos.
        El cliente se compromete a registrar solo información pertinente y verificable.
      </p>

      <h2 className="mt-8 text-lg font-semibold">4. Auditoría y trazabilidad</h2>
      <p className="mt-2">
        Se registran acciones relevantes (consultas, altas, modificaciones) para control interno, seguridad y cumplimiento.
        El cliente acepta la existencia de logs de auditoría asociados a su cuenta.
      </p>

      <h2 className="mt-8 text-lg font-semibold">5. Prohibiciones</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>Uso discriminatorio o contrario a derechos fundamentales.</li>
        <li>Uso como “lista pública” o exposición de terceros.</li>
        <li>Extracción masiva o automatizada no autorizada.</li>
        <li>Introducir datos sensibles innecesarios o no pertinentes.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">6. Medidas ante abuso</h2>
      <p className="mt-2">
        En caso de uso indebido, el titular podrá suspender o cancelar accesos, sin perjuicio de acciones legales si procede.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: [FECHA].
      </p>
    </LegalLayout>
  );
}
