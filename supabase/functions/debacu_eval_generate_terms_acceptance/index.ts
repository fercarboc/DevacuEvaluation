// supabase/functions/debacu_eval_generate_terms_acceptance/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

import { json, preflight } from "../_shared/cors.ts";
import { supabaseServiceClient } from "../_shared/auth.ts";

/**
 * ✅ Server-side versioning (NO confiar en frontend)
 */
const TERMS_VERSION = "2026-01-24 - V1.0";

/**
 * Storage bucket destino
 */
const LEGAL_BUCKET = "debacu_legal_acceptances";

type PropertyType = "HOTEL" | "RURAL" | "APARTMENTS" | "HOSTEL" | "OTHER";

type Body = {
  request_id?: string;
  /**
   * Recomendado: envíalo desde el frontend para validar que quien acepta
   * es el mismo email de la solicitud.
   */
  email?: string;
};

type PdfData = {
  request_id: string;
  terms_version: string;

  company_name: string;
  cif: string;
  contact_name: string;
  email: string;

  property_type?: PropertyType | null;
  city?: string | null;
  country?: string | null;
  legal_name?: string | null;
  address?: string | null;
  rooms_count?: number | null;
  website?: string | null;
  contact_role?: string | null;
  phone?: string | null;
  notes?: string | null;

  accepted_ip?: string | null;
  accepted_user_agent?: string | null;

  // ✅ Anexos de seguridad/RGPD (texto controlado server-side)
  // (No son datos personales del solicitante; son cláusulas del documento)
  rgpd_retention_years?: number | null;
  rgpd_log_retention_days?: number | null;
};

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function nowIso() {
  return new Date().toISOString();
}

function safeTimestamp(iso: string) {
  // 2026-02-18T08:10:00.123Z -> 2026-02-18T08-10-00-123Z
  return iso.replace(/[:.]/g, "-");
}

function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("cf-connecting-ip") ?? null;
}

function normalizeEmail(e: string | null | undefined) {
  return (e ?? "").trim().toLowerCase();
}

function errPayload(code: string, detail?: string) {
  return { ok: false, error: "request_failed", detail: detail ? `${code}:${detail}` : code };
}

function badRequest(req: Request, code: string, detail?: string) {
  return json(req, 400, errPayload(code, detail));
}

function forbidden(req: Request, code = "forbidden") {
  return json(req, 403, errPayload(code));
}

function notFound(req: Request) {
  return json(req, 404, errPayload("not_found"));
}

function serverError(req: Request, code: string, detail?: string) {
  return json(req, 500, errPayload(code, detail));
}

/**
 * PDF generator (igual que el tuyo)
 */
