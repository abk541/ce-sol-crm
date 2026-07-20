export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 8 characters and include one uppercase letter, one number, and one special character.'

export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (password: string) => password.length >= 8 },
  { label: 'One uppercase letter', test: (password: string) => /[A-Z]/.test(password) },
  { label: 'One number', test: (password: string) => /\d/.test(password) },
  { label: 'One special character', test: (password: string) => /[^A-Za-z0-9]/.test(password) },
] as const

export function passwordMeetsPolicy(password: string): boolean {
  return PASSWORD_RULES.every(rule => rule.test(password))
}
