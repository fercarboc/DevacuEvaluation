import React from "react";
import LegalLayout from "./LegalLayout";

export default function AvisoLegal() {
  return (
    <LegalLayout title="Aviso Legal" subtitle="Información del titular y condiciones generales del sitio">
      <h2 className="text-lg font-semibold">1. Titularidad</h2>
      <p className="mt-2">
        En cumplimiento de la normativa aplicable, se informa que este sitio web y la plataforma “Debacu Evaluation360”
        (en adelante, la “Plataforma”) es titularidad de:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li><b>Titular / Razón social:</b> DEBACU HOTELS SL</li>
        <li><b>CIF/NIF:</b> B-55381214</li>
        <li><b>Domicilio:</b> C/CANTALEJO,13-1º A</li>
        <li><b>Email de contacto:</b> informacion@debacu.com</li>
        <li><b>Teléfono:</b> 672 336 572 (opcional)</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">2. Objeto</h2>
      <p className="mt-2">
        La Plataforma proporciona un entorno privado de uso profesional para alojamientos y equipos operativos,
        orientado a la gestión interna de incidencias y trazabilidad (consultas, registros, auditoría).
        No se trata de un servicio público ni de un registro accesible para el público general.
      </p>

      <h2 className="mt-8 text-lg font-semibold">3. Acceso y registro</h2>
      <p className="mt-2">
        El acceso puede requerir alta controlada, creación de cuenta y autenticación. El usuario se compromete
        a facilitar información veraz y a custodiar sus credenciales, evitando el uso compartido no autorizado.
      </p>

      <h2 className="mt-8 text-lg font-semibold">4. Uso adecuado</h2>
      <p className="mt-2">
        El usuario se compromete a utilizar la Plataforma de forma diligente, lícita y conforme a la finalidad profesional
        descrita. Quedan prohibidos los usos que impliquen:
      </p>
      <ul className="mt-3 list-disc pl-6">
        <li>Difusión pública de información obtenida en la Plataforma.</li>
        <li>Recolección masiva o automatizada no autorizada.</li>
        <li>Uso difamatorio, discriminatorio o contrario a la buena fe.</li>
        <li>Uso para fines distintos de los profesionales previstos (p.ej. exposición pública).</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">5. Propiedad intelectual</h2>
      <p className="mt-2">
        Los contenidos, marcas, diseños, software y elementos de la Plataforma están protegidos por derechos de propiedad
        intelectual e industrial. Queda prohibida su reproducción o explotación no autorizada.
      </p>

      <h2 className="mt-8 text-lg font-semibold">6. Responsabilidad</h2>
      <p className="mt-2">
        La Plataforma se ofrece “tal cual”, con esfuerzos razonables de disponibilidad y seguridad. El titular no garantiza
        la inexistencia absoluta de interrupciones o errores, aunque adoptará medidas para su corrección. El usuario es
        responsable del uso que haga de la información en su propia operativa.
      </p>

      <h2 className="mt-8 text-lg font-semibold">7. Enlaces y terceros</h2>
      <p className="mt-2">
        Pueden existir enlaces a sitios de terceros. El titular no se responsabiliza de sus contenidos o políticas.
      </p>

      <h2 className="mt-8 text-lg font-semibold">8. Legislación y jurisdicción</h2>
      <p className="mt-2">
        Este Aviso Legal se rige por la legislación española. Para cualquier controversia, las partes se someterán a los
        juzgados y tribunales que resulten competentes conforme a la normativa aplicable.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: [FECHA].
      </p>
    </LegalLayout>
  );
}
