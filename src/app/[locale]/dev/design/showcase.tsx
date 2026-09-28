"use client";

import { useState, type ReactNode } from "react";
import {
  ActivityCard,
  AffiliateOffer,
  BookingList,
  Button,
  DayTabs,
  InterestChip,
  ItineraryStop,
  LocalTip,
  PointsPill,
  PreferenceScale,
  ProductCard,
  RewardedReviewLabel,
  Route,
  SaveButton,
  Stamp,
  StopVotes,
  TabBar,
  TransferStop,
  interestDomain,
  type BookingItem,
} from "@/components/design";

// Pagina interna di sviluppo: i testi sono quelli delle anteprime in docs/design/components.
// Le parentesi quadre ([€], [Partner], [Nome reale]) segnano contenuti reali ancora da
// scrivere, che nell'interfaccia vengono dal database: qui non si inventano.

function Block({ title, readme, children }: { title: string; readme: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-t border-divider pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-heading-3">{title}</h3>
        <code className="text-caption break-all text-lava-muted">docs/design/components/{readme}/README.md</code>
      </div>
      {children}
    </div>
  );
}

const INTERESTS = [
  { key: "sea", label: "Mare" },
  { key: "food_wine", label: "Cibo e vino" },
  { key: "history_archaeology", label: "Storia e archeologia" },
  { key: "nature_hiking", label: "Natura ed escursioni" },
  { key: "villages", label: "Borghi" },
  { key: "nightlife", label: "Vita notturna" },
];

const INITIAL_BOOKINGS: BookingItem[] = [
  { id: "alloggio", name: "Alloggio a Noto", partner: "[Partner alloggi]", href: "#", done: true },
  { id: "auto", name: "Noleggio auto", partner: "[Partner noleggio]", href: "#", done: false },
  { id: "kayak", name: "Kayak a Vendicari", partner: "[Partner attività]", href: "#", done: false },
  { id: "voli", name: "Voli", partner: "[Partner voli]", href: "#", done: false },
];

