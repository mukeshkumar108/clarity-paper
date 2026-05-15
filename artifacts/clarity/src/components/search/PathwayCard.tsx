import type { Pathway } from "@/lib/search-types";
import { Sparkles, AlertTriangle, Users, TrendingUp, Lightbulb, Beaker, GitFork } from "lucide-react";

const iconMap: Record<string, React.ReactNode> = {
  strong: <Sparkles className="w-4 h-4 text-forest-green-action" />,
  complicated: <AlertTriangle className="w-4 h-4 text-goldenrod-accent" />,
  population: <Users className="w-4 h-4 text-blue-500" />,
  emerging: <TrendingUp className="w-4 h-4 text-purple-500" />,
  practical: <Lightbulb className="w-4 h-4 text-amber-500" />,
  mechanism: <Beaker className="w-4 h-4 text-teal-500" />,
  contradiction: <GitFork className="w-4 h-4 text-red-400" />,
};

const fitBadge: Record<string, { label: string; className: string }> = {
  direct: { label: "Strong evidence", className: "bg-forest-green-action/10 text-forest-green-action" },
  adjacent: { label: "Related evidence", className: "bg-goldenrod-accent/10 text-goldenrod-accent" },
  weak: { label: "Needs more research", className: "bg-pebble-gray/40 text-muted-stone" },
};

interface PathwayCardProps {
  pathway: Pathway;
  onSelect: (question: string) => void;
  index: number;
}

export function PathwayCard({ pathway, onSelect, index }: PathwayCardProps) {
  const icon = iconMap[pathway.icon] ?? iconMap.strong;
  const fit = fitBadge[pathway.evidenceFit] ?? fitBadge.adjacent;

  return (
    <button
      onClick={() => onSelect(pathway.question)}
      className="w-full text-left group"
    >
      <div className="relative rounded-xl border border-pebble-gray/60 bg-white/50 hover:bg-white/80 hover:border-pebble-gray transition-all duration-150 px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[13px] font-semibold text-deep-shadow leading-tight">
                {pathway.label}
              </span>
            </div>
            <p className="text-[12px] text-muted-stone leading-relaxed line-clamp-2">
              {pathway.preview}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${fit.className}`}>
                {fit.label}
              </span>
              {pathway.relevantPaperCount > 0 && (
                <span className="text-[10px] text-muted-stone">
                  {pathway.relevantPaperCount} paper{pathway.relevantPaperCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-muted-stone/40 group-hover:text-onyx-outline transition-colors mt-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </button>
  );
}

interface PathwayGroupProps {
  pathways: Pathway[];
  onSelect: (question: string) => void;
}

export function PathwayGroup({ pathways, onSelect }: PathwayGroupProps) {
  if (pathways.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-stone">
        <Sparkles className="w-3 h-3" />
        <span>Explore further</span>
      </div>
      <div className="grid gap-2">
        {pathways.map((pathway, i) => (
          <PathwayCard
            key={i}
            pathway={pathway}
            onSelect={onSelect}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}