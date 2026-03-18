import "express";
import { AppUserRole } from "../repositories/auth.repository";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        name: string;
        username: string;
        role: AppUserRole;
        company_id?: string | null;
        company_name?: string | null;
        company_cnpj?: string | null;
        sector_id?: string | null;
        sector_name?: string | null;
      };
      authSessionId?: string;
    }
  }
}

export {};
