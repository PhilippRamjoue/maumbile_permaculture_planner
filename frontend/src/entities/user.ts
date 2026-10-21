/** Mirrors `UserRead` (backend/app/modules/auth/schemas.py). */
export interface User {
  id: string;
  email: string;
  display_name: string | null;
  country_code: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  display_name?: string;
  country_code?: string;
}
