export type JustifiedRow = { height: number; items: { index: number; width: number }[] };

/**
 * Rangées justifiées : on remplit une rangée jusqu'à dépasser la largeur à la hauteur cible,
 * puis on ajuste sa hauteur pour qu'elle tombe pile. La dernière rangée garde la hauteur cible.
 */
export function justify(
  ratios: number[],
  { width, targetHeight, gap }: { width: number; targetHeight: number; gap: number },
): JustifiedRow[] {
  const rows: JustifiedRow[] = [];
  let start = 0;
  let sum = 0;
  for (let i = 0; i < ratios.length; i++) {
    sum += ratios[i];
    const count = i - start + 1;
    const naturalWidth = sum * targetHeight + gap * (count - 1);
    if (naturalWidth >= width) {
      const height = Math.min((width - gap * (count - 1)) / sum, targetHeight * 1.5);
      // Couper avant cette photo donne parfois une rangée plus proche de la hauteur cible (moins écrasée) :
      // on garde la coupure la plus proche, sans dépasser 1,5 fois la cible.
      const before = count > 1 ? (width - gap * (count - 2)) / (sum - ratios[i]) : Infinity;
      if (before <= targetHeight * 1.5 && before - targetHeight < targetHeight - height) {
        rows.push(row(ratios, start, i - 1, before));
        start = i;
        sum = ratios[i];
        // La photo écartée commence la rangée suivante ; elle peut à elle seule la remplir.
        if (ratios[i] * targetHeight >= width) {
          rows.push(row(ratios, i, i, Math.min(width / ratios[i], targetHeight * 1.5)));
          start = i + 1;
          sum = 0;
        }
        continue;
      }
      rows.push(row(ratios, start, i, height));
      start = i + 1;
      sum = 0;
    }
  }
  if (start < ratios.length) rows.push(row(ratios, start, ratios.length - 1, targetHeight));
  return rows;
}

function row(ratios: number[], from: number, to: number, height: number): JustifiedRow {
  const items = [];
  for (let i = from; i <= to; i++) items.push({ index: i, width: ratios[i] * height });
  return { height, items };
}
