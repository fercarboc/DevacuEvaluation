import React from "react";
import LegalLayout from "./LegalLayout";

export default function DPA() {
  return (
    <LegalLayout
      title="Encargo de Tratamiento de Datos (DPA)"
      subtitle="Acuerdo conforme al artículo 28 del Reglamento (UE) 2016/679"
    >
      <p className="mt-2">
        El presente documento regula el <b>encargo de tratamiento de datos
        personales</b> conforme al artículo 28 del Reglamento (UE) 2016/679
        (RGPD), en el marco del uso profesional de la plataforma
        <b> Debacu Evaluation360</b>.
      </p>
      <p className="mt-2">
        Este DPA forma parte integrante de la relación contractual entre las
        partes y se considera aceptado mediante la solicitud de acceso, el alta
        en la Plataforma o el uso continuado del servicio.
      </p>

      <h2 className="mt-8 text-lg font-semibold">1. Partes</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          <b>Responsable del tratamiento:</b> El cliente / establecimiento
          hotelero que utiliza la Plataforma, que determina los fines y medios
          del tratamiento en su operativa interna.
        </li>
        <li>
          <b>Encargado del tratamiento:</b> <b>DEBACU HOTELS S.L.</b>, como
          proveedor tecnológico de la Plataforma.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">2. Objeto del encargo</h2>
      <p className="mt-2">
        El Encargado prestará al Responsable los servicios de acceso y uso de la
        Plataforma Debacu Evaluation360, que permite la gestión operativa
        interna, el registro estructurado de incidencias y la trazabilidad de
        acciones, tratando los datos personales únicamente conforme a las
        instrucciones documentadas del Responsable.
      </p>

      <h2 className="mt-8 text-lg font-semibold">3. Duración</h2>
      <p className="mt-2">
        El presente encargo tendrá la misma duración que la relación contractual
        o de prestación del servicio entre las partes, permaneciendo vigente
        mientras el Responsable utilice la Plataforma.
      </p>

      <h2 className="mt-8 text-lg font-semibold">4. Naturaleza y finalidad del tratamiento</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          <b>Operaciones de tratamiento:</b> almacenamiento, acceso, consulta,
          registro, modificación, estructuración, auditoría y supresión.
        </li>
        <li>
          <b>Finalidad:</b> apoyo a la gestión operativa interna del Responsable,
          trazabilidad de procesos y aplicación de protocolos internos.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">5. Tipos de datos y categorías de interesados</h2>
      <p className="mt-2">
        Los tipos de datos y categorías de interesados dependerán del uso que
        realice el Responsable de la Plataforma. Con carácter general, pueden
        incluir datos identificativos y datos operativos vinculados a la
        actividad profesional del Responsable.
      </p>
      <p className="mt-2">
        El Responsable se compromete a aplicar criterios de <b>minimización</b>,
        evitando la introducción de datos excesivos o innecesarios y, en
        particular, datos especialmente protegidos, salvo que exista base legal
        suficiente y estricta necesidad operativa.
      </p>

      <h2 className="mt-8 text-lg font-semibold">6. Obligaciones del Encargado</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          Tratar los datos personales únicamente siguiendo instrucciones
          documentadas del Responsable.
        </li>
        <li>
          Garantizar que las personas autorizadas a tratar datos personales se
          comprometan a respetar la confidencialidad.
        </li>
        <li>
          Adoptar medidas técnicas y organizativas apropiadas para garantizar un
          nivel de seguridad adecuado al riesgo, conforme al artículo 32 RGPD.
        </li>
        <li>
          Asistir al Responsable, cuando proceda, en el cumplimiento de sus
          obligaciones relativas al ejercicio de derechos de los interesados.
        </li>
        <li>
          Asistir al Responsable en la gestión de violaciones de seguridad de los
          datos personales, cuando sea aplicable.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">7. Obligaciones del Responsable</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>
          Garantizar que el tratamiento de los datos personales cumple con la
          normativa aplicable.
        </li>
        <li>
          Proporcionar instrucciones lícitas y documentadas al Encargado.
        </li>
        <li>
          Informar adecuadamente a los interesados conforme a los artículos 13 y
          14 del RGPD.
        </li>
        <li>
          No utilizar la Plataforma para finalidades ilícitas,
          discriminatorias o ajenas al ámbito profesional.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">8. Subencargados</h2>
      <p className="mt-2">
        El Responsable autoriza de forma general al Encargado a recurrir a
        subencargados para la prestación del servicio (por ejemplo, servicios de
        infraestructura, correo electrónico o pagos), siempre que dichos
        subencargados asuman obligaciones equivalentes a las previstas en este
        DPA.
      </p>
      <p className="mt-2">
        A título orientativo, podrán utilizarse proveedores como:
        infraestructura/hosting, servicios de correo transaccional y pasarelas
        de pago (p. ej., Supabase, Brevo, Stripe).
      </p>

      <h2 className="mt-8 text-lg font-semibold">9. Transferencias internacionales</h2>
      <p className="mt-2">
        En caso de que los subencargados traten datos fuera del Espacio Económico
        Europeo, el Encargado garantizará la aplicación de mecanismos adecuados,
        tales como cláusulas contractuales tipo o decisiones de adecuación,
        conforme a la normativa aplicable.
      </p>

      <h2 className="mt-8 text-lg font-semibold">10. Violaciones de seguridad</h2>
      <p className="mt-2">
        El Encargado notificará al Responsable, sin dilación indebida, cualquier
        violación de la seguridad de los datos personales de la que tenga
        conocimiento, proporcionando la información razonablemente disponible
        para facilitar el cumplimiento de las obligaciones legales del
        Responsable.
      </p>

      <h2 className="mt-8 text-lg font-semibold">11. Devolución o supresión de datos</h2>
      <p className="mt-2">
        Una vez finalizada la prestación del servicio, el Encargado suprimirá o
        devolverá al Responsable los datos personales tratados, a elección del
        Responsable, salvo que exista una obligación legal que requiera su
        conservación.
      </p>

      <h2 className="mt-8 text-lg font-semibold">12. Auditorías</h2>
      <p className="mt-2">
        El Responsable podrá solicitar información razonable para verificar el
        cumplimiento de este DPA. Las auditorías, en su caso, deberán limitarse
        a lo estrictamente necesario y no interferir de forma desproporcionada
        en la operativa del Encargado ni comprometer información confidencial de
        terceros.
      </p>

      <h2 className="mt-8 text-lg font-semibold">13. Responsabilidad y limitaciones</h2>
      <p className="mt-2">
        El Encargado no será responsable de incumplimientos derivados de
        instrucciones ilícitas del Responsable ni del uso indebido de la
        Plataforma por parte del Responsable o sus usuarios.
      </p>

      <h2 className="mt-8 text-lg font-semibold">14. Integración contractual</h2>
      <p className="mt-2">
        El presente DPA se interpreta conjuntamente con los Términos y
        Condiciones, la Política de Privacidad, la Política de Seguridad y el
        Aviso Legal de la Plataforma, formando un marco contractual único.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: 25/01/2026.
      </p>
    </LegalLayout>
  );
}
