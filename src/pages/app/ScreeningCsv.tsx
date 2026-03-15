// src/pages/app/ScreeningCsv.tsx
import React, { useMemo } from "react";
import ScreeningCsvPage from "@/components/ScreeningCsvPage";
import { LS_KEYS } from "@/services/storageKeys";

type Props = {
  orgId?: string | null;
  propertyId?: string | null;
  propertyName?: string | null;
};

function clean(v?: string | null) {
  const s = String(v || "").trim();
  return s.length > 0 ? s : "";
}

export default function ScreeningCsv(props: Props) {
  const orgId = useMemo(() => {
    const fromProps = clean(props.orgId);
    if (fromProps) return fromProps;
    return clean(localStorage.getItem(LS_KEYS.ORG_ID));
  }, [props.orgId]);

  const propertyId = useMemo(() => {
    const fromProps = clean(props.propertyId);
    if (fromProps) return fromProps;
    return clean(localStorage.getItem(LS_KEYS.ACTIVE_PROPERTY_ID));
  }, [props.propertyId]);

  const propertyName = useMemo(() => {
    return clean(props.propertyName) || null;
  }, [props.propertyName]);

  return (
    <ScreeningCsvPage
      orgId={orgId}
      propertyId={propertyId || null}
      propertyName={propertyName}
    />
  );
}