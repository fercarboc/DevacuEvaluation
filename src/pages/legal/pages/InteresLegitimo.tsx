import React from "react";
import LegalPageLayout from "../LegalPageLayout";

export default function InteresLegitimo() {
  return (
    <LegalPageLayout
      title="Análisis de Interés Legítimo (LIA) · RGPD art. 6.1.f"
      subtitle="Base jurídica, test de necesidad y ponderación, garantías y límites del tratamiento"
    >
      <h2 className="text-lg font-semibold">1. Finalidad del tratamiento</h2>
      <p className="mt-2">
        Debacu Evaluation360 es una plataforma privada de <b>uso profesional</b>,
        orientada a la <b>prevención de riesgos operativos</b>, la{" "}
        <b>trazabilidad interna</b> y la <b>gestión estructurada de incidencias</b>{" "}
        en alojamientos. El objetivo es ayudar a los establecimientos a aplicar
        protocolos internos de forma coherente y documentada, con controles de
        acceso, auditoría y minimización.
      </p>
      <p className="mt-2">
        La Plataforma <b>no</b> se concibe como un registro público ni como un
        sistema de reputación o publicación de datos. La información se trata en
        un entorno restringido y bajo roles.
      </p>

      <h2 className="mt-8 text-lg font-semibold">2. Interés legítimo (art. 6.1.f RGPD)</h2>
      <p className="mt-2">
        Determinados tratamientos pueden basarse en el{" "}
        <b>interés legítimo</b> del Cliente (alojamiento) y/o del proveedor
        tecnológico para:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li>Prevenir y gestionar incidencias operativas y de seguridad.</li>
        <li>Detectar reincidencias relevantes para la operativa interna.</li>
        <li>Reducir abuso y mejorar la trazabilidad y el control de acceso.</li>
        <li>Proteger a la organización, personal, instalaciones y terceros.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">3. Test de necesidad</h2>
      <p className="mt-2">
        Para cumplir las finalidades anteriores, puede ser necesario tratar
        determinados <b>identificadores</b> (p. ej., documento, email, teléfono)
        porque permiten vincular incidencias a una misma persona y evitar
        duplicidades o evasiones. Sin un identificador estable, la detección de
        reincidencia y la trazabilidad se vuelven poco fiables.
      </p>
      <p className="mt-2">
        Se aplica el principio de <b>minimización</b>: se recomienda registrar
        únicamente lo estrictamente pertinente, evitando datos excesivos o no
        necesarios.
      </p>

      <h2 className="mt-8 text-lg font-semibold">4. Test de ponderación</h2>
      <p className="mt-2">
        Se valora el impacto sobre los derechos y libertades de las personas
        afectadas y se aplican salvaguardas para reducir el riesgo. La base de
        interés legítimo exige que:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li>La finalidad sea lícita y legítima.</li>
        <li>El tratamiento sea necesario y proporcional.</li>
        <li>
          Se implementen medidas técnicas y organizativas que reduzcan el impacto.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">5. Garantías y medidas de minimización</h2>
      <p className="mt-2">
        Para reforzar la proporcionalidad y limitar el impacto, se aplican (o se
        prevén) medidas como:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li>
          <b>Acceso restringido</b> y alta controlada (no acceso público).
        </li>
        <li>
          <b>Control por roles</b> y principio de mínimos privilegios.
        </li>
        <li>
          <b>Enmascarado</b> / presentación limitada de datos en vistas
          inter-organización cuando aplique.
        </li>
        <li>
          <b>Auditoría y trazabilidad</b> de acciones relevantes (consultas,
          exportaciones, cambios, etc.).
        </li>
        <li>
          <b>Limitaciones</b> frente a extracción masiva o automatizada no
          autorizada.
        </li>
        <li>
          Recomendación expresa de <b>evitar categorías especiales</b> (art. 9
          RGPD) salvo estricta necesidad y base legal adecuada.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">6. Conservación (retención)</h2>
      <p className="mt-2">
        La conservación debe ser <b>limitada</b> y coherente con la finalidad
        operativa y de seguridad. Como criterio orientativo, los registros
        relacionados con incidencias pueden conservarse hasta <b>5 años</b> desde
        la última incidencia o desde el último evento relevante, salvo que una
        obligación legal exija plazos distintos o que sea necesario conservarlos
        durante más tiempo para la defensa de reclamaciones.
      </p>

      <h2 className="mt-8 text-lg font-semibold">7. Información y derechos</h2>
      <p className="mt-2">
        Cuando proceda, el Cliente (hotel/alojamiento) deberá asegurar el
        cumplimiento del deber de información y la atención de derechos (acceso,
        rectificación, supresión, oposición, limitación y portabilidad) en su
        condición de Responsable del tratamiento, con la asistencia del
        proveedor cuando actúe como Encargado en los términos del art. 28 RGPD.
      </p>
      <p className="mt-2">
        La <b>oposición</b> al tratamiento basado en interés legítimo se evaluará
        caso a caso, ponderando la situación concreta y los motivos legítimos
        imperiosos que pudieran prevalecer, si aplica.
      </p>

      <h2 className="mt-8 text-lg font-semibold">8. Conclusión</h2>
      <p className="mt-2">
        Con las garantías descritas, el tratamiento orientado a prevención de
        riesgos y trazabilidad puede apoyarse en <b>interés legítimo</b> cuando
        resulte necesario y proporcional, manteniendo un enfoque restrictivo,
        de minimización y seguridad.
      </p>

      {/* ===========================
         ANEXO I (NUEVO)
         =========================== */}
      <h2 className="mt-10 text-lg font-semibold">
        Anexo I · Uso de sistemas de prevención de riesgo y trazabilidad
      </h2>

      <p className="mt-2">
        Con la finalidad de prevenir fraudes, daños materiales, impagos y
        conductas reiteradas que puedan afectar a la seguridad del
        establecimiento, este alojamiento utiliza sistemas internos de evaluación
        y gestión de incidencias operativas.
      </p>

      <p className="mt-2">
        Dichos sistemas pueden implicar el tratamiento de datos identificativos
        mínimos (como documento identificativo, teléfono o correo electrónico)
        asociados a incidencias ocurridas durante la estancia.
      </p>

      <p className="mt-2">
        La base jurídica del tratamiento es el interés legítimo del
        establecimiento en proteger su patrimonio, empleados y clientes, conforme
        al artículo 6.1.f del Reglamento (UE) 2016/679.
      </p>

      <p className="mt-2">
        La información no es pública ni accesible al público general y se utiliza
        exclusivamente con fines internos y de prevención.
      </p>

      <p className="mt-2">
        El interesado podrá ejercer sus derechos de acceso, rectificación,
        oposición o limitación dirigiéndose a <b>[email del hotel]</b>.
      </p>

      <h2 className="mt-8 text-lg font-semibold">9. Contacto</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>Cuestiones legales: legal@debacu.com</li>
        <li>Privacidad y seguridad: privacidad@debacu.com</li>
      </ul>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: 25/01/2026.
      </p>
    </LegalPageLayout>
  );
}
