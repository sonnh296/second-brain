"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { GuestAmbient } from "@/components/auth/guest-ambient";
import { LanguageSwitcher } from "@/components/dashboard/language-switcher";
import { APP_VERSION } from "@/lib/app-version";
import { FileText, MessageSquare, Sparkles } from "lucide-react";

export function GuestShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");

  const features = [
    {
      icon: FileText,
      title: t("featureDocs"),
      desc: t("featureDocsDesc"),
    },
    {
      icon: MessageSquare,
      title: t("featureChat"),
      desc: t("featureChatDesc"),
    },
    {
      icon: Sparkles,
      title: t("featureSmart"),
      desc: t("featureSmartDesc"),
    },
  ] as const;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <GuestAmbient />

      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
        <aside className="flex flex-col justify-between px-6 py-10 sm:px-10 lg:w-[min(44vw,520px)] lg:shrink-0 lg:border-r lg:border-border/50 lg:bg-background/40 lg:px-12 lg:py-14">
          <div>
            <div className="flex items-center gap-2.5 text-foreground">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-background shadow-sm overflow-hidden">
                <Image
                  src="/logo.png"
                  alt={tc("appName")}
                  width={36}
                  height={36}
                  className="h-9 w-9 object-cover"
                  priority
                />
              </div>
              <span className="text-sm font-semibold tracking-tight">
                {tc("appName")}
              </span>
            </div>

            <h1 className="mt-10 text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-[1.15]">
              {t("guestTitle1")}
              <br />
              <span className="text-muted-foreground">{t("guestTitle2")}</span>
            </h1>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground leading-relaxed">
              {t("guestSubtitle")}
            </p>
          </div>

          <ul className="mt-10 lg:mt-0 space-y-3.5">
            {features.map((item) => (
              <li key={item.title} className="flex items-start gap-3 px-2 py-2">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background">
                  <item.icon
                    className="h-4 w-4 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-[11px] text-muted-foreground/80 hidden lg:block">
            noteeverything.site · v{APP_VERSION}
          </p>
        </aside>

        <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10 lg:py-14">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}
