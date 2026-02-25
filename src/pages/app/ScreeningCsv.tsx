// src/pages/app/ScreeningCsv.tsx
import React, { useMemo } from "react";
import ScreeningCsvPage from "@/components/ScreeningCsvPage";

const LS_ORG_ID = "debacu_eval_org_id";

export default function ScreeningCsv() {
  const orgId = useMemo(() => {
    return localStorage.getItem(LS_ORG_ID) || "";
  }, []);

  return <ScreeningCsvPage orgId={orgId} />;
}