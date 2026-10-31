import { useEffect, useRef, useState } from "react";
import { Download, Search } from "lucide-react";
import { Modal, modalText, modalTitle } from "./ScriptInsertMenu.js";
import { useCoffees } from "../hooks/useCoffees.js";
import { useGrinders } from "../hooks/useGrinders.js";
import theme from "../theme.js";

const C = theme;
const SHOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROAST_SUGGESTIONS = [
  { key: "light", label: "Hell", profiles: ["Blooming", "Allongé", "Turbo", "Extractamundo"] },
  { key: "medium", label: "Mittel", profiles: ["Adaptive", "Extractamundo", "Gentle"] },
  { key: "dark", label: "Dunkel", profiles: ["Londinium", "Cremina", "Gentle"] },
] as const;

type CommunityShot = {
  id: string;
  title: string;
  user: string | null;
  roaster: string | null;
  bean: string | null;
  roast: string | null;
  dose: number | null;
  yield: number | null;
  ratio: number | null;
  time: number | null;
  enjoyment: number | null;
  startTime: string | null;
};
type SearchResult = { items: CommunityShot[]; page: number; more: boolean };
type GroupedShot = CommunityShot & { moreShots: number };
type RatioFilter = "all" | "short" | "normal" | "long";
type SortOrder = "rating" | "newest";
type RoastGroup = typeof ROAST_SUGGESTIONS[number]["key"];

function roastGroup(level: string | null): RoastGroup | null {
  if (level === "light" || level === "light-medium") return "light";
  if (level === "medium" || level === "medium-dark") return "medium";
  if (level === "dark") return "dark";
  return null;
}

