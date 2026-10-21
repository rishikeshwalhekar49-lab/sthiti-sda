// Chip buttons from the original markup: one-of-many (filters, sorts, episodes) and on/off toggles.
export function ChipOption({ attr, active, onPick, children, ...p }) {
  return <button {...p} aria-pressed={String(active === p[attr])} onClick={() => onPick(p[attr])}>{children}</button>;
}
export function ChipToggle({ attr, on, onToggle, children, ...p }) {
  return <button {...p} aria-pressed={String(!!on[p[attr]])} onClick={() => onToggle(p[attr])}>{children}</button>;
}
