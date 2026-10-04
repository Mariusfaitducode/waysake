import { Fragment, type ReactNode } from "react";

/**
 * Mise en valeur dans une phrase traduite, sans HTML : `<b>…</b>` devient <strong>, `<em>…</em>` devient <em>.
 * L'ordre des mots reste ainsi libre dans chaque langue (« Localiser <b>3 photos</b> à… » / « Place <b>3 photos</b> in… »).
 */
export function rich(text: string): ReactNode {
  const out: ReactNode[] = [];
  const re = /<(b|em)>(.*?)<\/\1>/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] === "b" ? <strong key={m.index}>{m[2]}</strong> : <em key={m.index}>{m[2]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}
