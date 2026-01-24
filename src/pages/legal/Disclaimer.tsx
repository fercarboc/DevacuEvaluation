import React from "react";
import LegalLayout from "./LegalLayout";

export default function Disclaimer() {
  return (
    <LegalLayout title="Cláusulas y Disclaimer" subtitle="Aclaraciones de uso y alcance">
      <h2 className="text-lg font-semibold">1. No es un registro público</h2>
      <p className="mt-2">
        Debacu Evaluation360 es una herramienta privada orientada a uso profesional interno. No está destinada a difusión
        pública ni a indexación.
      </p>

      <h2 className="mt-8 text-lg font-semibold">2. No es una autoridad ni base oficial</h2>
      <p className="mt-2">
        La Plataforma no representa una autoridad pública ni emite certificaciones oficiales. Su finalidad es aportar
        trazabilidad y estructura a procesos internos del cliente.
      </p>

      <h2 className="mt-8 text-lg font-semibold">3. Enfoque operativo</h2>
      <p className="mt-2">
        Se recomienda registrar hechos operativos y criterios estructurados, evitando opiniones, expresiones ofensivas
        o información innecesaria. El cliente es responsable de su uso interno y cumplimiento normativo.
      </p>

      <h2 className="mt-8 text-lg font-semibold">4. Prohibición de uso discriminatorio</h2>
      <p className="mt-2">
        Queda prohibido el uso de la Plataforma para finalidades discriminatorias o contrarias a derechos fundamentales.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: [FECHA].
      </p>
    </LegalLayout>
  );
}
