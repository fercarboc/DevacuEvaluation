import React from "react";
import LegalPageLayout from "../LegalPageLayout";

export default function Privacidad() {
  return (
    <LegalPageLayout
      title="Política de Privacidad"
      subtitle="Información sobre el tratamiento de datos personales"
    >
      <h2 className="text-lg font-semibold">1. Responsable del tratamiento</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          <b>Responsable:</b> [DEBACU HOTELS SL]
        </li>
        <li>
          <b>CIF/NIF:</b> [B-55381214]
        </li>
        <li>
          <b>Dirección:</b> [C/CANTALEJO,13-1º A]
        </li>
        <li>
          <b>Email:</b> [informacion@debacu.com]
        </li>
        <li>
          <b>Contacto de privacidad (DPO si aplica):</b> privacidad@debacu.com
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">2. Alcance y naturaleza del servicio</h2>
      <p className="mt-2">
        Debacu Evaluation360 es una plataforma de <b>uso profesional</b> destinada a apoyar la{" "}
        <b>gestión operativa interna</b> de establecimientos hoteleros y alojamientos turísticos. La Plataforma permite{" "}
        <b>registrar incidencias operativas</b> de forma estructurada, mantener un <b>histórico operativo</b> y apoyar la{" "}
        <b>aplicación de protocolos internos</b>.
      </p>
      <p className="mt-2">
        La Plataforma <b>no</b> está diseñada ni se utiliza con finalidad crediticia (p. ej., “ficheros de morosos”) ni
        para producir efectos jurídicos automáticos sobre las personas. El acceso está restringido a usuarios
        profesionales autorizados.
      </p>

      <h2 className="mt-8 text-lg font-semibold">3. Finalidades del tratamiento</h2>
      <p className="mt-2">Tratamos datos personales para:</p>
      <ul className="mt-3 list-disc pl-6">
        <li>Gestionar el alta, autenticación, acceso y administración de cuentas.</li>
        <li>
          Permitir consultas y registro de incidencias operativas con <b>trazabilidad</b> y <b>auditoría interna</b>.
        </li>
        <li>Gestionar comunicaciones operativas y soporte.</li>
        <li>Gestionar la suscripción, facturación y pagos (p. ej., Stripe) cuando aplique.</li>
        <li>
          Mejorar seguridad: prevención de fraude/abuso, control de acceso, registro de actividad (logs) y medidas
          antifraude.
        </li>
        <li>
          Cumplir obligaciones legales aplicables (fiscales, contables, atención a derechos RGPD, requerimientos de
          autoridades).
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">4. Base jurídica del tratamiento</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          <b>Ejecución de contrato</b> (art. 6.1.b RGPD): prestación del servicio, gestión de cuenta, soporte y
          funcionalidades contratadas.
        </li>
        <li>
          <b>Interés legítimo</b> (art. 6.1.f RGPD): seguridad, prevención de abuso, auditoría y trazabilidad, así como
          apoyo a la organización operativa interna del establecimiento, con medidas de minimización y control de acceso.
        </li>
        <li>
          <b>Obligación legal</b> (art. 6.1.c RGPD): facturación, obligaciones contables/fiscales y atención de solicitudes
          de derechos.
        </li>
        <li>
          <b>Consentimiento</b> (art. 6.1.a RGPD): cookies no necesarias y comunicaciones comerciales si se aplican y
          siempre que corresponda.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">
        5. Información procedente de entornos profesionales y forma de presentación
      </h2>
      <p className="mt-2">
        Debacu Evaluation360 puede apoyarse en información operativa generada en <b>distintos entornos profesionales</b>,
        que es tratada y presentada bajo criterios de <b>estructura</b>, <b>minimización</b> y <b>seguridad</b>.
      </p>
      <p className="mt-2">
        La Plataforma está diseñada para que la información se gestione con fines de <b>apoyo operativo</b> y se presente
        de forma <b>estructurada</b>. En la medida aplicable, se evita revelar datos innecesarios, así como la procedencia
        concreta o autoría de registros, limitando el acceso a usuarios profesionales autorizados.
      </p>
      <p className="mt-2">
        <b>No</b> se realizan decisiones automatizadas con efectos legales o similares sobre las personas, ni se persigue
        una finalidad de difusión pública.
      </p>

      <h2 className="mt-8 text-lg font-semibold">6. Tipos de datos tratados</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          <b>Datos de cuenta:</b> email, nombre, empresa, teléfono (opcional), rol y permisos.
        </li>
        <li>
          <b>Datos de acceso:</b> credenciales (almacenamiento seguro), tokens y eventos de sesión.
        </li>
        <li>
          <b>Datos de facturación:</b> razón social, CIF, dirección, referencias de pago (no almacenamos la tarjeta).
        </li>
        <li>
          <b>Datos de uso:</b> logs, auditoría, acciones realizadas, fechas, IP aproximada y dispositivo (si aplica).
        </li>
        <li>
          <b>Datos registrados por el cliente:</b> incidencias operativas y anotaciones estructuradas definidas por la
          Plataforma. Se recomienda evitar introducir datos excesivos o no pertinentes.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">7. Minimización y reglas de uso</h2>
      <p className="mt-2">
        La Plataforma está diseñada con criterios de minimización: se fomenta el registro <b>estructurado</b> y
        estrictamente necesario para fines operativos. Los usuarios deben evitar introducir datos excesivos, irrelevantes
        o no pertinentes. Podrán existir reglas de validación o moderación orientadas a mejorar la calidad y pertinencia
        de los registros.
      </p>

      <h2 className="mt-8 text-lg font-semibold">8. Destinatarios y proveedores</h2>
      <p className="mt-2">
        No cedemos datos a terceros salvo obligación legal o para la prestación del servicio mediante proveedores, bajo
        contratos y garantías apropiadas:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li>
          <b>Pasarela de pago:</b> Stripe (facturación y suscripciones).
        </li>
        <li>
          <b>Infraestructura / hosting:</b> [PROVEEDOR] (p. ej., Supabase/Cloud).
        </li>
        <li>
          <b>Correo transaccional:</b> [PROVEEDOR] (p. ej., Brevo) si se utiliza.
        </li>
        <li>
          <b>Analítica/monitorización (opcional):</b> [PROVEEDOR] (si aplica).
        </li>
      </ul>

       <h2 className="mt-8 text-lg font-semibold">9. Roles y responsabilidades</h2>
          <p className="mt-2">
            En el contexto del uso profesional de la Plataforma, los establecimientos
            usuarios actúan como responsables del tratamiento respecto a la información
            que deciden registrar en su propia operativa interna.
          </p>
          <p className="mt-2">
            Debacu Evaluation360 actúa como proveedor tecnológico de la Plataforma,
            facilitando un entorno seguro y estructurado para la gestión de dicha
            información, de conformidad con los términos contractuales aplicables.
          </p>
          <p className="mt-2">
            En ningún caso Debacu Evaluation360 decide de forma autónoma el contenido
            concreto de los registros introducidos por los clientes ni su utilización
            operativa.
          </p>


      <h2 className="mt-8 text-lg font-semibold">10. Transferencias internacionales</h2>
      <p className="mt-2">
        Algunos proveedores pueden procesar datos fuera del EEE. En tal caso, se aplicarán garantías adecuadas (p. ej.,
        Cláusulas Contractuales Tipo) y/o decisiones de adecuación, según corresponda.
      </p>

      <h2 className="mt-8 text-lg font-semibold">11. Plazos de conservación</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          <b>Cuenta:</b> durante la relación contractual y mientras sea necesaria para el servicio.
        </li>
        <li>
          <b>Facturación:</b> según plazos legales aplicables.
        </li>
        <li>
          <b>Logs y auditoría:</b> el tiempo estrictamente necesario para seguridad y trazabilidad (p. ej., 6–24 meses).
        </li>
        <li>
          <b>Incidencias:</b> según configuración del cliente o política interna, evitando conservación indefinida sin
          justificación.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">12. Derechos de las personas</h2>
      <p className="mt-2">
        Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad enviando un
        email a <b>[EMAIL PRIVACIDAD]</b>, acreditando identidad. También puedes reclamar ante la Agencia Española de
        Protección de Datos (AEPD).
      </p>

      <h2 className="mt-8 text-lg font-semibold">13. Decisiones automatizadas</h2>
      <p className="mt-2">
        Debacu Evaluation360 <b>no</b> adopta decisiones automatizadas con efectos legales o similares basadas
        exclusivamente en tratamientos automatizados, ni realiza perfiles con impacto jurídico.
      </p>

      <h2 className="mt-8 text-lg font-semibold">14. Seguridad</h2>
      <p className="mt-2">
        Adoptamos medidas técnicas y organizativas razonables: control de acceso, cifrado en tránsito, segregación de
        datos, registros de auditoría, políticas de mínimos privilegios y mecanismos de control para prevenir abuso.
      </p>

      <h2 className="mt-8 text-lg font-semibold">15. Cambios en esta política</h2>
      <p className="mt-2">
        Podremos actualizar esta política por razones legales o técnicas. Publicaremos la versión vigente en este sitio.
      </p>

      <p className="mt-8 text-sm text-slate-500">Última actualización: 25/01/2026.</p>
    </LegalPageLayout>
  );
}
