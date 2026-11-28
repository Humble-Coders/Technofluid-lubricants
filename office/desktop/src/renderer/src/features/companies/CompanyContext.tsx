import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MAIN_COMPANY_ID, MAIN_LINE, companyForDate, indiaDate } from "@technofluid/core";
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
 * The current company. Admin picks it (remembered on this computer; at first, the main
 * business's company for today). Everyone else works in the main business — its company for
 * today (the current financial year), seeing all its years' records. A remembered company that
 * no longer exists or can't be opened falls back to that.
 */
export function CompanyProvider({ children }: { children: ReactNode }) {
  const { role } = useStaff();
  const isAdmin = role === "admin";
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [wanted, setWanted] = useState<string | null>(() => (isAdmin ? rememberedCompany() : null));

  useEffect(() => watchCompanies(setCompanies, () => setCompanies([]), !isAdmin), [isAdmin]);

  const today = indiaDate();
  const todays = companyForDate(companies.filter((c) => !c.accessLost), MAIN_LINE, today);
  const picked = isAdmin && wanted ? companies.find((c) => c.id === wanted && !c.accessLost) ?? null : null;
  const company = picked ?? todays;
  // Until the list is in, trust the remembered id; once it is, fall back to today's main-business company.
  const companyId = picked ? picked.id : isAdmin && wanted && !companies.length ? wanted : (todays?.id ?? MAIN_COMPANY_ID);
  const line = company?.line ?? (companyId === MAIN_COMPANY_ID ? MAIN_LINE : companyId);
  setCurrentCompany(companyId, line, isAdmin);

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
