import React from "react";
import LegalLayout from "./LegalLayout";

export default function Terminos() {
  return (
    <LegalLayout title="Términos y Condiciones" subtitle="Condiciones de uso, suscripción, pagos y cancelación">
      <h2 className="text-lg font-semibold">1. Ámbito</h2>
      <p className="mt-2">
        Estos términos regulan el acceso y uso de la Plataforma Debacu Evaluation360. Al registrarte o usar la Plataforma,
        aceptas estas condiciones.
      </p>

      <h2 className="mt-8 text-lg font-semibold">2. Cuenta y acceso</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>El usuario es responsable de mantener la confidencialidad de sus credenciales.</li>
        <li>El acceso puede estar restringido por alta controlada.</li>
        <li>Podemos suspender cuentas ante indicios de abuso, fraude o incumplimiento.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">3. Planes, suscripción y facturación</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>La Plataforma puede ofrecer planes (incluyendo plan inicial gratuito limitado) y planes de pago.</li>
        <li>La facturación puede gestionarse mediante Stripe u otro proveedor.</li>
        <li>No almacenamos datos completos de tarjeta; el pago se procesa por el proveedor.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">4. Renovación, cambios y cancelación</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>Las suscripciones pueden renovarse automáticamente según el plan.</li>
        <li>El usuario puede cambiar de plan según disponibilidad y reglas (p.ej. no volver a FREE si es solo de inicio).</li>
        <li>La cancelación puede hacerse desde el área de cuenta o portal de Stripe si está habilitado.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">5. Uso profesional y limitaciones</h2>
      <p className="mt-2">
        La Plataforma es privada y de uso profesional. Queda prohibida la difusión pública de información, la extracción
        automatizada y cualquier uso contrario a la finalidad operativa.
      </p>

      <h2 className="mt-8 text-lg font-semibold">6. Limitación de responsabilidad</h2>
      <p className="mt-2">
        La Plataforma ofrece herramientas de apoyo a procesos internos. Las decisiones del usuario basadas en la información
        son responsabilidad del usuario/cliente. No se garantiza ausencia total de errores o interrupciones.
      </p>

      <h2 className="mt-8 text-lg font-semibold">7. Soporte</h2>
      <p className="mt-2">
        El soporte puede variar según el plan. Los tiempos de respuesta y alcance se detallarán en el plan contratado o SLA.
      </p>

      <h2 className="mt-8 text-lg font-semibold">8. Modificaciones</h2>
      <p className="mt-2">
        Podemos actualizar estas condiciones por cambios legales o del servicio. La versión vigente estará publicada aquí.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: 24-01-2026.
      </p>
    </LegalLayout>
  );
}
