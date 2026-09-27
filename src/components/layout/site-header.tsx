import { getLocale, getTranslations } from "next-intl/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";
import { getUser } from "@/server/auth";
import { signOut } from "@/server/auth/actions";

export async function SiteHeader() {
  const [user, locale, t] = await Promise.all([getUser(), getLocale(), getTranslations("Nav")]);

  return (
    <header className="border-b">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-semibold">
            Sicilia Planner
          </Link>
          <Link href="/attivita" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">
            {t("activities")}
          </Link>
          <Link href="/itinerari" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">
            {t("itineraries")}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link href="/profilo" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                {t("profile")}
              </Link>
              <form action={signOut}>
                <input type="hidden" name="locale" value={locale} />
                <Button type="submit" variant="outline" size="sm">
                  {t("logout")}
                </Button>
              </form>
            </>
          ) : (
            <Link href="/login" className={buttonVariants({ size: "sm" })}>
              {t("login")}
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
