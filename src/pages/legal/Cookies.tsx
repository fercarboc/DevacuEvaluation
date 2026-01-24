import React from "react";
import LegalLayout from "./LegalLayout";

export default function Cookies() {
  return (
    <LegalLayout title="Política de Cookies" subtitle="Información sobre cookies y tecnologías similares">
      <h2 className="text-lg font-semibold">1. ¿Qué son las cookies?</h2>
      <p className="mt-2">
        Las cookies son pequeños archivos que se almacenan en tu dispositivo para mejorar la experiencia, permitir funciones
        esenciales y obtener estadísticas de uso.
      </p>

      <h2 className="mt-8 text-lg font-semibold">2. Tipos de cookies</h2>
      <ul className="mt-3 list-disc pl-6">
        <li><b>Técnicas/Esenciales:</b> necesarias para el funcionamiento (login, sesión, seguridad).</li>
        <li><b>Preferencias:</b> recuerdan opciones del usuario.</li>
        <li><b>Analíticas:</b> estadísticas de uso (solo si se habilitan).</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">3. Cookies utilizadas</h2>
      <p className="mt-2">
        Por defecto, la Plataforma utiliza cookies/tokens de sesión para autenticación y seguridad. Si se integran cookies
        analíticas o de terceros, se informará y se solicitará consentimiento cuando corresponda.
      </p>

      <h2 className="mt-8 text-lg font-semibold">4. Cómo gestionar cookies</h2>
      <p className="mt-2">
        Puedes eliminar o bloquear cookies desde la configuración del navegador. Ten en cuenta que esto puede afectar
        al funcionamiento del login o secciones privadas.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Última actualización: [FECHA].
      </p>
    </LegalLayout>
  );
}
