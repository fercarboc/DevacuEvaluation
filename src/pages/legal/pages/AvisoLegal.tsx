import React from "react";
import LegalPageLayout from "../LegalPageLayout";

export default function AvisoLegal() {
  return (
    <LegalPageLayout
      title="Aviso Legal"
      subtitle="Información del titular, condiciones de acceso y uso del sitio"
    >
      <h2 className="text-lg font-semibold">1. Titularidad del sitio</h2>
      <p className="mt-2">
        En cumplimiento de lo dispuesto en la normativa aplicable, se informa que
        el presente sitio web y la plataforma digital denominada
        <b> “Debacu Evaluation360”</b> (en adelante, la “Plataforma”) son titularidad
        de:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li><b>Titular / Razón social:</b> DEBACU HOTELS S.L.</li>
        <li><b>CIF:</b> B-55381214</li>
        <li><b>Domicilio social:</b> C/ Cantalejo, 13 – 1º A</li>
        <li><b>Email de contacto:</b> informacion@debacu.com</li>
        <li><b>Teléfono:</b> +34 672 336 572</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">2. Objeto y ámbito del servicio</h2>
      <p className="mt-2">
        La Plataforma proporciona un entorno digital de <b>uso estrictamente
        profesional</b>, dirigido a establecimientos hoteleros y alojamientos
        turísticos, con la finalidad de apoyar la <b>gestión operativa interna</b>,
        la trazabilidad de incidencias y la aplicación de protocolos internos.
      </p>
      <p className="mt-2">
        La Plataforma <b>no constituye un servicio público</b>, no es accesible de
        forma abierta ni está destinada a la consulta general por terceros
        ajenos al entorno profesional autorizado.
      </p>

      <h2 className="mt-8 text-lg font-semibold">3. Naturaleza privada del acceso</h2>
      <p className="mt-2">
        El acceso a la Plataforma está restringido a usuarios profesionales
        autorizados, previa validación y creación de cuenta, y puede estar
        sujeto a criterios internos de admisión, suspensión o cancelación.
      </p>
      <p className="mt-2">
        El titular se reserva el derecho a denegar o retirar el acceso a la
        Plataforma, en cualquier momento, cuando se detecte un uso contrario a
        la finalidad profesional del servicio o a la normativa aplicable.
      </p>

      <h2 className="mt-8 text-lg font-semibold">4. Obligaciones del usuario</h2>
      <p className="mt-2">
        El usuario se compromete a utilizar la Plataforma de forma diligente,
        lícita y conforme a la buena fe, quedando expresamente prohibido:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li>Difundir públicamente información obtenida a través de la Plataforma.</li>
        <li>Utilizar el servicio con fines ajenos a la operativa profesional.</li>
        <li>Introducir datos falsos, inexactos o no pertinentes.</li>
        <li>Realizar accesos automatizados, scraping o extracciones masivas no autorizadas.</li>
        <li>Emplear la Plataforma con fines discriminatorios, difamatorios o ilícitos.</li>
        <li>Compartir credenciales o permitir accesos no autorizados.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">5. Exclusión de carácter público o crediticio</h2>
      <p className="mt-2">
        La Plataforma <b>no es un fichero de solvencia patrimonial</b>, ni un
        registro de morosidad, ni un sistema de calificación crediticia, ni
        produce efectos jurídicos automáticos sobre las personas.
      </p>
      <p className="mt-2">
        La información tratada se limita al ámbito interno y profesional de los
        establecimientos usuarios y se utiliza exclusivamente como apoyo a la
        gestión operativa y a la mejora de procesos internos.
      </p>

      <h2 className="mt-8 text-lg font-semibold">6. Propiedad intelectual e industrial</h2>
      <p className="mt-2">
        Todos los contenidos de la Plataforma, incluyendo a título enunciativo
        y no limitativo textos, diseños, logotipos, marcas, software, bases de
        datos, interfaces y elementos gráficos, son titularidad del titular o
        de terceros licenciantes y se encuentran protegidos por la normativa
        vigente en materia de propiedad intelectual e industrial.
      </p>
      <p className="mt-2">
        Queda prohibida su reproducción, distribución, comunicación pública,
        transformación o explotación sin autorización expresa y por escrito del
        titular.
      </p>

      <h2 className="mt-8 text-lg font-semibold">7. Responsabilidad y limitaciones</h2>
      <p className="mt-2">
        La Plataforma se ofrece “tal cual”, con esfuerzos razonables para
        garantizar su disponibilidad, continuidad y seguridad, sin que pueda
        garantizarse la ausencia absoluta de interrupciones, errores o
        incidencias técnicas.
      </p>
      <p className="mt-2">
        El titular no se responsabiliza del uso que los usuarios realicen de la
        información en su propia operativa, ni de las decisiones internas que
        adopten basándose en dicha información.
      </p>

      <h2 className="mt-8 text-lg font-semibold">8. Enlaces a terceros</h2>
      <p className="mt-2">
        El sitio web puede contener enlaces a páginas o servicios de terceros.
        El titular no ejerce control sobre dichos contenidos y no asume
        responsabilidad alguna respecto a los mismos ni a sus políticas.
      </p>

      <h2 className="mt-8 text-lg font-semibold">9. Protección de datos personales</h2>
      <p className="mt-2">
        El tratamiento de los datos personales se rige por lo dispuesto en la
        Política de Privacidad, que forma parte integrante del presente Aviso
        Legal y se encuentra disponible en este mismo sitio.
      </p>

      <h2 className="mt-8 text-lg font-semibold">10. Modificaciones</h2>
      <p className="mt-2">
        El titular se reserva el derecho a modificar el presente Aviso Legal
        cuando resulte necesario por motivos legales, técnicos u operativos.
        La versión vigente será la publicada en el sitio en cada momento.
      </p>

      <h2 className="mt-8 text-lg font-semibold">11. Legislación y jurisdicción aplicable</h2>
      <p className="mt-2">
        El presente Aviso Legal se rige por la legislación española. Para la
        resolución de cualquier controversia que pudiera derivarse del acceso o
        uso de la Plataforma, las partes se someterán a los juzgados y tribunales
        que resulten legalmente competentes.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: 25/01/2026.
      </p>
    </LegalPageLayout>
  );
}
