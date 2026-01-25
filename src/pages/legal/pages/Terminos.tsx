import React from "react";
import LegalPageLayout from "../LegalPageLayout";

export default function Terminos() {
  return (
    <LegalPageLayout
      title="Términos y Condiciones"
      subtitle="Condiciones de acceso, uso profesional, suscripción, pagos y cancelación"
    >
      <h2 className="text-lg font-semibold">1. Identificación y aceptación</h2>
      <p className="mt-2">
        Estos Términos y Condiciones regulan el acceso y uso de la plataforma
        <b> Debacu Evaluation360</b> (en adelante, la “Plataforma”).
        Al registrarte, acceder o utilizar la Plataforma en cualquier forma,
        declaras que actúas en un <b>contexto profesional</b> y aceptas estos
        Términos, así como la Política de Privacidad, Cookies y demás textos
        legales aplicables.
      </p>

      <h2 className="mt-8 text-lg font-semibold">2. Ámbito del servicio</h2>
      <p className="mt-2">
        La Plataforma proporciona un entorno privado de uso profesional para
        establecimientos hoteleros y alojamientos turísticos, orientado a apoyar
        la <b>gestión operativa interna</b>, el registro estructurado de incidencias,
        la trazabilidad y la mejora de protocolos internos.
      </p>
      <p className="mt-2">
        La Plataforma <b>no</b> es un servicio público ni un registro abierto, y
        <b> no</b> constituye un fichero de solvencia patrimonial o morosidad,
        ni un sistema de calificación crediticia, ni está destinada a adoptar
        decisiones automatizadas con efectos legales o similares sobre las personas.
      </p>

      <h2 className="mt-8 text-lg font-semibold">3. Acceso, alta y cuentas</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          El acceso puede estar sujeto a <b>alta controlada</b>, verificación del
          establecimiento y aceptación de condiciones.
        </li>
        <li>
          El usuario debe facilitar información veraz y mantenerla actualizada.
        </li>
        <li>
          Las credenciales son personales e intransferibles; está prohibido el
          uso compartido no autorizado.
        </li>
        <li>
          El usuario es responsable de custodiar contraseñas, dispositivos y
          accesos y de notificar cualquier uso no autorizado.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">4. Uso profesional permitido</h2>
      <p className="mt-2">
        El usuario se compromete a utilizar la Plataforma exclusivamente para
        fines profesionales internos, conforme a la finalidad del servicio y a la
        normativa aplicable. En particular, el usuario se compromete a:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li>Usar la Plataforma de buena fe, de forma diligente y conforme a derecho.</li>
        <li>Introducir únicamente información pertinente y necesaria para fines operativos.</li>
        <li>Respetar la confidencialidad y las limitaciones de acceso del sistema.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">5. Prohibiciones</h2>
      <p className="mt-2">
        Queda expresamente prohibido, sin perjuicio de otras prohibiciones previstas
        en la normativa o en estos Términos:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li>Difundir, publicar o redistribuir información obtenida en la Plataforma fuera del entorno autorizado.</li>
        <li>Extraer datos de forma masiva o automatizada (scraping), o usar bots sin autorización expresa.</li>
        <li>Realizar ingeniería inversa, descompilar o intentar acceder al código fuente o a sistemas internos.</li>
        <li>Eludir controles de seguridad, límites de uso o mecanismos de acceso.</li>
        <li>Usar la Plataforma para fines ilícitos, discriminatorios, difamatorios o contrarios a derechos fundamentales.</li>
        <li>Registrar datos excesivos o innecesarios, o datos sensibles no pertinentes.</li>
        <li>Utilizar la Plataforma como “lista pública” o con finalidad ajena a la operativa profesional prevista.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">6. Contenido registrado y responsabilidad del usuario</h2>
      <p className="mt-2">
        El usuario es responsable del uso que realice de la Plataforma y de la
        información que introduzca o gestione en el marco de su propia operativa.
        El usuario se compromete a aplicar criterios de minimización y pertinencia,
        evitando registros innecesarios y respetando la normativa aplicable.
      </p>
      <p className="mt-2">
        La Plataforma proporciona herramientas técnicas y organizativas de apoyo,
        sin sustituir la responsabilidad del establecimiento usuario en sus decisiones
        internas y en el cumplimiento de sus obligaciones legales.
      </p>

      <h2 className="mt-8 text-lg font-semibold">7. Trazabilidad, logs y control interno</h2>
      <p className="mt-2">
        Por razones de seguridad, cumplimiento y control interno, la Plataforma puede
        registrar eventos de actividad (por ejemplo: accesos, consultas, operaciones
        relevantes, cambios de configuración, acciones administrativas).
        Estos registros se usan para la detección de abuso, investigación de incidencias
        y mejora de seguridad, de acuerdo con la Política de Privacidad.
      </p>

      <h2 className="mt-8 text-lg font-semibold">8. Planes, suscripción y facturación</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          La Plataforma puede ofrecer planes de suscripción, incluyendo un <b>plan inicial</b>
          gratuito o promocional, y planes de pago con límites y funcionalidades diferenciadas.
        </li>
        <li>
          La activación, límites de uso (por ejemplo, número de consultas) y condiciones
          de cada plan se informarán en la interfaz de contratación o en documentación asociada.
        </li>
        <li>
          La facturación y el pago pueden gestionarse mediante terceros proveedores (por ejemplo, Stripe).
          La Plataforma no almacena datos completos de tarjeta; el pago se procesa por el proveedor.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">9. Renovación automática, cambios de plan y reglas</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          Las suscripciones pueden renovarse automáticamente con la periodicidad seleccionada,
          salvo cancelación conforme a estas condiciones y a la configuración del proveedor de pagos.
        </li>
        <li>
          El usuario puede solicitar cambios de plan (subir o bajar) según disponibilidad y reglas vigentes.
        </li>
        <li>
          Si el plan gratuito es de <b>inicio</b> o <b>promocional</b>, puede estar limitado y no ser
          un plan “contratable” ni un destino válido para downgrades, conforme a las reglas mostradas
          en la interfaz del servicio.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">10. Cancelación</h2>
      <p className="mt-2">
        La cancelación de la suscripción podrá realizarse desde el área de cuenta de la Plataforma
        y/o mediante el portal del proveedor de pagos, cuando esté habilitado. La cancelación
        surtirá efectos conforme a las condiciones del plan, al ciclo de facturación vigente y a la
        configuración del proveedor de pagos.
      </p>

      <h2 className="mt-8 text-lg font-semibold">11. Soporte</h2>
      <p className="mt-2">
        El soporte y sus canales pueden variar según el plan contratado. Cuando aplique, los tiempos
        de respuesta, alcance y condiciones podrán definirse en la oferta del plan o en acuerdos de servicio.
      </p>

      <h2 className="mt-8 text-lg font-semibold">12. Disponibilidad, mantenimiento y cambios técnicos</h2>
      <p className="mt-2">
        La Plataforma puede requerir mantenimientos técnicos, actualizaciones o mejoras. Se podrán
        introducir cambios razonables para mantener la seguridad, el cumplimiento normativo y la
        evolución del servicio, procurando minimizar el impacto en la operación.
      </p>

      <h2 className="mt-8 text-lg font-semibold">13. Propiedad intelectual</h2>
      <p className="mt-2">
        La Plataforma, su software, diseño, documentación, marcas y elementos asociados están protegidos
        por derechos de propiedad intelectual e industrial. El uso de la Plataforma no implica cesión de
        derechos al usuario, salvo licencia limitada de uso conforme a estos Términos.
      </p>

      <h2 className="mt-8 text-lg font-semibold">14. Confidencialidad</h2>
      <p className="mt-2">
        El usuario se compromete a tratar como confidencial cualquier información no pública a la que
        acceda mediante la Plataforma y a no divulgarla fuera del entorno autorizado, salvo obligación legal.
      </p>

      <h2 className="mt-8 text-lg font-semibold">15. Suspensión o terminación</h2>
      <p className="mt-2">
        El titular podrá suspender o limitar el acceso a la Plataforma en caso de uso indebido, incumplimiento
        de estos Términos, riesgo de seguridad, indicios razonables de abuso o requerimientos legales.
        En caso de suspensión, se procurará restablecer el acceso cuando sea posible y proceda.
      </p>

      <h2 className="mt-8 text-lg font-semibold">16. Exención y limitación de responsabilidad</h2>
      <p className="mt-2">
        La Plataforma es una herramienta de apoyo a procesos internos. Las decisiones operativas del usuario
        basadas en la información gestionada en la Plataforma son responsabilidad del propio usuario/cliente.
      </p>
      <p className="mt-2">
        La Plataforma se ofrece “tal cual”, sin garantía de ausencia total de errores, interrupciones o incidencias.
        En la medida permitida por la ley, el titular no será responsable de daños indirectos, lucro cesante o
        pérdidas derivadas del uso o imposibilidad de uso del servicio.
      </p>

      <h2 className="mt-8 text-lg font-semibold">17. Modificaciones de los Términos</h2>
      <p className="mt-2">
        Estos Términos podrán actualizarse por cambios legales, técnicos u operativos. La versión vigente
        será la publicada en la Plataforma. El uso continuado tras una actualización implica aceptación
        de la versión vigente, cuando proceda.
      </p>

      <h2 className="mt-8 text-lg font-semibold">18. Legislación aplicable y jurisdicción</h2>
      <p className="mt-2">
        Estos Términos se rigen por la legislación española. Para cualquier controversia, las partes se someterán
        a los juzgados y tribunales que resulten competentes conforme a la normativa aplicable.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: 25/01/2026.
      </p>
    </LegalPageLayout>
  );
}
