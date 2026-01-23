from pathlib import Path

path = Path("src/components/SubscriptionManager2.tsx")
text = path.read_text()
start_marker = "  useEffect(() => {"
end_marker = "  }, \\[customerId, sb, user\\.monthlyFee, user\\]\\);"
start = text.find(start_marker)
if start == -1:
    raise SystemExit("start marker not found")
end = text.find("  }, [customerId, sb, user.monthlyFee, user]);", start)
if end == -1:
    raise SystemExit("end marker not found")
end += len("  }, [customerId, sb, user.monthlyFee, user]);")
new_block = """  useEffect(() => {
    if (!customerId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setPlanError(null);
      try {
        const [customerResult, receiptsResult, plansResult] = await Promise.all([
          sb
            .from("customers")
            .select("name,nif,address,postal_code,city,province,country,phone,email,iban,swift,bank_name,bank_address")
            .eq("id", customerId)
            .maybeSingle(),
          sb
            .from("receipts")
            .select("id,date,amount,concept,status")
            .eq("customer_id", customerId)
            .order("date", { ascending: false })
            .limit(5),
          sb
            .from("plans")
            .select("id,name,code,price_monthly,max_queries_per_month")
            .eq("app_id", "DEBACU_EVAL")
            .in("code", PLAN_SEQUENCE),
        ]);

        if (!cancelled) {
          const profile = customerResult?.data;
          if (profile) {
            setCustomerProfile((prev) => ({
              ...prev,
              name: profile.name ?? prev.name,
              nif: profile.nif ?? prev.nif,
              address: profile.address ?? prev.address,
              postalCode: profile.postal_code ?? prev.postalCode,
              city: profile.city ?? prev.city,
              province: profile.province ?? prev.province,
              country: profile.country ?? prev.country,
              phone: profile.phone ?? prev.phone,
              email: profile.email ?? prev.email,
            }));
            setBankData({
              iban: profile.iban ?? "",
              swift: profile.swift ?? "",
              bankName: profile.bank_name ?? "",
              bankAddress: profile.bank_address ?? "",
            });
          }

          const receipts = (receiptsResult?.data ?? []) as any[];
          setInvoices(
            receipts.map((row) => ({
              id: row.id,
              date: row.date,
              amount: Number(row.amount) || 0,
              description: row.concept ?? "Factura",
              status: row.status === "PAID" ? "Paid" : "Pending",
            }))
          );

          const planRows = (plansResult?.data ?? []) as Array<{
            id: string;
            code: string | null;
            name: string;
            price_monthly: number | null;
            max_queries_per_month: number | null;
          }>;
          const constructedPlans: AvailablePlan[] = PLAN_SEQUENCE.map((code) => {
            const row = planRows.find((plan) => String(plan.code ?? "").toUpperCase() === code);
            const meta = PLAN_METADATA[code];
            return {
              id: row?.id ?? code,
              code,
              name: row?.name ?? meta.name,
              priceMonthly: Number(row?.price_monthly ?? meta.defaultPrice),
              description: meta.description,
              maxQueries: row?.max_queries_per_month ?? meta.maxQueries,
            };
          });
          setAvailablePlans(constructedPlans);
        }
      } catch (error: any) {
        console.error("Error cargando datos de plan:", error);
        if (!cancelled) setPlanError(error?.message ?? "Error cargando datos de plan.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const url = new URL(window.location.href);
    const hasSessionId = url.searchParams.has("session_id");
    if (hasSessionId) {
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
    }

    void load();
    if (hasSessionId) {
      setTimeout(() => {
        void load();
      }, 2500);
    }

    return () => {
      cancelled = true;
    };
  }, [customerId, sb]);

"""
text = text[:start] + new_block + text[end:]
path.write_text(text)
