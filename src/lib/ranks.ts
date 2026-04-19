export const RANKS = [
  { name: 'Ferro', minPoints: 0, color: 'text-zinc-500', bg: 'bg-zinc-100' },
  { name: 'Bronze', minPoints: 250, color: 'text-orange-700', bg: 'bg-orange-100' },
  { name: 'Prata', minPoints: 750, color: 'text-slate-400', bg: 'bg-slate-100' },
  { name: 'Ouro', minPoints: 1500, color: 'text-amber-500', bg: 'bg-amber-100' },
  { name: 'Platina', minPoints: 3000, color: 'text-cyan-400', bg: 'bg-cyan-100' },
  { name: 'Diamante', minPoints: 6000, color: 'text-blue-500', bg: 'bg-blue-100' },
  { name: 'Mestre', minPoints: 12000, color: 'text-purple-600', bg: 'bg-purple-100' },
];

export const getRank = (points: number) => {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (points >= RANKS[i].minPoints) {
      return RANKS[i];
    }
  }
  return RANKS[0];
};