export function DesignShowcase({ themeId, themeLabel }: { themeId: string; themeLabel: string }) {
  const [chips, setChips] = useState<Record<string, boolean>>({ sea: true, food_wine: true });
  const [scale, setScale] = useState<Record<string, number>>({ Mare: 4, "Storia e archeologia": 2, "Vita notturna": 0 });
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [day, setDay] = useState(0);
  const [votes, setVotes] = useState<Record<string, "up" | "down" | null>>({ noto: "up", vendicari: null });
  const [bookings, setBookings] = useState(INITIAL_BOOKINGS);
  const [points, setPoints] = useState(1240);

  const voteCounts = (id: string, up: number, down: number) => {
    const mine = votes[id] ?? null;
    return { up: up + (mine === "up" ? 1 : 0), down: down + (mine === "down" ? 1 : 0), mine };
  };
  const noto = voteCounts("noto", 3, 0);
  const vendicari = voteCounts("vendicari", 1, 2);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-12 md:px-16">
      <h2 id={themeId} className="is-display text-heading-1">
        {themeLabel}
      </h2>

      <Block title="Button" readme="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Crea il mio viaggio</Button>
          <Button variant="secondary">Esplora le attività</Button>
          <Button variant="ghost">Cambia preferenze</Button>
          <Button variant="primary" size="sm">
            Prenota
          </Button>
          <Button variant="secondary" size="sm" disabled>
            Non disponibile
          </Button>
        </div>
      </Block>

      <Block title="InterestChip" readme="InterestChip">
        <div className="flex flex-wrap gap-2.5">
          {INTERESTS.map((i) => (
            <InterestChip
              key={i.key}
              label={i.label}
              domain={interestDomain(i.key)}
              pressed={Boolean(chips[i.key])}
              onPressedChange={(p) => setChips((c) => ({ ...c, [i.key]: p }))}
            />
          ))}
        </div>
      </Block>

      <Block title="PreferenceScale" readme="PreferenceScale">
        <div className="max-w-[520px]">
          {Object.entries(scale).map(([label, value]) => (
            <PreferenceScale
              key={label}
              label={label}
              value={value}
              onChange={(v) => setScale((s) => ({ ...s, [label]: v }))}
            />
          ))}
        </div>
      </Block>

      <Block title="ActivityCard" readme="ActivityCard">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <ActivityCard
            href="/attivita"
            title="Il sentiero costiero della Riserva dello Zingaro"
            placeName="[Foto] Zingaro"
            tag={{ label: "Natura", domain: "mare" }}
            meta={["[Durata]", "a piedi", "auto necessaria"]}
            why={{ kind: "personal", reasons: ["Ami la natura", "[distanza] dalla base"] }}
            price={{ prefix: "guida da", amount: "[€]" }}
            save={
              <SaveButton
                title="Il sentiero costiero della Riserva dello Zingaro"
                saved={Boolean(saved.zingaro)}
                onSavedChange={(s) => setSaved((v) => ({ ...v, zingaro: s }))}
              />
            }
            action={
              <Button variant="secondary" size="sm">
                Aggiungi
              </Button>
            }
          />
          <ActivityCard
            href="/attivita"
            title="Street food tra pescheria e via Etnea"
            placeName="[Foto] Catania"
            tag={{ label: "Cibo", domain: "pistacchio" }}
            meta={["[Durata]", "a piedi", "con guida"]}
            why={{ kind: "group", reasons: ["Cibo tra i primi interessi di 3 su 4"] }}
            price={{ prefix: "da", amount: "[€]" }}
            save={
              <SaveButton
                title="Street food tra pescheria e via Etnea"
                saved={Boolean(saved.catania)}
                onSavedChange={(s) => setSaved((v) => ({ ...v, catania: s }))}
              />
            }
            action={
              <Button variant="secondary" size="sm">
                Aggiungi
              </Button>
            }
          />
        </div>
      </Block>

      <Block title="DayTabs" readme="DayTabs">
        <div className="max-w-[420px] md:max-w-none">
          <DayTabs
            days={[{ name: "Noto e costa" }, { name: "Siracusa" }, { name: "Modica e Ragusa" }, { name: "Scicli" }]}
            current={day}
            onSelect={setDay}
          />
        </div>
      </Block>

      <Block title="ItineraryStop e VoteButton" readme="ItineraryStop">
        <div className="max-w-[600px]">
          <Route draw>
            <ItineraryStop
              time="9:30"
              now
              title="Il barocco di Noto"
              meta="Corso Vittorio Emanuele e cattedrale · [durata]"
              why={{ kind: "group", reasons: ["Storia tra i primi interessi di 3 su 4", "a piedi dalla base"] }}
              votes={
                <StopVotes
                  up={noto.up}
                  down={noto.down}
                  members={4}
                  myVote={noto.mine}
                  onVote={(v) => setVotes((s) => ({ ...s, noto: v }))}
                />
              }
            />
            <TransferStop mode="car" text="[tempo] in auto · [km]" />
            <ItineraryStop
              time="11:30"
              title="Riserva di Vendicari"
              meta="Sentiero tra i pantani e bagno in una cala · [durata]"
              why={{ kind: "group", reasons: ["Natura tra i primi interessi di 3 su 4", "[min] dalla base"] }}
              votes={
                <StopVotes
                  up={vendicari.up}
                  down={vendicari.down}
                  members={4}
                  myVote={vendicari.mine}
                  onVote={(v) => setVotes((s) => ({ ...s, vendicari: v }))}
                  alternatives={2}
                />
              }
            />
          </Route>
        </div>
      </Block>

      <Block title="BookingList" readme="BookingList">
        <div className="max-w-[460px]">
          <BookingList
            items={bookings}
            onDoneChange={(id, done) => setBookings((b) => b.map((i) => (i.id === id ? { ...i, done } : i)))}
          />
        </div>
      </Block>

      <Block title="LocalTip" readme="LocalTip">
        <div className="flex max-w-[600px] flex-col gap-4">
          <LocalTip
            text="[Un fatto concreto verificato: da che ingresso entrare, a che ora arrivare, cosa ordinare e dove.]"
            author={{ kind: "editorial" }}
            verifiedAt="[mese anno]"
          />
          <LocalTip
            place="Marzamemi"
            text="[Consiglio di una persona reale con un legame con il luogo.]"
            author={{ kind: "person", name: "[Nome reale]", relation: "[Relazione con il luogo]" }}
            verifiedAt="[mese anno]"
          />
        </div>
      </Block>

      <Block title="AffiliateOffer" readme="AffiliateOffer">
        <div className="max-w-[420px]">
          <AffiliateOffer
            activityId="demo"
            title="Escursione guidata con bagno in cala"
            partner="[Partner]"
            price="[€]"
            rating={{ value: "[voto]", count: 0 }}
            freeCancellation
            priceUpdated="[data]"
          />
        </div>
      </Block>

      <Block title="Rewards" readme="Rewards">
        <div className="flex flex-wrap items-center gap-7">
          <div className="flex flex-col items-start gap-2.5">
            <PointsPill points={points} />
            <Button variant="ghost" size="sm" onClick={() => setPoints((p) => p + 10)}>
              Simula +10 punti
            </Button>
          </div>
          <Stamp badgeKey="etna" name="Esploratore dell'Etna" isNew />
          <Stamp badgeKey="buongustaio" name="Buongustaio" />
          <Stamp badgeKey="nove-su-nove" name="Nove su nove" locked progress="4 di 9 province" />
          <RewardedReviewLabel />
        </div>
      </Block>

      <Block title="ProductCard" readme="ProductCard">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <ProductCard
            href="/"
            placeholder="Box Etna"
            maker="[Produttori] · Bronte"
            title="Pistacchio, miele e vino dell'Etna"
            price="[€]"
            action={
              <Button variant="secondary" size="sm">
                Aggiungi
              </Button>
            }
          />
          <ProductCard
            href="/"
            placeholder="Olio EVO"
            maker="[Frantoio] · Monti Iblei"
            title="Olio extravergine Tonda Iblea"
            price="[€]"
            action={
              <Button variant="secondary" size="sm">
                Aggiungi
              </Button>
            }
          />
        </div>
        <div className="max-w-[460px]">
          <ProductCard
            row
            href="/"
            placeholder="[Foto]"
            maker="[Salina] · Trapani"
            title="Sale marino integrale"
            price="[€]"
            action={
              <Button variant="secondary" size="sm">
                Aggiungi
              </Button>
            }
          />
        </div>
      </Block>

      <Block title="TabBar" readme="TabBar">
        <div className="max-w-[390px]">
          <TabBar current="trips" />
        </div>
      </Block>
    </div>
  );
}
