import { z } from 'zod';

import { copy } from '@/lib/copy';

export const emailSchema = z
  .string({ error: copy.validation.required })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: copy.auth.emailInvalid }));

export const passwordSchema = z
  .string({ error: copy.validation.required })
  .min(8, copy.auth.passwordTooShort)
  .max(72, copy.validation.tooLong(72));

export const nextPathSchema = z.string().max(500).optional();

export const signInSchema = z.strictObject({
  email: emailSchema,
  password: z.string({ error: copy.validation.required }).min(1, copy.validation.required),
  next: nextPathSchema,
});
export type SignInInput = z.input<typeof signInSchema>;

export const signUpSchema = z.strictObject({
  fullName: z
    .string({ error: copy.auth.nameRequired })
    .trim()
    .min(2, copy.auth.nameRequired)
    .max(80, copy.validation.tooLong(80)),
  email: emailSchema,
  password: passwordSchema,
});
export type SignUpInput = z.input<typeof signUpSchema>;

export const forgotPasswordSchema = z.strictObject({
  email: emailSchema,
});
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .strictObject({
    password: passwordSchema,
    confirmPassword: z.string({ error: copy.validation.required }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: copy.auth.passwordMismatch,
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
