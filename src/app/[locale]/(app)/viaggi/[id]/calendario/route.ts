import { getTranslations } from "next-intl/server";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { routing } from "@/lib/i18n/routing";
import { buildCalendar, type CalendarEvent } from "@/lib/ics";
import { addIsoDays } from "@/lib/trip-days";
import { getUser } from "@/server/auth";
import { getTrip } from "@/server/trips/queries";

// Esporta il viaggio come calendario (.ics): un evento all-day per giorno. Solo con la data di
// partenza, perché senza data non c'è il giorno del calendario. Il viaggio si legge con dbAsUser
// (getTrip): chi non lo vede riceve 404.
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ locale: string; id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const { locale, id } = await params;
  if (!z.enum(routing.locales).safeParse(locale).success || !z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const trip = await getTrip(user, id);
  if (!trip) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const startDate = trip.startDate;
  if (startDate === null) return NextResponse.json({ error: "start_date_missing" }, { status: 422 });

  const t = await getTranslations({ locale, namespace: "Trips.calendar" });
  const events: CalendarEvent[] = Array.from({ length: trip.days }, (_, d) => {
    const dayStops = trip.stops.filter((stop) => stop.dayIndex === d);
    const places = [...new Set(dayStops.flatMap((stop) => (stop.placeName ? [stop.placeName] : [])))];
    const dayTitle = trip.dayTitles[d]?.trim() || places.join(" e ");
    const lines = dayStops.map((stop) => (stop.timeSlot ? `${t(`slot.${stop.timeSlot}`)}: ${stop.title}` : stop.title));
    const note = trip.dayNotes[d]?.trim() ?? "";
    if (note !== "") lines.push(t("note", { note }));
    return {
      uid: `${id}-${d + 1}@isula`,
      date: addIsoDays(startDate, d),
      summary: dayTitle ? t("dayTitle", { day: d + 1, title: dayTitle }) : t("dayBare", { day: d + 1 }),
      description: lines.join("\n"),
    };
  });

  return new NextResponse(buildCalendar(events, { now: new Date() }), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="viaggio-${id}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
