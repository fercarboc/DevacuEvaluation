import React from "react";
import LegalLayout from "./LegalLayout";

export default function DPA() {
  return (
    <LegalLayout title="Encargo de Tratamiento (DPA)" subtitle="Modelo para clientes B2B (Responsable / Encargado)">
      <p>
        Este documento es un modelo orientativo. En un entorno B2B, normalmente el <b>cliente</b> (hotel) actúa como
        <b> Responsable del tratamiento</b> y el proveedor de la Plataforma como <b>Encargado</b>, cuando el cliente
        incorpora datos personales a la herramienta.
      </p>

      <h2 className="mt-8 text-lg font-semibold">1. Partes</h2>
      <ul className="mt-3 list-disc pl-6">
        <li><b>Responsable:</b> [CLIENTE / HOTEL]</li>
        <li><b>Encargado:</b> [DEBACU HOTELS SL]</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">2. Objeto</h2>
      <p className="mt-2">
        Prestación del servicio de plataforma privada para gestión operativa con trazabilidad, conforme a instrucciones
        documentadas del Responsable.
      </p>

      <h2 className="mt-8 text-lg font-semibold">3. Duración</h2>
      <p className="mt-2">Durante la vigencia del contrato del servicio.</p>

      <h2 className="mt-8 text-lg font-semibold">4. Naturaleza y finalidad</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>Tratamiento: almacenamiento, consulta, registro, modificación, auditoría.</li>
        <li>Finalidad: gestión interna y trazabilidad operativa del Responsable.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">5. Tipos de datos y categorías</h2>
      <p className="mt-2">
        Según uso del Responsable. Se recomienda minimización. Evitar datos sensibles salvo estricta necesidad y base legal.
      </p>

      <h2 className="mt-8 text-lg font-semibold">6. Obligaciones del Encargado</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>Tratar los datos solo conforme a instrucciones del Responsable.</li>
        <li>Garantizar confidencialidad del personal autorizado.</li>
        <li>Aplicar medidas de seguridad adecuadas (art. 32 RGPD).</li>
        <li>Asistir al Responsable en ejercicio de derechos y gestión de brechas.</li>
        <li>Notificar violaciones de seguridad sin dilación indebida.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">7. Subencargados</h2>
      <p className="mt-2">
        El Encargado puede utilizar subencargados (hosting, correo, pagos), manteniendo obligaciones equivalentes.
        Listado orientativo: [SUPABASE/HOSTING], [BREVO], [STRIPE].
      </p>

      <h2 className="mt-8 text-lg font-semibold">8. Finalización</h2>
      <p className="mt-2">
        Al finalizar el servicio, se devolverán o suprimirán los datos según instrucciones del Responsable, salvo obligación legal.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: [FECHA].
      </p>
    </LegalLayout>
  );
}
