/**
 * Schrijfstijlen per medewerker. De stijl bepaalt UITSLUITEND toon, ritme,
 * woordkeus en lengte; feitelijke regels, privacy en de vaste Funda-structuur
 * blijven altijd gelden. De verschillen zijn bewust uitgesproken, zodat ze in
 * een demo direct zichtbaar zijn.
 */
export const WRITING_STYLE_KEYS = ["schrijfwijzer", "zakelijk", "vrolijk", "wollig"] as const;
export type WritingStyle = (typeof WRITING_STYLE_KEYS)[number];

export type WritingStyleDefinition = {
  label: string;
  /** Korte uitleg voor in de keuzelijst. */
  hint: string;
  /** Stijlinstructie voor Claude (leeg = schrijfwijzer volgen). */
  instruction: string;
  /** Lengtefactor ten opzichte van de richtlijn (alleen informatief in de instructie). */
};

export const WRITING_STYLES: Record<WritingStyle, WritingStyleDefinition> = {
  schrijfwijzer: {
    label: "Standaard (schrijfwijzer)",
    hint: "De huisstijl van Korff de Gidts",
    instruction: "",
  },
  zakelijk: {
    label: "Wim – zeer zakelijk",
    hint: "Kort, feitelijk, opsommend; geen sfeer",
    instruction: `Schrijfstijl "Wim – zeer zakelijk". Deze stijl gaat VOOR de toon- en lengterichtlijnen van de schrijfwijzer:
- Schrijf als een nuchtere taxateur: uitsluitend feiten, getallen en voorzieningen. Geen sfeer, geen beleving, geen bijvoeglijke naamwoorden die niet meetbaar zijn (dus niet: sfeervol, heerlijk, prachtig, gezellig, royaal, karakteristiek).
- Korte zinnen van gemiddeld 6–10 woorden. Veel zinnen zonder werkwoord zijn toegestaan ("Bouwjaar 1932. Woonoppervlakte 142 m². Energielabel C.").
- Begin de introductie met de kerngegevens (type, oppervlakte, kamers, bouwjaar, energielabel) in één of twee regels. Geen verhaal, geen toekomstige bewoner als hoofdpersoon, geen "stel je voor".
- Zo veel mogelijk opsommingen; elke alinea maximaal 2 zinnen.
- Geen uitroeptekens. Geen vragen. Zakelijke u-vorm mag ("U betreedt de woning via…") in plaats van je-vorm.
- Lengte: ongeveer de helft van de richtlijn; Funda circa 300–450 woorden, website circa 150–220, Facebook circa 50–70, Instagram circa 30–50.
- Social media: feitelijke aankondiging met kerngegevens en "Bezichtiging op afspraak." Niets meer.`,
  },
  vrolijk: {
    label: "Vivianne – heel vrolijk",
    hint: "Enthousiast, energiek, uitroeptekens",
    instruction: `Schrijfstijl "Vivianne – heel vrolijk". Deze stijl gaat VOOR de toon- en lengterichtlijnen van de schrijfwijzer:
- Schrijf alsof je de woning zelf net hebt bezocht en niet kunt wachten om het iedereen te vertellen: uitbundig, warm, energiek en positief. Glimlach hoorbaar in elke zin.
- Gebruik veel uitroeptekens (gemiddeld in elke tweede of derde zin) en af en toe een enthousiaste vraag ("Zie jij jezelf hier al op zondagochtend ontbijten?").
- Spreek de lezer direct en persoonlijk aan in de je-vorm; maak het levendig met concrete momenten uit het dagelijks leven (koffie in de tuin, kinderen die buiten spelen, vrienden over de vloer) — zonder feiten te verzinnen.
- Korte, speelse zinnen afgewisseld met uitroepen als "Wat een plek!", "Hoe fijn is dát?", "En het wordt nog beter:".
- Gebruik woorden als heerlijk, zonnig, superfijn, fantastisch, genieten, knus, dolblij, vrolijk — dit mag hier nadrukkelijk, ook als de schrijfwijzer zulke woorden afraadt.
- Geen emoji's (die zijn technisch niet toegestaan), wel volop uitroeptekens.
- Lengte: volg de richtlijn van de schrijfwijzer.
- Social media: barstend van enthousiasme, met een vrolijke uitnodiging om snel te komen kijken.`,
  },
  wollig: {
    label: "Anne-Louise – heel wollig",
    hint: "Lange, beeldende, omfloerste zinnen",
    instruction: `Schrijfstijl "Anne-Louise – heel wollig". Deze stijl gaat VOOR de toon- en lengterichtlijnen van de schrijfwijzer:
- Schrijf uitgesproken literair, omfloerst en beschouwend, alsof een woonmagazine een essay over deze woning publiceert. Lange, slingerende zinnen van gemiddeld 30–45 woorden met bijzinnen, uitweidingen en gedachtestreepjes.
- Stapel bijvoeglijke naamwoorden en beeldspraak ("een woning die als een zacht gedicht in het straatbeeld rust", "waar het licht als een trage rivier over de vloerdelen stroomt"). Gebruik woorden als allure, sereniteit, cachet, harmonie, nonchalante elegantie, tijdloze grandeur, ongedwongen verfijning, zinnenprikkelend.
- Benader feiten zijdelings en omschrijvend in plaats van direct: noem ze wel (alle feiten blijven correct en volledig), maar verpak ze in sfeer en beschouwing.
- Begin de introductie met een beschouwende openingszin over wonen, tijd, licht of de buurt voordat de woning zelf ter sprake komt.
- Gebruik de "u"-vorm of een afstandelijke derde persoon ("de toekomstige bewoner zal ontdekken dat…") in plaats van de je-vorm. Geen uitroeptekens.
- Clichés en formuleringen uit "Te vermijden" in de schrijfwijzer zijn in deze stijl toegestaan.
- Lengte: ruim anderhalf keer de richtlijn; Funda circa 1.000–1.400 woorden, website circa 500–650, Facebook circa 150–200, Instagram circa 100–140.
- Social media: dromerig en beschouwend, met een omfloerste uitnodiging om de woning te komen ervaren.`,
  },
};

export function isWritingStyle(value: unknown): value is WritingStyle {
  return typeof value === "string" && (WRITING_STYLE_KEYS as readonly string[]).includes(value);
}

/** Prompt-blok voor de gekozen stijl (leeg bij de standaardstijl). */
export function styleBlock(style: WritingStyle): string {
  const def = WRITING_STYLES[style];
  return def.instruction ? `<schrijfstijl naam="${def.label}">\n${def.instruction}\n</schrijfstijl>` : "";
}

/** Stijl wordt vastgelegd in content_versions.prompt_version als achtervoegsel ("2026-10-09.1+vrolijk"). */
export function promptVersionWithStyle(promptVersion: string, style: WritingStyle): string {
  return style === "schrijfwijzer" ? promptVersion : `${promptVersion}+${style}`;
}

export function styleFromPromptVersion(promptVersion: string | null | undefined): WritingStyle | null {
  const suffix = promptVersion?.split("+")[1];
  return isWritingStyle(suffix) && suffix !== "schrijfwijzer" ? suffix : null;
}