function groupShots(shots: CommunityShot[]): GroupedShot[] {
  const groups = new Map<string, { best: CommunityShot; ids: Set<string> }>();
  for (const shot of shots) {
    const key = `${shot.title.trim().toLocaleLowerCase()}\0${(shot.user ?? "").trim().toLocaleLowerCase()}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { best: shot, ids: new Set([shot.id]) });
      continue;
    }
    if (group.ids.has(shot.id)) continue;
    group.ids.add(shot.id);
    const currentRating = group.best.enjoyment ?? -1;
    const candidateRating = shot.enjoyment ?? -1;
    const currentTime = Date.parse(group.best.startTime ?? "") || 0;
    const candidateTime = Date.parse(shot.startTime ?? "") || 0;
    if (candidateRating > currentRating || (candidateRating === currentRating && candidateTime > currentTime)) {
      group.best = shot;
    }
  }
  return [...groups.values()].map(({ best, ids }) => ({ ...best, moreShots: ids.size - 1 }));
}

const input: React.CSSProperties = {
  minWidth: 0, height: 42, boxSizing: "border-box", borderRadius: 8,
  border: `1px solid ${C.bdr2}`, background: C.bg, color: C.txt,
  padding: "0 12px", font: "inherit", fontSize: 13,
};
const button: React.CSSProperties = {
  minHeight: 36, borderRadius: 8, border: `1px solid ${C.bdr2}`,
  background: "transparent", color: C.txtS, padding: "0 11px",
  font: "inherit", fontSize: 12, cursor: "pointer",
};

/** Sucht Visualizer-Community-Bezüge und übergibt den gewählten Bezug dem Profilimport. */
export function ProfileDiscoveryDialog({ onClose, onImport }: { onClose: () => void; onImport: (json: string) => void }) {
  const [profile, setProfile] = useState("");
  const [roaster, setRoaster] = useState("");
  const [bean, setBean] = useState("");
  const [selectedCoffeeId, setSelectedCoffeeId] = useState<number | null>(null);
  const [grinder, setGrinder] = useState("");
  const [minimum, setMinimum] = useState("0");
  const [ratioFilter, setRatioFilter] = useState<RatioFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("rating");
  const [selectedRoastGroup, setSelectedRoastGroup] = useState<RoastGroup | null>(null);
  const [shots, setShots] = useState<CommunityShot[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const { coffees, loading: coffeesLoading } = useCoffees();
  const { grinders } = useGrinders();
  const activeCoffees = coffees
    .filter((coffee) => coffee.activeRoasting !== null)
    .sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name));
  const filteredShots = shots.filter((shot) => {
    if (ratioFilter === "all") return true;
    if (shot.ratio === null) return false;
    if (ratioFilter === "short") return shot.ratio <= 1.8;
    if (ratioFilter === "normal") return shot.ratio > 1.8 && shot.ratio < 2.6;
    return shot.ratio >= 2.6;
  });
  const items = groupShots(filteredShots).sort((a, b) => {
    const newest = (shot: CommunityShot) => Date.parse(shot.startTime ?? "") || 0;
    const rating = (b.enjoyment ?? -1) - (a.enjoyment ?? -1);
    return sortOrder === "newest" ? newest(b) - newest(a) || rating : rating || newest(b) - newest(a);
  });

  const search = async (targetPage: number, profileValue = profile, roasterValue = roaster, beanValue = bean, minValue = minimum, grinderValue = grinder) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    if (targetPage === 1) setShots([]);
    const params = new URLSearchParams({ page: String(targetPage) });
    if (profileValue.trim()) params.set("profile_title", profileValue.trim());
    if (roasterValue.trim()) params.set("bean_brand", roasterValue.trim());
    if (beanValue.trim()) params.set("bean_type", beanValue.trim());
    if (grinderValue.trim()) params.set("grinder_model", grinderValue.trim());
    if (Number(minValue) > 0) params.set("min_enjoyment", minValue);
    try {
      const response = await fetch(`/api/community/shots?${params}`);
      const result = await response.json().catch(() => ({})) as SearchResult & { error?: string };
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      setShots((current) => targetPage === 1 ? result.items : [...current, ...result.items]);
      setPage(result.page);
      setMore(result.more);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  useEffect(() => { void search(1, "", "", "", "0"); }, []);

  const importShot = async (id: string) => {
    setImportingId(id);
    setError("");
    try {
      const response = await fetch(`/api/community/shots/${encodeURIComponent(id)}`);
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      onImport(JSON.stringify(data));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setImportingId(null);
    }
  };

  const format = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
  const infoLine = (shot: CommunityShot) => [
    shot.roaster,
    shot.bean,
    shot.roast,
  ].filter(Boolean).join(" · ");
  const statsLine = (shot: CommunityShot) => [
    shot.dose !== null ? `${format(shot.dose)} g` : null,
    shot.yield !== null ? `${format(shot.yield)} g` : null,
    shot.ratio !== null ? `1:${format(shot.ratio)}` : null,
    shot.time !== null ? `${format(shot.time)} s` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Modal onClose={onClose} width={640}>
      <h3 style={modalTitle}>Profile entdecken</h3>
      <form
        onSubmit={(event) => { event.preventDefault(); void search(1); }}
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8, padding: 12, background: C.card, borderRadius: 8, marginBottom: 12 }}
      >
        <input aria-label="Profil" placeholder="Profil, z. B. Blooming" value={profile} onChange={(event) => setProfile(event.target.value)} style={{ ...input, gridColumn: "1 / -1", width: "100%" }} />
        <input aria-label="Röster" placeholder="Röster (optional)" value={roaster} onChange={(event) => { setRoaster(event.target.value); setSelectedCoffeeId(null); }} style={{ width: "100%", ...input }} />
        <input aria-label="Bohne (optional)" placeholder="Bohne (optional)" value={bean} onChange={(event) => { setBean(event.target.value); setSelectedCoffeeId(null); }} style={{ width: "100%", ...input }} />
        <select aria-label="Mühle (optional)" value={grinder} onChange={(event) => setGrinder(event.target.value)} style={{ width: "100%", ...input, gridColumn: "1 / -1" }}>
          <option value="">Alle Mühlen</option>
          {grinders.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
        </select>
        <select aria-label="Bewertung ab" value={minimum} onChange={(event) => setMinimum(event.target.value)} style={{ width: "100%", ...input, gridColumn: "1 / -1" }}>
          <option value="0">Alle Bewertungen</option>
          <option value="70">Bewertung ab 70</option>
          <option value="80">Bewertung ab 80</option>
          <option value="90">Bewertung ab 90</option>
        </select>
        <button type="submit" disabled={loading} style={{ ...button, gridColumn: "1 / -1", width: "min(100%, 244px)", minHeight: 42, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: C.acc, borderColor: C.acc, color: C.onAcc, fontSize: 13, fontWeight: 600 }}>
          <Search size={16} /> Suchen
        </button>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {ROAST_SUGGESTIONS.map((group) => {
          const highlighted = selectedRoastGroup === group.key;
          return (
            <section
              key={group.key}
              style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, padding: "6px 8px", borderRadius: 8, background: highlighted ? C.accG2 : C.accG, border: `1px solid ${highlighted ? C.accB : C.bdr}` }}
            >
              <span style={{ minWidth: 48, color: highlighted ? C.acc : C.mut, fontSize: 11, fontWeight: 700 }}>{group.label}</span>
              {group.profiles.map((suggestion) => {
                const selected = profile.trim().toLocaleLowerCase() === suggestion.toLocaleLowerCase();
                return (
                  <button
                    key={suggestion}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => { setProfile(suggestion); void search(1, suggestion); }}
                    style={{ ...button, background: selected ? C.accG2 : "transparent", borderColor: selected ? C.accB : C.bdr2, color: selected ? C.acc : C.txtS, fontWeight: selected ? 600 : 400 }}
                  >
                    {suggestion}
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>

      <section style={{ marginBottom: 14 }}>
        <div style={{ color: C.mut, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Meine Bohnen</div>
        {coffeesLoading ? (
          <div style={{ color: C.mut, fontSize: 12 }}>Lade Bohnen …</div>
        ) : activeCoffees.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {activeCoffees.map((coffee) => (
              <button
                key={coffee.id}
                type="button"
                aria-pressed={selectedCoffeeId === coffee.id}
                title={[coffee.roaster, coffee.name].filter(Boolean).join(" · ")}
                disabled={loading}
                onClick={() => {
                  const nextRoaster = coffee.roaster ?? "";
                  setSelectedCoffeeId(coffee.id);
                  setRoaster(nextRoaster);
                  setBean(coffee.name);
                  setSelectedRoastGroup(roastGroup(coffee.roastLevel));
                  void search(1, profile, nextRoaster, coffee.name, minimum);
                }}
                style={{ ...button, background: selectedCoffeeId === coffee.id ? C.accG2 : "transparent", borderColor: selectedCoffeeId === coffee.id ? C.accB : C.bdr2, color: selectedCoffeeId === coffee.id ? C.acc : C.txtS, fontWeight: selectedCoffeeId === coffee.id ? 600 : 400 }}
              >
                {coffee.name}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ color: C.mut, fontSize: 12 }}>Keine aktiven Bohnen</div>
        )}
      </section>

      {error && <p role="alert" style={{ ...modalText, color: C.red }}>{error}</p>}
      {loading && shots.length === 0 && <p style={modalText}>Suche auf visualizer.coffee …</p>}
      {!loading && !error && items.length === 0 && <p style={modalText}>Keine Treffer. Anderen Profilnamen probieren oder die Mindestbewertung senken.</p>}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "12px 0 8px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, color: C.mut, fontSize: 12 }}>
          Sortierung
          <select aria-label="Sortierung" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)} style={{ ...input, width: "auto", height: 34, padding: "0 8px" }}>
            <option value="rating">Bewertung</option>
            <option value="newest">Neueste</option>
          </select>
        </label>
        <div role="group" aria-label="Ratio" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {([
            ["all", "Alle"],
            ["short", "Kurz bis 1:1,8"],
            ["normal", "Normal 1:1,8–1:2,6"],
            ["long", "Lang ab 1:2,6"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={ratioFilter === value}
              onClick={() => setRatioFilter(value)}
              style={{ ...button, minHeight: 32, padding: "0 8px", background: ratioFilter === value ? C.accG2 : "transparent", borderColor: ratioFilter === value ? C.accB : C.bdr2, color: ratioFilter === value ? C.acc : C.txtS, fontSize: 11 }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((shot) => (
          <article key={shot.id} style={{ position: "relative", padding: 14, paddingRight: 76, background: C.card, borderRadius: 8 }}>
            {shot.enjoyment !== null && (
              <span style={{ position: "absolute", top: 12, right: 12, borderRadius: 999, padding: "3px 7px", background: C.orgD, color: C.org, fontSize: 11, fontWeight: 600 }}>
                ★ {format(shot.enjoyment)}
              </span>
            )}
            <div style={{ color: C.txt, fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>{shot.title}</div>
            {(shot.user || infoLine(shot)) && (
              <div style={{ marginTop: 2, color: C.mut, fontSize: 11, lineHeight: 1.4 }}>
                {shot.user && (SHOT_ID.test(shot.id) ? (
                  <a href={`https://visualizer.coffee/shots/${shot.id}`} target="_blank" rel="noopener noreferrer" style={{ color: C.mut, textDecoration: "underline" }}>
                    von {shot.user}
                  </a>
                ) : <span>von {shot.user}</span>)}
                {shot.user && infoLine(shot) ? " · " : ""}{infoLine(shot)}
              </div>
            )}
            {statsLine(shot) && <div style={{ marginTop: 5, color: C.txtS, fontSize: 12 }}>{statsLine(shot)}</div>}
            {shot.moreShots > 0 && <div style={{ marginTop: 4, color: C.mut, fontSize: 11 }}>+{shot.moreShots} weitere Bezüge</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button type="button" disabled={importingId !== null} onClick={() => void importShot(shot.id)} style={{ ...button, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minWidth: 150, minHeight: 38, borderRadius: 999, background: C.acc, borderColor: C.acc, color: C.onAcc, fontSize: 13, fontWeight: 600 }}>
                <Download size={16} /> {importingId === shot.id ? "Lade …" : "Importieren"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {more && (
        <button type="button" disabled={loading} onClick={() => void search(page + 1)} style={{ ...button, width: "100%", marginTop: 10 }}>
          {loading ? "Lade …" : "Mehr laden"}
        </button>
      )}
      <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.bdr}`, color: C.mut, fontSize: 11, lineHeight: 1.4, textAlign: "center" }}>
        Profile und Bezüge von <a href="https://visualizer.coffee" target="_blank" rel="noopener noreferrer" style={{ color: C.mut, textDecoration: "underline" }}>visualizer.coffee</a> – öffentlich geteilt von der Community.
      </div>
    </Modal>
  );
}