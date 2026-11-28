import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MAIN_COMPANY_ID, MAIN_LINE } from "@technofluid/core";
import { useStaff } from "@/features/auth/session";
import { watchCompanies, type CompanyRow } from "@/services/companyService";
import { rememberCompany, rememberedCompany, setCurrentCompany } from "@/services/currentCompany";

interface CompanyApi {
  companyId: string;
  /** null until the list has loaded (and always for non-admins). */
  company: CompanyRow | null;
  companies: CompanyRow[];
  /** Admin only — switches every screen to that company. */
  switchTo: (companyId: string) => void;
  canSwitch: boolean;
}

const Ctx = createContext<CompanyApi>({ companyId: MAIN_COMPANY_ID, company: null, companies: [], switchTo: () => {}, canSwitch: false });

/**
 * The current company. Admin picks it (remembered on this computer); everyone else works
 * in the main company. A remembered company that no longer exists, is archived or can't be
 * opened falls back to main.
 */
export function CompanyProvider({ children }: { children: ReactNode }) {
  const { role } = useStaff();
  const isAdmin = role === "admin";
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [wanted, setWanted] = useState<string>(() => (isAdmin ? rememberedCompany() ?? MAIN_COMPANY_ID : MAIN_COMPANY_ID));

  useEffect(() => {
    if (!isAdmin) return;
    return watchCompanies(setCompanies, () => setCompanies([]));
  }, [isAdmin]);

  const company = companies.find((c) => c.id === wanted && !c.accessLost) ?? null;
  // Until the list is in, trust the remembered id; once it is, fall back to main if it's gone.
  const companyId = isAdmin && (company || !companies.length) ? wanted : MAIN_COMPANY_ID;
  const line = company?.line ?? (companyId === MAIN_COMPANY_ID ? MAIN_LINE : companyId);
  setCurrentCompany(companyId, line);

  const switchTo = useCallback(
    (id: string) => {
      if (!isAdmin) return;
      rememberCompany(id);
      setWanted(id);
    },
    [isAdmin],
  );

  const value = useMemo(
    () => ({ companyId, company: company ?? companies.find((c) => c.id === MAIN_COMPANY_ID) ?? null, companies, switchTo, canSwitch: isAdmin && companies.length > 1 }),
    [companyId, company, companies, switchTo, isAdmin],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCompany = () => useContext(Ctx);
