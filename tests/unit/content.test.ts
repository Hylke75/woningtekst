import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { escapeHtml, fundaToHtml, htmlToPlainText, normalizeHashtags, plainToHtml, sanitizeContentHtml, slugify, websiteToHtml, wordCount } from "@/lib/content/html";
import { closingPassages, forbiddenPhrases, guideForPrompt, parsePassages } from "@/lib/content/style-guide";
import { checkText, compareLanguages, extractKeyNumbers } from "@/lib/content/validators";
import type { FundaText } from "@/lib/ai/schemas";

const GUIDE = readFileSync(path.join(process.cwd(), "content/schrijfwijzer/v1.md"), "utf8");

describe("HTML en XSS", () => {
  it("verwijdert scripts, event handlers en ongeoorloofde tags", () => {
    const dirty = '<p onclick="alert(1)">Hallo<script>alert(1)</script></p><img src=x onerror=alert(1)><a href="javascript:x">link</a><iframe src="https://x"></iframe><h2>Kop</h2>';
    const clean = sanitizeContentHtml(dirty);
    expect(clean).not.toMatch(/script|onerror|onclick|iframe|<img|<a /i);
    expect(clean).toContain("<p>Hallo</p>");
    expect(clean).toContain("<h2>Kop</h2>");
  });
  it("escapet AI-tekst bij het opbouwen van HTML", () => {
    const html = websiteToHtml({ titel: "<b>Titel</b>", alineas: ['Tekst met <script>alert("x")</script>', "Tweede alinea"] });
    expect(html).not.toMatch(/<script|<b>/);
    expect(html).toContain("&lt;script&gt;");
  });
  it("bouwt de vaste Funda-structuur met letterlijke afsluiting", () => {
    const f: FundaText = {
      introductie: ["Intro."],
      locatie: ["Locatie."],
      kenmerken: ["142 m²", "Bouwjaar 1928", "Energielabel C"],
      indeling: [{ verdieping: "Begane grond", tekst: "Hal." }],
      kadastraal: [],
      oplevering: ["In overleg."],
    };
    const html = fundaToHtml(f, "nl", "Teststraat 1", ["Afsluiting."]);
    expect(html).toContain("<h2>Locatie</h2>");
    expect(html).toContain("<h2>Wat je graag wilt weten over Teststraat 1</h2>");
    expect(html).not.toContain("Kadastrale informatie");
    expect(html.endsWith("<p>Afsluiting.</p>")).toBe(true);
    expect(fundaToHtml(f, "en", "Teststraat 1", [])).toContain("<h2>What you'd like to know about Teststraat 1</h2>");
  });
  it("zet HTML om naar platte tekst voor kopiëren", () => {
    expect(htmlToPlainText("<h2>Kop</h2><p>Een &amp; twee</p><ul><li>a</li><li>b</li></ul>")).toBe("Kop\nEen & twee\n- a\n- b");
    expect(plainToHtml("Regel 1\nRegel 2\n\nAlinea <x>")).toBe("<p>Regel 1<br />Regel 2</p>\n<p>Alinea &lt;x&gt;</p>");
  });
  it("telt woorden", () => {
    expect(wordCount("Dit is een test met 142 m² en een prijs van € 1.250.000.")).toBe(12);
  });
  it("normaliseert hashtags en slugs", () => {
    expect(normalizeHashtags(["#Den Haag", "denhaag", "#Statenkwartier", "#!!"])).toEqual(["#DenHaag", "#Statenkwartier"]);
    expect(slugify("Herenhuis Laan van Meerdervoort 120, 's-Gravenhage")).toBe("herenhuis-laan-van-meerdervoort-120-s-gravenhage");
    expect(escapeHtml(`"<'>&`)).toBe("&quot;&lt;&#39;&gt;&amp;");
  });
});

describe("schrijfwijzer", () => {
  it("leest standaardpassages letterlijk uit", () => {
    const p = parsePassages(GUIDE);
    expect(p.nvm_afsluiting_nl).toMatch(/^Deze informatie is door ons met de nodige zorgvuldigheid samengesteld\./);
    expect(p.nvm_afsluiting_en).toMatch(/^This information has been compiled/);
    expect(Object.keys(p)).toContain("clausule_ouderdom_nl");
  });
  it("stuurt passages niet mee naar het model", () => {
    expect(guideForPrompt(GUIDE)).not.toContain("Onzerzijds wordt echter geen enkele aansprakelijkheid");
    expect(guideForPrompt(GUIDE)).toContain("StoryBrand");
  });
  it("leest de lijst met te vermijden formuleringen", () => {
    const list = forbiddenPhrases(GUIDE);
    for (const p of ["een unieke kans", "een ware parel", "een oase van rust", "een fantastische toplocatie", "het beste van twee werelden", "een woning die alles biedt", "mis deze kans niet"]) {
      expect(list).toContain(p);
    }
  });
  it("voegt clausules alleen toe als ze in het profiel staan", () => {
    const p = parsePassages(GUIDE);
    expect(closingPassages(p, "nl", null)).toEqual([p.nvm_afsluiting_nl]);
    expect(closingPassages(p, "nl", "Ouderdomsclausule en asbestclausule van toepassing")).toEqual([p.clausule_ouderdom_nl, p.clausule_asbest_nl, p.nvm_afsluiting_nl]);
    expect(closingPassages(p, "en", "niet-zelfbewoningsclausule")).toEqual([p.clausule_niet_zelfbewoning_en, p.nvm_afsluiting_en]);
  });
});

