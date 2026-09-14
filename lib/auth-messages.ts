/**
 * Human-readable messages for the error codes the auth actions redirect with.
 *
 * These live outside lib/actions/auth.ts on purpose: a `"use server"` module may
 * only export async functions, so a plain constant map cannot be exported from
 * there.
 */
export const AUTH_ERRORS = {
  missing: "Enter both your email address and password.",
  invalid: "Those credentials are not correct. Please try again.",
  email_taken: "An account already exists with that email address.",
  weak_password:
    "Password must be at least 8 characters and include a letter and a number.",
  password_mismatch: "The two passwords do not match.",
  invalid_input: "Please check the form and try again.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERRORS;

export function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return code in AUTH_ERRORS ? AUTH_ERRORS[code as AuthErrorCode] : null;
}