async function buildPdf(data: PdfData, acceptedAtIso: string) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89; // A4
  const margin = 48;
  const contentW = PAGE_W - margin * 2;

  const colors = {
    title: rgb(0.05, 0.1, 0.2),
    text: rgb(0.2, 0.2, 0.2),
    muted: rgb(0.45, 0.45, 0.45),
    subtle: rgb(0.75, 0.78, 0.82),
  };

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - margin;
  let pageNo = 1;

  const footer = () => {
    const footerY = 24;
    page.drawText(`Debacu Evaluation360 · Centro legal`, {
      x: margin,
      y: footerY,
      size: 9,
      font,
      color: colors.muted,
    });
    page.drawText(`Página ${pageNo}`, {
      x: PAGE_W - margin - 60,
      y: footerY,
      size: 9,
      font,
      color: colors.muted,
    });
  };

  const newPage = () => {
    footer();
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    pageNo += 1;
    y = PAGE_H - margin;
  };

  const ensureSpace = (need: number) => {
    const bottom = 48;
    if (y - need < bottom) newPage();
  };

  const hr = () => {
    ensureSpace(16);
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: PAGE_W - margin, y },
      thickness: 1,
      color: colors.subtle,
    });
    y -= 10;
  };

  const wrapLines = (text: string, size: number) => {
    const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      const width = font.widthOfTextAtSize(test, size);
      if (width > contentW) {
        if (line) lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const drawH1 = (text: string) => {
    ensureSpace(40);
    page.drawText(text, { x: margin, y, size: 18, font: fontBold, color: colors.title });
    y -= 28;
  };

  const drawH2 = (text: string) => {
    ensureSpace(26);
    page.drawText(text, { x: margin, y, size: 12.5, font: fontBold, color: rgb(0.12, 0.12, 0.12) });
    y -= 18;
  };

  const drawP = (text: string, size = 10.5, lineGap = 14.5) => {
    const lines = wrapLines(text, size);
    ensureSpace(lines.length * lineGap + 10);
    for (const l of lines) {
      page.drawText(l, { x: margin, y, size, font, color: colors.text });
      y -= lineGap;
    }
    y -= 6;
  };

  const drawList = (items: string[], bullet = "•") => {
    const size = 10.5;
    const lineGap = 14.5;
    for (const it of items) {
      const lines = wrapLines(it, size);
      ensureSpace(lines.length * lineGap + 10);

      page.drawText(bullet, { x: margin, y, size, font, color: colors.text });
      page.drawText(lines[0], { x: margin + 14, y, size, font, color: colors.text });
      y -= lineGap;

      for (let i = 1; i < lines.length; i++) {
        page.drawText(lines[i], { x: margin + 14, y, size, font, color: colors.text });
        y -= lineGap;
      }
      y -= 2;
    }
    y -= 6;
  };

  const drawKV = (label: string, value: string) => {
    const size = 10.5;
    const labelW = 165;
    ensureSpace(18);

    page.drawText(label, { x: margin, y, size, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

    const maxW = contentW - labelW;
    const words = (value || "-").replace(/\s+/g, " ").trim().split(" ");
    let line = "";
    const lines: string[] = [];
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      const width = font.widthOfTextAtSize(test, size);
      if (width > maxW) {
        if (line) lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    page.drawText(lines[0] ?? "-", { x: margin + labelW, y, size, font, color: rgb(0.15, 0.15, 0.15) });
    y -= 14.5;

    for (let i = 1; i < lines.length; i++) {
      ensureSpace(14.5);
      page.drawText(lines[i], { x: margin + labelW, y, size, font, color: rgb(0.15, 0.15, 0.15) });
      y -= 14.5;
    }

    y -= 4;
  };

  const org = {
    provider_name: "DEBACU HOTELS SL",
    provider_cif: "B-55381214",
    provider_address: "C/CANTALEJO,13-1º A",
    provider_email: "informacion@debacu.com",
    privacy_email: "privacidad@debacu.com",
  };

  // ✅ Parámetros server-side recomendados (ajustables)
  const retentionYears = Number.isFinite(Number(data.rgpd_retention_years)) ? Number(data.rgpd_retention_years) : 3; // tu criterio: 3 años
  const logRetentionDays = Number.isFinite(Number(data.rgpd_log_retention_days))
    ? Number(data.rgpd_log_retention_days)
    : 180;

  drawH1("Justificante de aceptación · Debacu Evaluation360");
  drawP(
    "Este documento reúne en un único PDF la evidencia de aceptación electrónica y el contenido legal aplicable al acceso y uso profesional de la plataforma (Aviso Legal, Términos y Condiciones, Política de Acceso y Uso Profesional y Encargo de Tratamiento – RGPD).",
  );
  hr();

  drawH2("Datos de la solicitud");
  drawKV("Solicitud (ID):", data.request_id);
  drawKV("Fecha/hora aceptación:", acceptedAtIso);
  drawKV("Versión documentos:", data.terms_version);

  if (data.accepted_ip || data.accepted_user_agent) {
    y -= 2;
    drawH2("Evidencia técnica de aceptación");
    drawKV("IP (x-forwarded-for):", data.accepted_ip ?? "-");
    drawKV("User-Agent:", data.accepted_user_agent ?? "-");
  } else {
    drawP(
      "Nota técnica: la IP y el User-Agent se registran a nivel de servidor y quedan asociados a esta solicitud (ID) en los registros internos.",
    );
  }

  hr();

  drawH2("Datos declarados por el solicitante");
  drawKV("Nombre comercial:", data.company_name);
  drawKV("Razón social:", data.legal_name ?? "-");
  drawKV("CIF:", data.cif);
  drawKV("Dirección:", data.address ?? "-");
  drawKV("Ciudad:", data.city ?? "-");
  drawKV("País:", data.country ?? "-");
  drawKV("Tipo alojamiento:", data.property_type ?? "-");
  drawKV("Nº habitaciones:", data.rooms_count?.toString() ?? "-");
  drawKV("Web:", data.website ?? "-");
  drawKV("Responsable:", data.contact_name);
  drawKV("Cargo:", data.contact_role ?? "-");
  drawKV("Email:", data.email);
  drawKV("Teléfono:", data.phone ?? "-");

  if (data.notes?.trim()) {
    hr();
    drawH2("Observaciones (aportadas por el solicitante)");
    drawP(data.notes.trim());
  }

  hr();
  drawH2("Declaración de aceptación electrónica");
  drawP(
    "El solicitante declara haber leído y aceptado expresamente los documentos incluidos en este PDF y consiente su incorporación como evidencia de aceptación vinculada a la solicitud indicada.",
  );
  drawP(
    "Este documento ha sido aceptado electrónicamente, sin necesidad de firma manuscrita, conforme a la Ley 34/2002 (LSSI-CE) y el Reglamento (UE) 910/2014 (eIDAS).",
  );

  newPage();

  drawH1("Documento 1 · Aviso Legal");
  drawP(
    "En cumplimiento de la normativa aplicable, se informa que el sitio y la plataforma Debacu Evaluation360 (en adelante, la “Plataforma”) es titularidad del proveedor indicado a continuación.",
  );
  drawH2("1. Titularidad");
  drawList([
    `Titular / Razón social: ${org.provider_name}`,
    `CIF/NIF: ${org.provider_cif}`,
    `Domicilio: ${org.provider_address}`,
    `Email de contacto: ${org.provider_email}`,
  ]);
  drawH2("2. Objeto y naturaleza del servicio");
  drawP(
    "La Plataforma proporciona un entorno privado de uso profesional para alojamientos y equipos operativos, orientado a la gestión interna de incidencias y trazabilidad (consultas, registros y auditoría). No se trata de un servicio público ni de un registro accesible al público general.",
  );
  drawH2("3. Acceso y registro");
  drawP(
    "El acceso puede requerir alta controlada, creación de cuenta y autenticación. El usuario se compromete a facilitar información veraz, mantenerla actualizada y custodiar sus credenciales, evitando el uso compartido no autorizado.",
  );
  drawH2("4. Normas de uso");
  drawP(
    "El usuario se compromete a utilizar la Plataforma de forma diligente, lícita y conforme a la finalidad profesional descrita. Queda prohibida la difusión pública de información obtenida en la Plataforma, la recolección automatizada no autorizada, así como cualquier uso difamatorio, discriminatorio o contrario a la buena fe.",
  );
  drawH2("5. Propiedad intelectual e industrial");
  drawP(
    "Los contenidos, marcas, diseños, software y elementos de la Plataforma están protegidos por derechos de propiedad intelectual e industrial. Queda prohibida su reproducción, distribución o explotación no autorizada.",
  );
  drawH2("6. Responsabilidad");
  drawP(
    "La Plataforma se ofrece “tal cual”, con esfuerzos razonables de disponibilidad y seguridad. El usuario es responsable del uso que haga de la información en su propia operativa.",
  );
  drawH2("7. Enlaces y terceros");
  drawP("Pueden existir enlaces a sitios de terceros. El titular no se responsabiliza de sus contenidos, disponibilidad o políticas.");
  drawH2("8. Legislación y jurisdicción");
  drawP(
    "Este Aviso Legal se rige por la legislación española. Para cualquier controversia, las partes se someterán a los juzgados y tribunales competentes conforme a la normativa aplicable.",
  );

  newPage();

  drawH1("Documento 2 · Términos y Condiciones");
  drawP(
    "Estos términos regulan el acceso y uso de la Plataforma Debacu Evaluation360. Al registrarte, solicitar acceso o utilizar la Plataforma, aceptas estas condiciones en la versión indicada.",
  );
  drawH2("1. Definiciones");
  drawList([
    "Plataforma: software y servicios Debacu Evaluation360, de acceso privado y uso profesional.",
    "Cliente / Organización: entidad (p. ej., hotel o alojamiento) que solicita acceso y contrata (si aplica) planes de suscripción.",
    "Usuario: persona física autorizada por la Organización para acceder.",
  ]);
  drawH2("2. Cuenta, acceso y seguridad");
  drawList([
    "El usuario es responsable de mantener la confidencialidad de sus credenciales y del uso bajo su cuenta.",
    "La Organización deberá asegurar que solo personal autorizado accede a la Plataforma.",
    "Podemos suspender accesos ante indicios razonables de abuso, fraude, incidentes de seguridad o incumplimiento.",
  ]);
  drawH2("3. Uso profesional y limitaciones");
  drawP(
    "La Plataforma es privada y de uso profesional. Queda prohibida la difusión pública de información, la extracción masiva o automatizada no autorizada y cualquier uso contrario a la finalidad operativa interna.",
  );
  drawH2("4. Planes, suscripción y facturación (si aplica)");
  drawList([
    "La Plataforma puede ofrecer planes (incluyendo un plan inicial gratuito limitado) y planes de pago.",
    "La facturación y cobros pueden gestionarse mediante proveedores como Stripe u otros equivalentes.",
    "No almacenamos datos completos de tarjeta; el pago se procesa por el proveedor de pagos.",
    "Las condiciones económicas, límites de uso y prestaciones se detallan en la configuración del plan vigente.",
  ]);
  drawH2("5. Renovación, cambios y cancelación (si aplica)");
  drawList([
    "Las suscripciones pueden renovarse automáticamente según el plan y la periodicidad contratada.",
    "El usuario/cliente puede solicitar cambios de plan según disponibilidad y reglas internas de la Plataforma.",
    "La cancelación puede realizarse desde el área de cuenta o el portal del proveedor de pagos si está habilitado.",
  ]);
  drawH2("6. Contenidos y responsabilidad del Cliente");
  drawP(
    "El Cliente es responsable de los datos y contenidos que registra en la Plataforma, incluyendo su exactitud, pertinencia y adecuación legal. Se recomienda evitar datos excesivos o no pertinentes, así como expresiones ofensivas o valoraciones discriminatorias.",
  );
  drawH2("7. Limitación de responsabilidad");
  drawP(
    "La Plataforma ofrece herramientas de apoyo a procesos internos. Las decisiones que el Cliente adopte basadas en la información o en su uso operativo son responsabilidad del Cliente. No se garantiza ausencia total de errores, interrupciones o indisponibilidades, sin perjuicio de los esfuerzos razonables de continuidad y seguridad.",
  );
  drawH2("8. Soporte");
  drawP(
    "El soporte puede variar según el plan. El alcance y tiempos de respuesta podrán definirse en el plan contratado o en acuerdos de nivel de servicio (SLA) cuando existan.",
  );
  drawH2("9. Modificaciones");
  drawP(
    "Podemos actualizar estas condiciones por cambios legales o del servicio. La versión vigente estará publicada y se identificará por su versión/fecha.",
  );

  newPage();

  drawH1("Documento 3 · Política de Acceso y Uso Profesional");
  drawP(
    "Esta política concreta el carácter restringido, interno y profesional de la Plataforma y establece reglas de uso para garantizar trazabilidad, seguridad y calidad de la información.",
  );
  drawH2("1. Acceso restringido");
  drawP(
    "Debacu Evaluation360 es una plataforma privada destinada a profesionales del sector alojamiento. El acceso se concede de forma controlada a organizaciones verificadas y usuarios autorizados.",
  );
  drawH2("2. Uso interno y no público");
  drawList([
    "No es un registro público, no es indexable y no está pensado para difusión externa.",
    "La información está orientada a protocolos internos y mejora operativa.",
    "Se prohíbe publicar, compartir o redistribuir contenidos fuera de la organización o sin base legal.",
  ]);
  drawH2("3. Criterios estructurados y minimización");
  drawP(
    "El sistema fomenta el registro estructurado (motivos, tipologías, severidad, fechas y evidencias internas), minimizando opiniones y evitando datos excesivos. El Cliente se compromete a registrar solo información pertinente, verificable y relacionada con su operativa.",
  );
  drawH2("4. Auditoría y trazabilidad");
  drawP(
    "Para control interno y seguridad, se registran acciones relevantes (consultas, altas, modificaciones, cambios de permisos, exportaciones cuando existan) asociadas a la cuenta. Estos registros se usan para prevenir abuso, investigar incidencias y reforzar la trazabilidad.",
  );
  drawH2("5. Prohibiciones específicas");
  drawList([
    "Uso discriminatorio o contrario a derechos fundamentales.",
    "Uso como “lista pública” o exposición de terceros.",
    "Extracción masiva o automatizada no autorizada.",
    "Introducir datos sensibles innecesarios o no pertinentes (salvo estricta necesidad y base legal).",
  ]);
  drawH2("6. Medidas ante abuso");
  drawP(
    "En caso de uso indebido, el titular podrá suspender o cancelar accesos y/o limitar funcionalidades para proteger la Plataforma, sin perjuicio de las acciones legales que procedan.",
  );

  newPage();

  drawH1("Documento 4 · Encargo de Tratamiento (DPA) · RGPD");
  drawP(
    "Este documento regula el encargo de tratamiento cuando el Cliente incorpora datos personales a la Plataforma. En un entorno B2B, normalmente el Cliente (hotel/alojamiento) actúa como Responsable del tratamiento y el proveedor de la Plataforma como Encargado del tratamiento, en los términos del art. 28 RGPD.",
  );
  drawH2("1. Partes");
  drawList([
    `Responsable (Cliente): ${data.legal_name ?? data.company_name} · CIF ${data.cif} · ${data.address ?? "-"} · ${data.city ?? "-"} · ${
      data.country ?? "-"
    }`,
    `Encargado (Proveedor): DEBACU HOTELS SL · CIF B-55381214 · C/CANTALEJO,13-1º A · informacion@debacu.com`,
  ]);
  drawH2("2. Objeto del encargo");
  drawP(
    "Prestación del servicio de plataforma privada para gestión operativa con trazabilidad, conforme a instrucciones documentadas del Responsable, incluyendo: almacenamiento, consulta, registro, modificación, auditoría y soporte.",
  );

  // ✅ Añadido: finalidad + prevención de fraude contractual (interés legítimo)
  drawH2("3. Finalidad y base jurídica (Responsable)");
  drawP(
    "La finalidad del tratamiento por parte del Responsable incluye la gestión operativa y la prevención de fraude contractual, impagos, daños, no-shows y otras incidencias vinculadas a la relación de hospedaje. La base jurídica aplicable será la que determine el Responsable (p. ej., ejecución de contrato o interés legítimo del art. 6.1.f RGPD), cumpliendo el deber de información y, cuando proceda, realizando la ponderación del interés legítimo.",
  );

  drawH2("4. Duración");
  drawP(
    "Durante la vigencia de la relación contractual o de acceso autorizado al servicio, y mientras sea necesario para la prestación del mismo, sin perjuicio de obligaciones legales de conservación.",
  );

  drawH2("5. Naturaleza, categorías de interesados y tipos de datos");
  drawList([
    "Naturaleza del tratamiento: recogida por el Responsable, almacenamiento, estructuración, consulta y auditoría.",
    "Interesados: clientes/huéspedes u otras personas relacionadas con la operativa del Responsable, según el uso del Responsable.",
    "Tipos de datos: según el uso del Responsable. Se recomienda minimización y estructuración (tipologías, fechas, importes, evidencias internas).",
  ]);
  drawP(
    "El Responsable se compromete a evitar el registro de datos excesivos, especialmente categorías especiales (art. 9 RGPD) salvo estricta necesidad, base jurídica y garantías adecuadas.",
  );

  drawH2("6. Seudonimización y diseño seguro (recomendado)");
  drawList([
    "La Plataforma puede emplear identificadores técnicos seudonimizados (p. ej., claves derivadas tipo HMAC) para evitar el tratamiento innecesario de identificadores directos.",
    "Las claves secretas/pepper necesarias para derivaciones se mantienen fuera del alcance del Cliente y no se exponen en interfaces públicas.",
    "El Responsable seguirá siendo responsable de la licitud del tratamiento y de no introducir datos directos innecesarios.",
  ]);

  drawH2("7. Obligaciones del Encargado (art. 28 RGPD)");
  drawList([
    "Tratar los datos personales únicamente siguiendo instrucciones documentadas del Responsable, salvo obligación legal aplicable.",
    "Garantizar que el personal autorizado se compromete a confidencialidad.",
    "Adoptar medidas técnicas y organizativas apropiadas para garantizar un nivel de seguridad adecuado (art. 32 RGPD).",
    "Asistir al Responsable, cuando proceda, en la atención de solicitudes de derechos de los interesados (arts. 12–22 RGPD).",
    "Asistir al Responsable en la gestión de violaciones de seguridad (arts. 33–34 RGPD), sin dilación indebida, una vez tenga conocimiento.",
    "Poner a disposición del Responsable la información necesaria para demostrar el cumplimiento del art. 28 RGPD, y permitir auditorías razonables (con preaviso y sin comprometer seguridad/terceros).",
  ]);

  drawH2("8. Obligaciones del Responsable");
  drawList([
    "Garantizar base jurídica para el tratamiento y deber de información a los interesados cuando proceda.",
    "Configurar y usar la Plataforma conforme a minimización y finalidad operativa.",
    "Gestionar permisos/roles y accesos de sus usuarios autorizados.",
    "Atender solicitudes de derechos y reclamaciones, con apoyo del Encargado cuando aplique.",
  ]);

  drawH2("9. Subencargados");
  drawP(
    "El Encargado podrá utilizar subencargados necesarios para la prestación del servicio (p. ej., infraestructura/hosting, correo transaccional, pasarela de pagos), garantizando obligaciones equivalentes mediante acuerdos adecuados.",
  );
  drawList([
    "Infraestructura/hosting (p. ej., Supabase/Cloud, según configuración).",
    "Correo transaccional (p. ej., Brevo), si se utiliza.",
    "Pagos/suscripciones (p. ej., Stripe), si aplica.",
  ]);

  drawH2("10. Transferencias internacionales");
  drawP(
    "Si algún proveedor tratase datos fuera del EEE, se aplicarán garantías adecuadas (p. ej., Cláusulas Contractuales Tipo) y/o decisiones de adecuación, según corresponda.",
  );

  // ✅ Añadido: conservación / retención (la pieza que suele faltar)
  drawH2("11. Conservación, supresión y limitación temporal");
  drawList([
    `El Responsable definirá y aplicará su política de conservación. A efectos orientativos, se recomienda una conservación máxima de ${retentionYears} años para incidencias operativas, salvo obligación legal o reclamaciones en curso.`,
    `Los registros de auditoría y seguridad se conservan por periodos limitados, orientativamente ${logRetentionDays} días, salvo necesidad de investigación de incidentes o cumplimiento normativo.`,
    "Al finalizar el servicio, el Encargado suprimirá o devolverá los datos personales, según instrucciones del Responsable, salvo obligación legal de conservación.",
    "Podrán mantenerse copias residuales en sistemas de respaldo por periodos limitados y bajo controles de seguridad.",
  ]);

  hr();
  drawH1("Anexo II · Medidas Técnicas y Organizativas (art. 32 RGPD)");
  drawP(
    "Este anexo describe medidas orientativas aplicadas por el Encargado para proteger los datos tratados en la Plataforma. El nivel de medidas podrá variar según configuración, plan y alcance contratado, manteniendo un enfoque de seguridad razonable y proporcional al riesgo.",
  );
  drawH2("A. Control de acceso y autenticación");
  drawList([
    "Principio de mínimos privilegios: cada usuario accede a lo necesario según su rol.",
    "Autenticación y gestión de sesiones con controles de expiración y revocación.",
    "Recomendación de contraseñas robustas y, cuando aplique, medidas adicionales (p. ej., MFA).",
  ]);
  drawH2("B. Trazabilidad, auditoría y registros");
  drawList([
    "Registro de eventos relevantes de seguridad y actividad (p. ej., accesos, operaciones sensibles, cambios de permisos).",
    "Protección razonable de logs y acceso restringido a personal autorizado.",
    "Retención limitada de logs conforme a necesidad operativa y seguridad.",
  ]);
  drawH2("C. Cifrado y comunicaciones");
  drawList(["Cifrado en tránsito mediante HTTPS/TLS.", "Uso de canales seguros para comunicaciones operativas y administrativas."]);
  drawH2("D. Segregación y aislamiento");
  drawList([
    "Separación lógica por organización cuando aplica (controles de acceso y políticas).",
    "Limitaciones de acceso a datos entre organizaciones y roles.",
  ]);
  drawH2("E. Disponibilidad y resiliencia");
  drawList([
    "Uso de infraestructura en la nube con capacidades de redundancia y continuidad (según proveedor).",
    "Copias de seguridad y mecanismos de recuperación ante incidencias (según configuración).",
  ]);
  drawH2("F. Gestión de vulnerabilidades e incidentes");
  drawList([
    "Procedimientos para identificar, contener y corregir incidentes de seguridad.",
    "Notificación al Responsable sin dilación indebida cuando una brecha afecte a datos personales, conforme RGPD.",
  ]);
  drawH2("G. Confidencialidad y formación");
  drawList([
    "Compromisos de confidencialidad del personal con acceso a sistemas.",
    "Buenas prácticas y controles organizativos razonables para limitar accesos.",
  ]);
  drawH2("H. Minimización y buenas prácticas del Cliente");
  drawList([
    "El Cliente debe evitar registrar datos excesivos o no pertinentes.",
    "Evitar categorías especiales salvo estricta necesidad, base legal y garantías.",
    "Revisar periódicamente usuarios, roles y accesos.",
  ]);

  // ✅ Añadido: “no lista pública / no decisiones automatizadas”
  drawH2("I. Salvaguardas de uso profesional");
  drawList([
    "La Plataforma no es un registro público ni una lista de difusión; el Cliente no debe usarla como “lista negra” pública ni para decisiones discriminatorias.",
    "Se recomienda que cualquier medida operativa relevante se base en revisión humana y evidencias internas del Cliente (cuando existan).",
  ]);

  hr();
  drawH2("Contacto y ejercicio de derechos (cuando proceda)");
  drawP(
    `Para cuestiones de privacidad y seguridad: ${org.privacy_email}. Para cuestiones contractuales o del servicio: ${org.provider_email}.`,
  );

  footer();
  return await pdfDoc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, errPayload("method_not_allowed"));

  const started = Date.now();

  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const requestId = (body?.request_id ?? "").trim();
    const providedEmail = normalizeEmail(body?.email);

    if (!requestId) return badRequest(req, "missing_request_id");

    const supabase = supabaseServiceClient();

    // 1) Leer la solicitud (service role)
    // ⚠️ IMPORTANTE: NO seleccionar columnas inexistentes (auth_user_id / request_token)
    const { data: row, error: readErr } = await supabase
      .from("debacu_eval_access_requests")
      .select(
        `
        id,
        created_at,
        status,
        company_name,
        legal_name,
        cif,
        address,
        city,
        country,
        property_type,
        rooms_count,
        website,
        contact_name,
        contact_role,
        email,
        phone,
        notes,
        accepted_terms,
        accepted_terms_pdf_path,
        accepted_terms_pdf_sha256,
        accepted_terms_accepted_at,
        terms_version,
        accepted_terms_pdf_bucket
      `,
      )
      .eq("id", requestId)
      .maybeSingle();

    if (readErr) {
      console.error("db_read_failed", {
        request_id: requestId,
        message: readErr.message,
        details: (readErr as any).details,
        hint: (readErr as any).hint,
        code: (readErr as any).code,
      });
      return serverError(req, "db_read_failed", readErr.message);
    }

    if (!row) return notFound(req);

    const rowEmail = normalizeEmail((row as any).email);
    const rowStatus = String((row as any).status ?? "").toUpperCase();

    // 2) Autorización mínima SIN usuario:
    // - Ideal: validar email del body contra email en BD
    // - Si no viene email, limitar a status PENDING y created_at < 24h
    if (providedEmail) {
      if (!rowEmail || providedEmail !== rowEmail) return forbidden(req, "email_mismatch");
    } else {
      // Sin email: no lo recomiendo, pero al menos no aceptes requests viejas o ya revisadas.
      if (rowStatus !== "PENDING") return forbidden(req, "forbidden_status");
      const createdAt = new Date((row as any).created_at);
      const ageMs = Date.now() - createdAt.getTime();
      if (!Number.isFinite(ageMs) || ageMs > 24 * 60 * 60 * 1000) {
        return forbidden(req, "request_expired");
      }
    }

    // 3) Idempotencia
    if ((row as any).accepted_terms === true && (row as any).accepted_terms_pdf_path) {
      return json(req, 200, {
        ok: true,
        proof: {
          request_id: (row as any).id,
          bucket: (row as any).accepted_terms_pdf_bucket ?? LEGAL_BUCKET,
          path: (row as any).accepted_terms_pdf_path,
          sha256: (row as any).accepted_terms_pdf_sha256,
          accepted_at: (row as any).accepted_terms_accepted_at,
          terms_version: (row as any).terms_version ?? TERMS_VERSION,
        },
      });
    }

    // 4) Validaciones mínimas para PDF coherente
    if (!(row as any).company_name) return badRequest(req, "missing_company_name");
    if (!(row as any).cif) return badRequest(req, "missing_cif");
    if (!(row as any).contact_name) return badRequest(req, "missing_contact_name");
    if (!(row as any).email) return badRequest(req, "missing_email");

    // 5) Preparar PDF
    const acceptedAt = nowIso();
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? null;

    const pdfData: PdfData = {
      request_id: (row as any).id,
      terms_version: TERMS_VERSION,

      company_name: (row as any).company_name,
      legal_name: (row as any).legal_name,
      cif: (row as any).cif,
      address: (row as any).address,
      city: (row as any).city,
      country: (row as any).country,
      property_type: ((row as any).property_type as PropertyType | null) ?? null,
      rooms_count: (row as any).rooms_count,
      website: (row as any).website,

      contact_name: (row as any).contact_name,
      contact_role: (row as any).contact_role,
      email: (row as any).email,
      phone: (row as any).phone,

      notes: (row as any).notes,

      accepted_ip: ip,
      accepted_user_agent: userAgent,

      // ✅ Políticas server-side que quedan reflejadas en el PDF (orientativas)
      rgpd_retention_years: 3,
      rgpd_log_retention_days: 180,
    };

    const pdfBytes = await buildPdf(pdfData, acceptedAt);

    // 6) Hash SHA256 del PDF (integridad del fichero)
    const digest = await crypto.subtle.digest("SHA-256", pdfBytes);
    const sha256 = toHex(digest);

    // 7) Upload a Storage (NO upsert)
    const safeTs = safeTimestamp(acceptedAt);
    const uniq = crypto.randomUUID();
    const path = `debacu_eval/${(row as any).id}/terms_acceptance_${safeTs}_${uniq}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from(LEGAL_BUCKET)
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });

    if (uploadError) {
      console.error("storage_upload_failed", {
        request_id: requestId,
        message: uploadError.message,
        name: (uploadError as any).name,
      });
      return serverError(req, "storage_upload_failed", uploadError.message);
    }

    // 8) Persistir aceptación en BD
    // ✅ además marcamos DPA + Anexo II como aceptados (van incluidos dentro del mismo PDF)
    // ✅ guardamos hash canónico del “paquete legal” (estable, no depende del PDF final)
    const acceptanceLocale =
      (req.headers.get("accept-language") || "").split(",")[0]?.trim() || "es-ES";

    const canonicalDocString = [
      "DEBACU_EVAL_LEGAL_PACKAGE",
      `TERMS_VERSION=${TERMS_VERSION}`,
      `DPA_VERSION=${TERMS_VERSION}`,
      `RGPD_ANNEX_II_VERSION=${TERMS_VERSION}`,
      `RETENTION_YEARS=${String(pdfData.rgpd_retention_years ?? 3)}`,
      `LOG_RETENTION_DAYS=${String(pdfData.rgpd_log_retention_days ?? 180)}`,
      `LOCALE=${acceptanceLocale}`,
    ].join("|");

    const canonicalDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonicalDocString),
    );
    const canonicalHash = toHex(canonicalDigest);

    const { error: updateError } = await supabase
      .from("debacu_eval_access_requests")
      .update({
        accepted_terms: true,
        accepted_terms_pdf_bucket: LEGAL_BUCKET,
        accepted_terms_pdf_path: path,
        accepted_terms_pdf_sha256: sha256,
        accepted_terms_accepted_at: acceptedAt,
        accepted_terms_at: acceptedAt, // ✅ lo estabas dejando null en tu tabla
        accepted_terms_ip: ip,
        accepted_terms_user_agent: userAgent,
        terms_version: TERMS_VERSION,

        // ✅ DPA (Encargo de tratamiento) — reutilizamos el mismo PDF
        dpa_accepted: true,
        dpa_version: TERMS_VERSION,
        dpa_accepted_at: acceptedAt,
        dpa_ip: ip,
        dpa_user_agent: userAgent,
        dpa_pdf_bucket: LEGAL_BUCKET,
        dpa_pdf_path: path,
        dpa_pdf_sha256: sha256,

        // ✅ RGPD Annex II — incluido en el mismo PDF
        rgpd_annex_ii_version: TERMS_VERSION,
        rgpd_annex_ii_accepted_at: acceptedAt,

        // ✅ Metadatos útiles para RGPD / evidencia
        acceptance_legal_basis: "ART_6_1_F_INTERES_LEGITIMO_PREVENCION_FRAUDE_Y_SEGURIDAD",
        acceptance_locale: acceptanceLocale,

        accepted_terms_doc_hash_algo: "SHA-256",
        accepted_terms_doc_hash: canonicalHash,
      })
      .eq("id", (row as any).id);

    if (updateError) {
      console.error("db_update_failed", {
        request_id: requestId,
        message: updateError.message,
        details: (updateError as any).details,
        hint: (updateError as any).hint,
        code: (updateError as any).code,
      });

      // best-effort cleanup para evitar orphan files
      try {
        await supabase.storage.from(LEGAL_BUCKET).remove([path]);
      } catch {
        // ignore
      }

      return serverError(req, "db_update_failed", updateError.message);
    }

    console.log("ok", { request_id: requestId, ms: Date.now() - started });

    return json(req, 200, {
      ok: true,
      proof: {
        request_id: (row as any).id,
        bucket: LEGAL_BUCKET,
        path,
        sha256,
        accepted_at: acceptedAt,
        terms_version: TERMS_VERSION,

        // ✅ extra evidencia útil (no rompe compatibilidad)
        dpa_accepted: true,
        dpa_version: TERMS_VERSION,
        rgpd_annex_ii_version: TERMS_VERSION,
        accepted_terms_doc_hash: canonicalHash,
        accepted_terms_doc_hash_algo: "SHA-256",
        acceptance_locale: acceptanceLocale,
      },
    });
  } catch (e: any) {
    console.error("internal_error", {
      message: e?.message ?? String(e),
      stack: e?.stack,
      ms: Date.now() - started,
    });
    return serverError(req, "internal_error", e?.message ?? String(e));
  }
});