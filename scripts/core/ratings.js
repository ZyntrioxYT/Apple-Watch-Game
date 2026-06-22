function ratingFor(ms) {
  return [
    { max: 150, label: '⚡ Superhuman', color: '#ff4fc8' },
    { max: 200, label: '🥷 Ninja', color: '#00c853' },
    { max: 250, label: '🎯 Sharp', color: '#4db8ff' },
    { max: 320, label: '👍 Human', color: '#ffd700' },
    { max: 420, label: '😐 Average', color: '#aaa' },
    { max: 9999, label: '🐢 Slow', color: '#ff5555' }
  ].find(r => ms < r.max);
}

function aimRatingFor(ms) {
  if (ms < 450) return { label: '⚡ Deadeye', color: '#ff4fc8' };
  if (ms < 650) return { label: '🎯 Sharp', color: '#00c853' };
  if (ms < 850) return { label: '👍 Steady', color: '#4db8ff' };
  if (ms < 1100) return { label: '😐 Warmup', color: '#ffd700' };
  return { label: '🐢 Slow', color: '#ff5555' };
}

function cpsRatingFor(value) {
  if (value >= 9) return { label: 'Elite', color: '#ff4fc8' };
  if (value >= 7.5) return { label: 'Fast', color: '#00c853' };
  if (value >= 6) return { label: 'Sharp', color: '#4db8ff' };
  if (value >= 4.5) return { label: 'Steady', color: '#ffd700' };
  return { label: 'Warmup', color: '#ff7777' };
}
