import React from "react";
import LegalPageLayout from "../LegalPageLayout";

export default function Cookies() {
  return (
    <LegalPageLayout
      title="Política de Cookies"
      subtitle="Información sobre el uso de cookies y tecnologías similares"
    >
      <h2 className="text-lg font-semibold">1. ¿Qué son las cookies?</h2>
      <p className="mt-2">
        Las cookies y tecnologías similares (por ejemplo, almacenamiento local
        o tokens) son pequeños archivos o identificadores que se almacenan en el
        dispositivo del usuario con la finalidad de permitir el funcionamiento
        del sitio, facilitar la navegación y mejorar la experiencia de uso.
      </p>

      <h2 className="mt-8 text-lg font-semibold">2. Marco normativo</h2>
      <p className="mt-2">
        El uso de cookies se rige por lo dispuesto en la normativa aplicable,
        incluyendo el Reglamento (UE) 2016/679 (RGPD), la Ley Orgánica 3/2018
        (LOPDGDD) y la Ley 34/2002 de servicios de la sociedad de la información
        y comercio electrónico (LSSI).
      </p>

      <h2 className="mt-8 text-lg font-semibold">3. Tipos de cookies según su finalidad</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          <b>Cookies técnicas o estrictamente necesarias:</b> permiten el
          funcionamiento básico de la Plataforma, como la autenticación,
          gestión de sesiones, seguridad y control de acceso.
        </li>
        <li>
          <b>Cookies de preferencias o personalización:</b> permiten recordar
          determinadas configuraciones del usuario, cuando proceda.
        </li>
        <li>
          <b>Cookies analíticas o de medición:</b> permiten obtener estadísticas
          agregadas sobre el uso de la Plataforma, únicamente cuando estén
          habilitadas y conforme a la normativa aplicable.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">4. Cookies utilizadas en la Plataforma</h2>
      <p className="mt-2">
        Con carácter general, Debacu Evaluation360 utiliza únicamente
        <b> cookies técnicas y de sesión</b> necesarias para el funcionamiento
        de la Plataforma, la autenticación de usuarios y la seguridad del
        servicio.
      </p>
      <p className="mt-2">
        Estas cookies no requieren consentimiento previo, de conformidad con la
        normativa vigente, al ser imprescindibles para la prestación del
        servicio solicitado por el usuario.
      </p>
      <p className="mt-2">
        En caso de que se incorporen cookies analíticas, de terceros o de
        medición no estrictamente necesarias, se informará previamente al
        usuario y se solicitará el consentimiento correspondiente cuando así lo
        exija la normativa aplicable.
      </p>

      <h2 className="mt-8 text-lg font-semibold">5. Cookies de terceros</h2>
      <p className="mt-2">
        Determinados proveedores tecnológicos integrados en la Plataforma
        (por ejemplo, servicios de infraestructura, autenticación o pago)
        pueden utilizar identificadores técnicos necesarios para la correcta
        prestación del servicio.
      </p>
      <p className="mt-2">
        En ningún caso se utilizan cookies de terceros con fines publicitarios
        ni de seguimiento comercial sin el consentimiento previo del usuario.
      </p>

      <h2 className="mt-8 text-lg font-semibold">6. Gestión y configuración de cookies</h2>
      <p className="mt-2">
        El usuario puede configurar, bloquear o eliminar las cookies a través
        de las opciones de su navegador. A continuación, se indican enlaces a
        la información de los navegadores más habituales:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li>Google Chrome</li>
        <li>Mozilla Firefox</li>
        <li>Microsoft Edge</li>
        <li>Apple Safari</li>
      </ul>
      <p className="mt-2">
        La desactivación de cookies técnicas o de sesión puede impedir el acceso
        a áreas privadas de la Plataforma o afectar a su correcto
        funcionamiento.
      </p>

      <h2 className="mt-8 text-lg font-semibold">7. Conservación</h2>
      <p className="mt-2">
        Las cookies técnicas y de sesión se conservan durante el tiempo
        estrictamente necesario para mantener la sesión activa o garantizar la
        seguridad del servicio, y se eliminan automáticamente al cerrar la
        sesión o conforme a la configuración del navegador.
      </p>

      <h2 className="mt-8 text-lg font-semibold">8. Actualizaciones de la Política de Cookies</h2>
      <p className="mt-2">
        La presente Política de Cookies podrá actualizarse en función de
        cambios normativos, técnicos o de configuración de la Plataforma. La
        versión vigente será la publicada en este sitio en cada momento.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: 25/01/2026.
      </p>
    </LegalPageLayout>
  );
}
