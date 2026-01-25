import React from "react";
import LegalPageLayout from "../LegalPageLayout";

export default function Seguridad() {
  return (
    <LegalPageLayout
      title="Seguridad y Auditoría"
      subtitle="Medidas técnicas y organizativas aplicables a la Plataforma"
    >
      <h2 className="text-lg font-semibold">1. Marco general</h2>
      <p className="mt-2">
        Debacu Evaluation360 es una plataforma de uso profesional que adopta
        medidas técnicas y organizativas razonables orientadas a garantizar un
        nivel de seguridad adecuado al riesgo, de conformidad con el Reglamento
        (UE) 2016/679 (RGPD) y la normativa aplicable.
      </p>
      <p className="mt-2">
        Las medidas descritas tienen carácter preventivo y están diseñadas para
        proteger la confidencialidad, integridad y disponibilidad de la
        información tratada dentro de la Plataforma.
      </p>

      <h2 className="mt-8 text-lg font-semibold">2. Control de acceso</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          Acceso restringido a usuarios profesionales previamente autorizados.
        </li>
        <li>
          Asignación de roles y permisos conforme al principio de mínimos
          privilegios.
        </li>
        <li>
          Separación lógica de la información por organización cuando resulte
          aplicable.
        </li>
        <li>
          Mecanismos de autenticación y gestión de sesiones acordes al estado de
          la técnica.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">3. Registro de actividad (logs)</h2>
      <p className="mt-2">
        Con fines de seguridad, control interno y trazabilidad, la Plataforma
        puede registrar determinados eventos de actividad relacionados con el
        uso del sistema.
      </p>
      <p className="mt-2">
        Dichos registros pueden incluir, entre otros, accesos, consultas,
        operaciones relevantes sobre datos, eventos de autenticación y acciones
        administrativas, siempre dentro de un contexto profesional y limitado a
        finalidades legítimas.
      </p>
      <p className="mt-2">
        Los logs no se utilizan para evaluación automática de personas ni para
        fines distintos de la seguridad, el control interno y la mejora
        operativa.
      </p>

      <h2 className="mt-8 text-lg font-semibold">4. Auditoría y trazabilidad</h2>
      <p className="mt-2">
        La Plataforma incorpora mecanismos de trazabilidad que permiten conocer
        de forma interna y controlada las acciones relevantes realizadas por los
        usuarios, con el objetivo de:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li>Detectar usos indebidos o no autorizados.</li>
        <li>Facilitar revisiones internas de seguridad.</li>
        <li>Apoyar el cumplimiento de políticas operativas.</li>
        <li>Mejorar la calidad y coherencia de los procesos internos.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">5. Protección de la información</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          Uso de comunicaciones cifradas (por ejemplo, HTTPS) para el acceso a la
          Plataforma.
        </li>
        <li>
          Medidas orientadas a evitar accesos no autorizados, pérdida o
          alteración de la información.
        </li>
        <li>
          Limitación del acceso a datos conforme al rol del usuario y la
          finalidad profesional del servicio.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">6. Gestión de incidentes de seguridad</h2>
      <p className="mt-2">
        Debacu dispone de procedimientos internos orientados a la detección,
        análisis y gestión de incidentes de seguridad que puedan afectar a la
        Plataforma.
      </p>
      <p className="mt-2">
        En caso de que un incidente suponga un riesgo para los derechos y
        libertades de las personas físicas, se actuará conforme a lo previsto en
        la normativa aplicable, incluyendo, cuando proceda, las comunicaciones a
        las autoridades competentes o a los interesados.
      </p>

      <h2 className="mt-8 text-lg font-semibold">7. Responsabilidades del cliente</h2>
      <p className="mt-2">
        El cliente usuario de la Plataforma es responsable de:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li>
          Gestionar adecuadamente los accesos de su organización y su personal.
        </li>
        <li>
          Mantener la confidencialidad de las credenciales asignadas.
        </li>
        <li>
          Evitar el uso compartido de cuentas entre varios usuarios.
        </li>
        <li>
          Introducir únicamente información pertinente y necesaria para fines
          operativos.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">8. Limitaciones</h2>
      <p className="mt-2">
        Ninguna medida de seguridad es infalible. La Plataforma se ofrece con un
        nivel de protección acorde al estado de la técnica y al riesgo
        razonablemente previsible, sin que pueda garantizarse la ausencia total
        de incidentes o interrupciones.
      </p>

      <h2 className="mt-8 text-lg font-semibold">9. Revisión y mejora continua</h2>
      <p className="mt-2">
        Las medidas de seguridad podrán ser revisadas y actualizadas
        periódicamente para adaptarse a cambios normativos, técnicos u
        operativos, manteniendo siempre un enfoque de mejora continua.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: 25/01/2026.
      </p>
    </LegalPageLayout>
  );
}