describe("automatische eindcontrole", () => {
  const ctx = { forbiddenPhrases: forbiddenPhrases(GUIDE), doNotMention: ["funderingsherstel"], allowedContacts: ["070-1234567", "info@example.test"], priceOnSocial: false };
  const words = (n: number) => Array.from({ length: n }, (_, i) => `woord${i}`).join(" ");

  it("signaleert clichés, emoji's, niet-te-noemen onderwerpen en privacy", () => {
    const html = `<p>Dit is een unieke kans 🏡. Recent funderingsherstel. Bel Jan op 06-98765432 of mail jan@prive.test. ${words(80)}</p>`;
    const f = checkText({ channel: "facebook", language: "nl", html, hashtags: ["#KorffdeGidts", "#a", "#b", "#c"] }, ctx);
    const cats = f.map((x) => x.category);
    expect(cats).toEqual(expect.arrayContaining(["stijl", "niet_noemen", "privacy"]));
    expect(f.filter((x) => x.category === "privacy")).toHaveLength(2);
    expect(f.find((x) => x.description.includes("emoji"))?.severity).toBe("kritiek");
  });
  it("staat contactgegevens van kantoor toe", () => {
    const f = checkText({ channel: "instagram", language: "nl", html: `<p>Bel 070-1234567. ${words(60)}</p>`, hashtags: ["#KorffdeGidts", "#a", "#b", "#c", "#d"] }, ctx);
    expect(f.filter((x) => x.category === "privacy")).toHaveLength(0);
  });
  it("prijs op social media alleen als dat is toegestaan", () => {
    const html = `<p>Vraagprijs € 650.000 k.k. ${words(90)}</p>`;
    expect(checkText({ channel: "facebook", language: "nl", html, hashtags: ["#KorffdeGidts", "#a", "#b", "#c"] }, ctx).some((x) => x.category === "publicatie")).toBe(true);
    expect(checkText({ channel: "facebook", language: "nl", html, hashtags: ["#KorffdeGidts", "#a", "#b", "#c"] }, { ...ctx, priceOnSocial: true }).some((x) => x.category === "publicatie")).toBe(false);
  });
  it("geen hashtags in de Funda-tekst en lengtecontrole", () => {
    const f = checkText({ channel: "funda", language: "nl", html: `<p>Mooi huis #DenHaag</p>`, hashtags: [] }, ctx);
    expect(f.some((x) => x.description.includes("hashtags"))).toBe(true);
    expect(f.some((x) => x.category === "lengte")).toBe(true);
  });
  it("vergelijkt harde getallen tussen Nederlands en Engels", () => {
    expect(extractKeyNumbers("Vraagprijs € 1.250.000, 142 m², bouwjaar 1928")).toEqual(new Set(["eur:1250000", "m2:142", "jaar:1928"]));
    expect(extractKeyNumbers("Asking price € 1,250,000, 142 m², built in 1928")).toEqual(new Set(["eur:1250000", "m2:142", "jaar:1928"]));
    expect(compareLanguages("funda", "<p>142 m², bouwjaar 1928</p>", "<p>142 m², built in 1928</p>")).toEqual([]);
    const diff = compareLanguages("funda", "<p>142 m², bouwjaar 1928</p>", "<p>124 m², built in 1928</p>");
    expect(diff).toHaveLength(2);
    expect(diff[0].description).toContain("142 m²");
  });
});

describe("leesbaarheid", () => {
  it("geeft korte, eenvoudige zinnen een hogere score dan lange, samengestelde zinnen", async () => {
    const { readability } = await import("@/lib/content/readability");
    const simple = "Je woont hier rustig. De tuin ligt op het zuiden. Er is veel licht. De keuken is nieuw. Je fietst zo naar het strand. De school is dichtbij.";
    const hard =
      "Deze uitzonderlijk ruim bemeten en karakteristieke herenhuiswoning, gelegen in een van de meest gewilde en bijzonder kindvriendelijke woonwijken van de gemeente, biedt een uitgebreide combinatie van woonkwaliteit, functionaliteit en representatieve uitstraling die in de huidige woningmarkt nauwelijks nog wordt aangetroffen.";
    const a = readability(simple, "nl")!;
    const b = readability(hard, "nl")!;
    expect(a.score).toBeGreaterThan(b.score);
    expect(b.longSentences).toHaveLength(1);
    expect(a.longSentences).toHaveLength(0);
  });
  it("geeft geen score voor te korte teksten", async () => {
    const { readability } = await import("@/lib/content/readability");
    expect(readability("Te koop.", "nl")).toBeNull();
  });
});

describe("schrijfstijlen", () => {
  it("zijn uitgesproken verschillend en worden herleidbaar in de promptversie vastgelegd", async () => {
    const { WRITING_STYLES, WRITING_STYLE_KEYS, promptVersionWithStyle, styleFromPromptVersion, styleBlock } = await import("@/lib/content/writing-styles");
    const { PROMPT_VERSION } = await import("@/lib/ai/prompts");
    expect(WRITING_STYLES.zakelijk.instruction).toMatch(/Geen uitroeptekens/);
    expect(WRITING_STYLES.vrolijk.instruction).toMatch(/uitroeptekens/);
    expect(WRITING_STYLES.wollig.instruction).toMatch(/30–45 woorden/);
    expect(styleBlock("schrijfwijzer")).toBe("");
    for (const key of WRITING_STYLE_KEYS) {
      const pv = promptVersionWithStyle(PROMPT_VERSION, key);
      expect(pv.length).toBeLessThanOrEqual(40);
      expect(styleFromPromptVersion(pv)).toBe(key === "schrijfwijzer" ? null : key);
    }
  });
});
