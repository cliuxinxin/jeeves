export function formatNodeLabel(node?: string | null, nodeLabel?: string | null) {
  if (nodeLabel?.trim()) {
    return nodeLabel.trim();
  }
  if (node?.trim()) {
    return `节点 · ${node.trim()}`;
  }
  return "未标记节点";
}

export function stageAccentClass(node?: string | null) {
  if (node === "analyzer") return "border-l-sky-400 bg-sky-50/60";
  if (node === "deconstructor") return "border-l-emerald-400 bg-emerald-50/50";
  if (node === "strategist") return "border-l-amber-400 bg-amber-50/70";
  if (node === "writer") return "border-l-rose-400 bg-rose-50/60";
  if (node === "value_router") return "border-l-indigo-400 bg-indigo-50/60";
  if (node === "card_writer") return "border-l-teal-400 bg-teal-50/60";
  return "border-l-slate-300 bg-white";
}
