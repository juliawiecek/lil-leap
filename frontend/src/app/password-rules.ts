/** A password rule shown as a checklist item while the user types. */
export interface PasswordRule {
  readonly label: string;
  readonly test: (value: string) => boolean;
}

/** The sign-up password rules, shared with Settings so changing a password asks for exactly the same. */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  { label: 'At least 12 characters', test: (value) => value.length >= 12 },
  { label: 'An uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { label: 'A lowercase letter', test: (value) => /[a-z]/.test(value) },
  { label: 'A number', test: (value) => /\d/.test(value) },
  { label: 'A symbol (such as !, @, or #)', test: (value) => /[^A-Za-z0-9\s]/.test(value) },
];
