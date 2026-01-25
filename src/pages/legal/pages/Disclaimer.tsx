import React from "react";
import LegalPageLayout from "../LegalPageLayout";

export default function Disclaimer() {
  return (
    <LegalPageLayout
      title="Cláusulas y Disclaimer"
      subtitle="Aclaraciones sobre el alcance, naturaleza y uso de la Plataforma"
    >
      <h2 className="text-lg font-semibold">1. Naturaleza privada del servicio</h2>
      <p className="mt-2">
        Debacu Evaluation360 es una plataforma de <b>uso profesional y privado</b>,
        destinada exclusivamente a apoyar la gestión interna de establecimientos
        del sector alojamiento. La Plataforma no está diseñada para su acceso por
        el público general ni para su difusión externa.
      </p>
      <p className="mt-2">
        El contenido gestionado en la Plataforma no es indexable por motores de
        búsqueda ni accesible para terceros no autorizados.
      </p>

      <h2 className="mt-8 text-lg font-semibold">2. No es un registro público ni una base oficial</h2>
      <p className="mt-2">
        La Plataforma <b>no constituye un registro público</b>, ni una base de datos
        oficial, ni un fichero de solvencia patrimonial o morosidad, ni un sistema
        de calificación crediticia, ni una fuente de información pública.
      </p>
      <p className="mt-2">
        Debacu Evaluation360 no actúa como autoridad pública, organismo regulador
        ni entidad certificadora, ni emite acreditaciones oficiales de ningún tipo.
      </p>

      <h2 className="mt-8 text-lg font-semibold">3. Alcance informativo y operativo</h2>
      <p className="mt-2">
        La información gestionada en la Plataforma tiene un <b>carácter
        informativo y operativo</b>, orientado a apoyar procesos internos,
        protocolos de actuación y decisiones organizativas dentro del ámbito
        profesional del cliente.
      </p>
      <p className="mt-2">
        La Plataforma no sustituye el criterio humano, la valoración profesional
        ni las decisiones internas de los establecimientos usuarios.
      </p>

      <h2 className="mt-8 text-lg font-semibold">4. Responsabilidad sobre el contenido</h2>
      <p className="mt-2">
        El contenido registrado en la Plataforma es introducido y gestionado por
        los propios usuarios en el marco de su operativa interna. Cada
        establecimiento es responsable de la exactitud, pertinencia y uso del
        contenido que decide registrar.
      </p>
      <p className="mt-2">
        Debacu Evaluation360 actúa como proveedor tecnológico y no valida de forma
        individual el contenido registrado por los usuarios, sin perjuicio de
        medidas de control, moderación o auditoría cuando resulte necesario.
      </p>

      <h2 className="mt-8 text-lg font-semibold">5. Recomendaciones de uso responsable</h2>
      <p className="mt-2">
        Se recomienda registrar únicamente hechos operativos relevantes y utilizar
        criterios estructurados definidos por la Plataforma, evitando:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li>Opiniones personales o valoraciones subjetivas.</li>
        <li>Lenguaje ofensivo, inapropiado o innecesario.</li>
        <li>Datos excesivos o no pertinentes para fines operativos.</li>
        <li>Información sensible que no sea estrictamente necesaria.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">6. Prohibición de uso discriminatorio</h2>
      <p className="mt-2">
        Queda expresamente prohibido utilizar la Plataforma con finalidades
        discriminatorias, estigmatizantes o contrarias a los derechos
        fundamentales de las personas, así como para fines ilícitos o abusivos.
      </p>

      <h2 className="mt-8 text-lg font-semibold">7. Ausencia de garantías absolutas</h2>
      <p className="mt-2">
        La Plataforma se ofrece “tal cual”, con esfuerzos razonables para mantener
        su disponibilidad, seguridad y funcionamiento, sin que pueda garantizarse
        la ausencia total de errores, interrupciones o incidencias técnicas.
      </p>

      <h2 className="mt-8 text-lg font-semibold">8. Limitación de responsabilidad</h2>
      <p className="mt-2">
        En la medida permitida por la normativa aplicable, Debacu Evaluation360 no
        será responsable de decisiones adoptadas por los usuarios basadas en la
        información gestionada en la Plataforma, ni de daños indirectos,
        consecuenciales o pérdidas derivadas del uso del servicio.
      </p>

      <h2 className="mt-8 text-lg font-semibold">9. Interpretación conjunta</h2>
      <p className="mt-2">
        El presente Disclaimer debe interpretarse de forma conjunta con el Aviso
        Legal, la Política de Privacidad, la Política de Seguridad y los Términos y
        Condiciones, que regulan de manera integral el acceso y uso de la
        Plataforma.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: 25/01/2026.
      </p>
    </LegalPageLayout>
  );
}
