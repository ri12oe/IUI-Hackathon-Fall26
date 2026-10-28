// Maps a confusion % to the 0–5 heat scale used in _tokens.scss
export function heatLevel(percent: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (percent <= 0) return 0;
  if (percent < 10) return 1;
  if (percent < 20) return 2;
  if (percent < 30) return 3;
  if (percent < 45) return 4;
  return 5;
}