"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithEmail, signInWithGoogle, type EmailSignInState } from "@/server/auth/actions";

const initialState: EmailSignInState = { status: "idle" };

export function LoginForm({ locale, hasError }: { locale: string; hasError: boolean }) {
  const t = useTranslations("Login");
  const [state, formAction, pending] = useActionState(signInWithEmail, initialState);

  if (state.status === "sent") {
    return (
      <p role="status" className="text-sm">
        {t("sent", { email: state.email })}
      </p>
    );
  }

  const errorMessage =
    state.status === "error"
      ? t(state.code === "invalid_email" ? "invalidEmail" : "error")
      : hasError
        ? t("error")
        : null;

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="locale" value={locale} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={state.status === "error" && state.code === "invalid_email"}
          />
        </div>
        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {t("submit")}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={signInWithGoogle}>
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="outline" className="w-full">
          {t("google")}
        </Button>
      </form>
    </div>
  );
}
