import { Fragment } from "react";

/**
 * Eenvoudige, veilige Markdown-weergave voor de schrijfwijzer (koppen, lijsten,
 * tabellen, alinea's, vet). Geen HTML-injectie: alles wordt als tekst gerenderd.
 */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("*") && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em> : p.startsWith("`") ? <code key={i} className="rounded bg-muted px-1 text-[0.9em]">{p.slice(1, -1)}</code> : <Fragment key={i}>{p}</Fragment>,
  );
}

export function MarkdownView({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const passage = line.match(/^<!--\s*passage:([a-z0-9_]+)\s*-->/);
    if (passage) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/<!--\s*\/passage\s*-->/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(
        <div key={`p${i}`} className="my-3 rounded-lg border border-primary/15 bg-accent/40 px-3 py-2">
          <p className="text-[11px] font-medium tracking-wide text-primary uppercase">Standaardpassage · {passage[1]}</p>
          <p className="mt-1 text-sm">{body.join(" ").trim()}</p>
        </div>,
      );
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const text = line.replace(/^#+\s/, "");
      out.push(
        level === 1 ? <h2 key={i} className="mt-2 mb-3 text-xl font-semibold">{inline(text)}</h2> : level === 2 ? <h3 key={i} className="mt-6 mb-2 text-base font-semibold">{inline(text)}</h3> : <h4 key={i} className="mt-4 mb-1 text-sm font-semibold">{inline(text)}</h4>,
      );
      i++;
      continue;
    }
    if (/^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      const ordered = /^\s*\d+\.\s/.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*]\s/.test(lines[i]) || /^\s*\d+\.\s/.test(lines[i]))) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s/, ""));
      const List = ordered ? "ol" : "ul";
      out.push(
        <List key={`l${i}`} className={`my-2 space-y-1 pl-5 text-sm ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((t, k) => (
            <li key={k}>{inline(t)}</li>
          ))}
        </List>,
      );
      continue;
    }
    if (/^\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        if (!/^\|[\s-:|]+\|$/.test(lines[i])) rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      out.push(
        <div key={`t${i}`} className="my-3 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{rows[0]?.map((c, k) => <th key={k} className="px-3 py-2 text-left font-medium">{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(1).map((r, k) => (
                <tr key={k} className="border-t">
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-2 align-top">{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^---\s*$/.test(line)) {
      out.push(<hr key={i} className="my-4" />);
      i++;
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#|\s*[-*]\s|\s*\d+\.\s|\||<!--|---)/.test(lines[i])) para.push(lines[i++]);
    if (para.length === 0) {
      i++;
      continue;
    }
    out.push(
      <p key={`pa${i}`} className="my-2 text-sm leading-relaxed">
        {inline(para.join(" "))}
      </p>,
    );
  }
  return <div>{out}</div>;
}
