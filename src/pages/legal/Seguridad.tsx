import React from "react";
import LegalLayout from "./LegalLayout";

export default function Seguridad() {
  return (
    <LegalLayout title="Seguridad y Auditoría" subtitle="Controles, registros de actividad y buenas prácticas">
      <h2 className="text-lg font-semibold">1. Principios</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>Mínimos privilegios: cada usuario ve lo necesario para su rol.</li>
        <li>Trazabilidad: acciones relevantes quedan registradas en logs.</li>
        <li>Segregación: separación lógica por organización cuando aplique.</li>
        <li>Cifrado: en tránsito (HTTPS) y, cuando proceda, en reposo.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">2. Logs y auditoría</h2>
      <p className="mt-2">
        Para seguridad y control interno, se pueden registrar: accesos, consultas, altas, modificaciones, exportaciones,
        eventos de autenticación y cambios de plan. Estos registros ayudan a prevenir abuso y mejorar la trazabilidad.
      </p>

      <h2 className="mt-8 text-lg font-semibold">3. Gestión de incidentes</h2>
      <p className="mt-2">
        Contamos con procedimientos para identificar, contener y corregir incidentes. Si una brecha afectara a datos
        personales, se actuará conforme al RGPD (notificación cuando sea aplicable).
      </p>

      <h2 className="mt-8 text-lg font-semibold">4. Recomendaciones al cliente</h2>
      <ul className="mt-3 list-disc pl-6">
        <li>Usar contraseñas robustas y 2FA si está disponible.</li>
        <li>No compartir cuentas entre varios usuarios.</li>
        <li>Revisar periódicamente accesos y roles.</li>
        <li>Evitar registrar datos excesivos y no pertinentes.</li>
      </ul>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: [FECHA].
      </p>
    </LegalLayout>
  );
}
