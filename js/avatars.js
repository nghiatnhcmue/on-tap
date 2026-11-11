/**
 * TinHocHub - Avatar Studio (Linh Thú Blooks vẽ bằng SVG thuần)
 * Mỗi nhân vật được ghép từ các bộ phận vector (thân, tai, mắt, miệng, hoa văn, phụ kiện)
 * => nét sắc ở mọi kích thước, không cần tải ảnh ngoài, nhẹ và đồng bộ phong cách.
 */

const SKIN = '#FCD9B6';
const INK = '#1E1B4B';

export const AVATAR_CATEGORIES = [
  { id: 'all', label: 'Tất cả', name: 'Tất cả', icon: '✨' },
  { id: 'animal', label: 'Động vật', name: 'Động vật', icon: '🐾' },
  { id: 'myth', label: 'Thần thoại', name: 'Thần thoại', icon: '🐉' },
  { id: 'tech', label: 'Công nghệ', name: 'Công nghệ', icon: '🤖' },
  { id: 'space', label: 'Vũ trụ', name: 'Vũ trụ', icon: '🚀' },
  { id: 'sea', label: 'Đại dương', name: 'Đại dương', icon: '🌊' },
  { id: 'people', label: 'Nhân vật', name: 'Nhân vật', icon: '🧑‍💻' }
];

export const RARITY = {
  common: { label: 'Thường', color: '#64748b', badge: 'from-slate-500 to-slate-600', bg: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  rare: { label: 'Hiếm', color: '#2563eb', badge: 'from-blue-500 to-indigo-600', bg: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  epic: { label: 'Sử thi', color: '#9333ea', badge: 'from-purple-500 to-pink-600', bg: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' },
  legendary: { label: 'Huyền thoại', color: '#d97706', badge: 'from-amber-400 to-orange-500', bg: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  mythic: { label: 'Thần Thoại', color: '#e11d48', badge: 'from-rose-500 via-amber-400 to-purple-600', bg: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' }
};

// id cũ (bot, cat, dragon, wizard, astronaut, fox, owl, unicorn, alien, lion, panda, shark) được giữ nguyên để tương thích dữ liệu đã lưu
export const AVATARS = [
  { id: 'bot', name: 'Cyber Bot', cat: 'tech', rarity: 'rare', desc: 'Tăng 10% may mắn mở rương', bg: ['#22d3ee', '#2563eb'],
    spec: { shape: 'square', body: '#CBD5E1', ears: 'antenna', eyes: 'visor', mouth: 'robot', pattern: ['bolts'] } },
  { id: 'cat', name: 'Ninja Neko', cat: 'animal', rarity: 'common', desc: 'Bứt tốc phản xạ câu hỏi', bg: ['#fbbf24', '#f97316'],
    spec: { body: '#FB923C', ears: 'cat', eyes: 'big', mouth: 'cat', cheeks: true, acc: 'ninjaBand' } },
  { id: 'dragon', name: 'Rồng Lửa', cat: 'myth', rarity: 'epic', desc: 'Sát thương chí mạng lên Boss', bg: ['#fb7185', '#b91c1c'],
    spec: { body: '#EF4444', ears: 'dragon', belly: '#FDE68A', eyes: 'big', mouth: 'fang', pattern: ['belly'] } },
  { id: 'wizard', name: 'Pháp Sư', cat: 'people', rarity: 'epic', desc: 'Khiên phép thuật bảo hộ', bg: ['#a78bfa', '#4338ca'],
    spec: { body: SKIN, eyes: 'happy', mouth: 'none', cheeks: true, pattern: ['beard'], acc: 'wizard' } },
  { id: 'astronaut', name: 'Phi Hành Gia', cat: 'space', rarity: 'rare', desc: 'Khám phá tri thức vũ trụ', bg: ['#60a5fa', '#6d28d9'],
    spec: { body: SKIN, eyes: 'big', mouth: 'smile', cheeks: true, pattern: ['hair'], hair: '#7C2D12', acc: 'helmet' } },
  { id: 'fox', name: 'Cáo Tinh Anh', cat: 'animal', rarity: 'common', desc: 'Mưu lược cướp vàng thông thái', bg: ['#fdba74', '#ea580c'],
    spec: { body: '#F97316', ears: 'fox', eyes: 'dot', mouth: 'cat', cheeks: true, pattern: ['faceMask'], mask: '#FFF7ED' } },
  { id: 'owl', name: 'Cú Thông Thái', cat: 'animal', rarity: 'rare', desc: 'Trực giác đáp án chính xác', bg: ['#34d399', '#0f766e'],
    spec: { body: '#92400E', ears: 'owl', belly: '#FDE68A', eyes: 'big', mouth: 'beak', pattern: ['belly'], acc: 'glasses' } },
  { id: 'unicorn', name: 'Kỳ Lân', cat: 'myth', rarity: 'legendary', desc: 'Nhân đôi combo may mắn', bg: ['#f9a8d4', '#a855f7'],
    spec: { body: '#FDF4FF', ears: 'unicorn', eyes: 'happy', mouth: 'smile', cheeks: true, pattern: ['unicornMane'] } },
  { id: 'alien', name: 'Pixel Alien', cat: 'space', rarity: 'rare', desc: 'Miễn nhiễm đòn đóng băng', bg: ['#bef264', '#16a34a'],
    spec: { body: '#A3E635', ears: 'antennae', eyes: 'cyclops', mouth: 'o', pattern: ['spots'] } },
  { id: 'lion', name: 'Sư Tử Chúa', cat: 'animal', rarity: 'legendary', desc: 'Vương giả dẫn đầu bảng', bg: ['#fde047', '#d97706'],
    spec: { body: '#FACC15', ears: 'mane', mane: '#EA580C', eyes: 'dot', mouth: 'cat', cheeks: true, pattern: ['faceMask'], mask: '#FEF3C7', acc: 'crown' } },
  { id: 'panda', name: 'Kungfu Panda', cat: 'animal', rarity: 'epic', desc: 'Đòn đánh liên hoàn dũng mãnh', bg: ['#64748b', '#0f172a'],
    spec: { body: '#FFFFFF', ears: 'panda', eyes: 'small', mouth: 'smile', pattern: ['pandaPatch'], acc: 'ninjaBand' } },
  { id: 'shark', name: 'Cá Mập Tech', cat: 'sea', rarity: 'epic', desc: 'Lướt sóng bứt phá thần tốc', bg: ['#38bdf8', '#4338ca'],
    spec: { body: '#3B82F6', ears: 'fin', belly: '#E0F2FE', eyes: 'dot', mouth: 'sharkGrin', pattern: ['bellyBig'] } },

  { id: 'bunny', name: 'Thỏ Ngọc', cat: 'animal', rarity: 'common', desc: 'Nhảy cóc vượt chướng ngại', bg: ['#fda4af', '#e11d48'],
    spec: { body: '#FFF1F2', ears: 'bunny', eyes: 'big', mouth: 'cat', cheeks: true, acc: 'bow' } },
  { id: 'bear', name: 'Gấu Mật', cat: 'animal', rarity: 'common', desc: 'Bền bỉ trả lời liên tục', bg: ['#fcd34d', '#92400e'],
    spec: { body: '#B45309', ears: 'bear', belly: '#FDE68A', eyes: 'dot', mouth: 'tongue', cheeks: true, pattern: ['belly'] } },
  { id: 'penguin', name: 'Cánh Cụt Code', cat: 'animal', rarity: 'rare', desc: 'Bình tĩnh trước mọi câu khó', bg: ['#7dd3fc', '#0369a1'],
    spec: { body: '#1E293B', belly: '#F8FAFC', eyes: 'dot', mouth: 'beak', cheeks: true, pattern: ['penguinFace'], acc: 'scarf' } },
  { id: 'frog', name: 'Ếch Hacker', cat: 'animal', rarity: 'common', desc: 'Nhảy vọt lên bảng xếp hạng', bg: ['#86efac', '#15803d'],
    spec: { body: '#4ADE80', ears: 'frog', eyeY: 32, eyes: 'big', mouth: 'smileWide', mouthY: 66, cheeks: true, pattern: ['belly'], belly: '#BBF7D0' } },
  { id: 'chick', name: 'Gà Con Byte', cat: 'animal', rarity: 'common', desc: 'Nhỏ mà có võ', bg: ['#fef08a', '#f59e0b'],
    spec: { body: '#FDE047', ears: 'tuft', eyes: 'dot', mouth: 'beak', cheeks: true } },
  { id: 'tiger', name: 'Hổ Quyền Năng', cat: 'animal', rarity: 'rare', desc: 'Gầm vang khi đạt chuỗi đúng', bg: ['#fb923c', '#c2410c'],
    spec: { body: '#F97316', ears: 'bear', eyes: 'dot', mouth: 'fang', pattern: ['faceMask', 'stripes'], mask: '#FFF7ED' } },
  { id: 'pig', name: 'Heo Hồng', cat: 'animal', rarity: 'common', desc: 'Tích lũy vàng siêu nhanh', bg: ['#fbcfe8', '#db2777'],
    spec: { body: '#F9A8D4', ears: 'pig', eyes: 'dot', mouth: 'smile', mouthY: 78, cheeks: true, pattern: ['snout'] } },
  { id: 'koala', name: 'Koala Ngủ Gật', cat: 'animal', rarity: 'common', desc: 'Chậm mà chắc', bg: ['#cbd5e1', '#475569'],
    spec: { body: '#94A3B8', ears: 'koala', eyes: 'sleepy', mouth: 'smile', mouthY: 76, cheeks: true, pattern: ['nose'] } },
  { id: 'raccoon', name: 'Gấu Mèo', cat: 'animal', rarity: 'rare', desc: 'Lén lút cướp vàng', bg: ['#9ca3af', '#374151'],
    spec: { body: '#9CA3AF', ears: 'cat', eyes: 'small', mouth: 'cat', pattern: ['raccoon'] } },
  { id: 'mouse', name: 'Chuột Máy Tính', cat: 'tech', rarity: 'common', desc: 'Click siêu tốc', bg: ['#e2e8f0', '#64748b'],
    spec: { body: '#CBD5E1', ears: 'mouse', eyes: 'big', mouth: 'cat', cheeks: true, pattern: ['pinkNose'] } },
  { id: 'hamster', name: 'Hamster Mập', cat: 'animal', rarity: 'common', desc: 'Nhét đầy má kiến thức', bg: ['#fed7aa', '#ea580c'],
    spec: { body: '#FDBA74', ears: 'bear', belly: '#FFF7ED', eyes: 'dot', mouth: 'cat', cheeks: true, pattern: ['belly', 'pinkNose'] } },
  { id: 'monkey', name: 'Khỉ Lanh Lợi', cat: 'animal', rarity: 'common', desc: 'Leo nhanh bảng điểm', bg: ['#d6a77a', '#78350f'],
    spec: { body: '#92400E', ears: 'monkey', eyes: 'dot', mouth: 'smileWide', pattern: ['monkeyFace'] } },

  { id: 'ghost', name: 'Bóng Ma Bug', cat: 'myth', rarity: 'rare', desc: 'Xuyên tường né đòn cướp', bg: ['#c4b5fd', '#4c1d95'],
    spec: { shape: 'ghost', body: '#F5F3FF', eyes: 'dot', mouth: 'o', cheeks: true } },
  { id: 'slime', name: 'Slime Thạch', cat: 'myth', rarity: 'common', desc: 'Dẻo dai hồi phục nhanh', bg: ['#5eead4', '#0e7490'],
    spec: { shape: 'slime', body: '#2DD4BF', eyes: 'happy', mouth: 'smile', cheeks: true } },
  { id: 'devil', name: 'Quỷ Nhỏ Lỗi', cat: 'myth', rarity: 'epic', desc: 'Gây rối đối thủ', bg: ['#f87171', '#7f1d1d'],
    spec: { body: '#DC2626', ears: 'horns', horn: '#1F2937', eyes: 'wink', mouth: 'fang' } },
  { id: 'angel', name: 'Thiên Thần Debug', cat: 'myth', rarity: 'epic', desc: 'Sửa mọi lỗi sai', bg: ['#fef9c3', '#93c5fd'],
    spec: { body: SKIN, eyes: 'happy', mouth: 'smile', cheeks: true, pattern: ['wings', 'hair'], hair: '#FACC15', wing: '#FFFFFF', acc: 'halo' } },
  { id: 'phoenix', name: 'Phượng Hoàng', cat: 'myth', rarity: 'legendary', desc: 'Hồi sinh sau câu sai', bg: ['#fbbf24', '#dc2626'],
    spec: { body: '#F97316', ears: 'crest', belly: '#FDE047', eyes: 'star', mouth: 'beak', pattern: ['wings', 'belly'], wing: '#FB923C' } },
  { id: 'dino', name: 'Khủng Long T-Rex', cat: 'myth', rarity: 'rare', desc: 'Sức mạnh tiền sử', bg: ['#4ade80', '#166534'],
    spec: { body: '#22C55E', ears: 'spikes', belly: '#BBF7D0', eyes: 'big', mouth: 'grin', pattern: ['belly'] } },
  { id: 'mushroom', name: 'Nấm Phép Thuật', cat: 'myth', rarity: 'common', desc: 'Phát triển thần tốc', bg: ['#fca5a5', '#b91c1c'],
    spec: { body: '#FEF3C7', eyes: 'dot', mouth: 'smile', cheeks: true, acc: 'mushroom' } },

  { id: 'mecha', name: 'Mecha Đỏ', cat: 'tech', rarity: 'rare', desc: 'Giáp thép chống cướp', bg: ['#fca5a5', '#991b1b'],
    spec: { shape: 'square', body: '#EF4444', ears: 'antenna', eyes: 'visor', mouth: 'robot', pattern: ['bolts'] } },
  { id: 'cyborg', name: 'Cyborg Neon', cat: 'tech', rarity: 'epic', desc: 'Xử lý dữ liệu song song', bg: ['#c084fc', '#312e81'],
    spec: { shape: 'square', body: '#7C3AED', eyes: 'visor', mouth: 'robot', pattern: ['bolts'], acc: 'headphones' } },
  { id: 'coder', name: 'Lập Trình Viên', cat: 'people', rarity: 'rare', desc: 'Debug mọi câu hỏi', bg: ['#93c5fd', '#1d4ed8'],
    spec: { body: SKIN, eyes: 'dot', mouth: 'smile', cheeks: true, pattern: ['hair'], hair: '#1F2937', acc: 'glasses' } },
  { id: 'girl', name: 'Nữ Sinh Tin Học', cat: 'people', rarity: 'rare', desc: 'Chăm chỉ & tỉ mỉ', bg: ['#f9a8d4', '#be185d'],
    spec: { body: SKIN, eyes: 'big', mouth: 'smile', cheeks: true, pattern: ['longHair', 'hair'], hair: '#78350F', acc: 'bow' } },
  { id: 'ninja', name: 'Ninja Bóng Đêm', cat: 'people', rarity: 'epic', desc: 'Ẩn thân trước đòn cướp', bg: ['#475569', '#020617'],
    spec: { body: '#111827', eyes: 'ninja', mouth: 'none', pattern: ['ninjaWindow'], acc: 'ninjaBand' } },
  { id: 'gamer', name: 'Game Thủ', cat: 'people', rarity: 'common', desc: 'Phản xạ cực nhanh', bg: ['#a5b4fc', '#4338ca'],
    spec: { body: SKIN, eyes: 'happy', mouth: 'smileWide', cheeks: true, pattern: ['hair'], hair: '#B45309', acc: 'headphones' } },

  { id: 'sun', name: 'Mặt Trời Code', cat: 'space', rarity: 'rare', desc: 'Tỏa sáng mọi trận đấu', bg: ['#fde68a', '#f97316'],
    spec: { body: '#FDE047', ears: 'rays', eyes: 'dot', mouth: 'smileWide', cheeks: true, acc: 'sunglasses' } },
  { id: 'moon', name: 'Trăng Mơ Màng', cat: 'space', rarity: 'rare', desc: 'Bình yên giữa trận chiến', bg: ['#6366f1', '#1e1b4b'],
    spec: { body: '#E0E7FF', eyes: 'sleepy', mouth: 'smile', cheeks: true, pattern: ['craters'], acc: 'stars' } },
  { id: 'planet', name: 'Hành Tinh Saturn', cat: 'space', rarity: 'epic', desc: 'Vòng xoáy tri thức', bg: ['#f0abfc', '#7e22ce'],
    spec: { body: '#FB923C', eyes: 'big', mouth: 'smile', cheeks: true, pattern: ['bands'], acc: 'ring' } },

  { id: 'octopus', name: 'Bạch Tuộc Đa Nhiệm', cat: 'sea', rarity: 'rare', desc: '8 tay trả lời 8 câu', bg: ['#d8b4fe', '#7e22ce'],
    spec: { body: '#A855F7', ears: 'tentacles', eyes: 'big', mouth: 'smile', cheeks: true, pattern: ['spots'] } },
  { id: 'whale', name: 'Cá Voi Xanh', cat: 'sea', rarity: 'common', desc: 'Nuốt trọn kiến thức', bg: ['#93c5fd', '#1e40af'],
    spec: { body: '#2563EB', ears: 'spout', belly: '#DBEAFE', eyes: 'dot', mouth: 'smile', cheeks: true, pattern: ['belly'] } },
  { id: 'puffer', name: 'Cá Nóc Gai', cat: 'sea', rarity: 'common', desc: 'Phồng to khi bị cướp', bg: ['#fde68a', '#0891b2'],
    spec: { body: '#FCD34D', ears: 'spikesAll', eyes: 'big', mouth: 'o', cheeks: true, pattern: ['spots'] } },
  { id: 'crab', name: 'Cua Hoàng Đế', cat: 'sea', rarity: 'epic', desc: 'Kẹp chặt vị trí Top 1', bg: ['#fca5a5', '#0e7490'],
    spec: { body: '#F43F5E', ears: 'claws', eyes: 'dot', eyeY: 50, mouth: 'smile', cheeks: true, acc: 'crown' } }
];

const AVATAR_MAP = Object.fromEntries(AVATARS.map(a => [a.id, a]));

export function getAvatar(id) {
  return AVATAR_MAP[id] || AVATARS[0];
}

function shade(hex, amt) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const num = parseInt(full, 16);
  const adj = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  const r = adj((num >> 16) & 255);
  const g = adj((num >> 8) & 255);
  const b = adj(num & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function star(cx, cy, r, fill, extra = '') {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(rad)).toFixed(1)},${(cy + rr * Math.sin(rad)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" ${extra}/>`;
}

// ---------- LỚP SAU THÂN (tai, bờm, cánh, xúc tu...) ----------
function backLayer(s, body, dark, light) {
  const out = [];
  const pats = s.pattern || [];
  if (pats.includes('wings')) {
    const w = s.wing || '#FFFFFF';
    out.push(`<path d="M22 58 Q2 40 4 66 Q8 80 24 74 Z" fill="${w}" stroke="${shade(w, -0.15)}" stroke-width="1.5"/>`);
    out.push(`<path d="M78 58 Q98 40 96 66 Q92 80 76 74 Z" fill="${w}" stroke="${shade(w, -0.15)}" stroke-width="1.5"/>`);
  }
  if (pats.includes('longHair')) {
    const hc = s.hair || '#78350F';
    out.push(`<path d="M18 50 Q12 80 22 92 L32 92 L30 56 Z" fill="${hc}"/>`);
    out.push(`<path d="M82 50 Q88 80 78 92 L68 92 L70 56 Z" fill="${hc}"/>`);
  }
  switch (s.ears) {
    case 'cat':
      out.push(`<path d="M22 46 L26 14 L46 30 Z" fill="${body}"/><path d="M78 46 L74 14 L54 30 Z" fill="${body}"/>`);
      out.push(`<path d="M28 38 L29 22 L40 31 Z" fill="#F9A8D4"/><path d="M72 38 L71 22 L60 31 Z" fill="#F9A8D4"/>`);
      break;
    case 'fox':
      out.push(`<path d="M18 48 L22 6 L46 30 Z" fill="${body}"/><path d="M82 48 L78 6 L54 30 Z" fill="${body}"/>`);
      out.push(`<path d="M25 38 L25 16 L39 30 Z" fill="#FFF7ED"/><path d="M75 38 L75 16 L61 30 Z" fill="#FFF7ED"/>`);
      break;
    case 'bear':
      out.push(`<circle cx="26" cy="32" r="12" fill="${body}"/><circle cx="74" cy="32" r="12" fill="${body}"/>`);
      out.push(`<circle cx="26" cy="32" r="6" fill="${light}"/><circle cx="74" cy="32" r="6" fill="${light}"/>`);
      break;
    case 'panda':
      out.push(`<circle cx="25" cy="32" r="12" fill="#1F2937"/><circle cx="75" cy="32" r="12" fill="#1F2937"/>`);
      break;
    case 'mouse':
      out.push(`<circle cx="20" cy="34" r="17" fill="${body}"/><circle cx="80" cy="34" r="17" fill="${body}"/>`);
      out.push(`<circle cx="20" cy="34" r="10" fill="#F9A8D4"/><circle cx="80" cy="34" r="10" fill="#F9A8D4"/>`);
      break;
    case 'koala':
      out.push(`<circle cx="17" cy="42" r="16" fill="${body}"/><circle cx="83" cy="42" r="16" fill="${body}"/>`);
      out.push(`<circle cx="17" cy="42" r="9" fill="${light}"/><circle cx="83" cy="42" r="9" fill="${light}"/>`);
      break;
    case 'monkey':
      out.push(`<circle cx="15" cy="56" r="11" fill="${body}"/><circle cx="85" cy="56" r="11" fill="${body}"/>`);
      out.push(`<circle cx="15" cy="56" r="6" fill="#FDE6C8"/><circle cx="85" cy="56" r="6" fill="#FDE6C8"/>`);
      break;
    case 'bunny':
      out.push(`<ellipse cx="37" cy="18" rx="8" ry="20" transform="rotate(-10 37 18)" fill="${body}"/>`);
      out.push(`<ellipse cx="63" cy="18" rx="8" ry="20" transform="rotate(10 63 18)" fill="${body}"/>`);
      out.push(`<ellipse cx="37" cy="19" rx="4" ry="14" transform="rotate(-10 37 19)" fill="#F9A8D4"/>`);
      out.push(`<ellipse cx="63" cy="19" rx="4" ry="14" transform="rotate(10 63 19)" fill="#F9A8D4"/>`);
      break;
    case 'pig':
      out.push(`<path d="M24 38 L22 16 L42 30 Z" fill="${dark}"/><path d="M76 38 L78 16 L58 30 Z" fill="${dark}"/>`);
      break;
    case 'horns':
    case 'dragon': {
      const hc = s.horn || '#FDE68A';
      out.push(`<path d="M30 36 Q20 18 28 6 Q32 22 42 30 Z" fill="${hc}"/><path d="M70 36 Q80 18 72 6 Q68 22 58 30 Z" fill="${hc}"/>`);
      if (s.ears === 'dragon') out.push(`<path d="M42 30 L46 16 L50 28 L54 14 L58 30 Z" fill="${dark}"/>`);
      break;
    }
    case 'spikes':
      out.push(`<path d="M30 34 L34 16 L40 30 L46 12 L52 28 L58 12 L62 30 L68 18 L72 36 Z" fill="${dark}"/>`);
      break;
    case 'spikesAll':
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14;
        const x1 = 50 + 32 * Math.cos(a), y1 = 58 + 30 * Math.sin(a);
        const x2 = 50 + 44 * Math.cos(a), y2 = 58 + 41 * Math.sin(a);
        out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${dark}" stroke-width="4" stroke-linecap="round"/>`);
      }
      break;
    case 'owl':
      out.push(`<path d="M24 38 L20 12 L40 28 Z" fill="${dark}"/><path d="M76 38 L80 12 L60 28 Z" fill="${dark}"/>`);
      break;
    case 'fin':
      out.push(`<path d="M50 4 Q60 16 66 32 L36 32 Q42 16 50 4 Z" fill="${dark}"/>`);
      break;
    case 'frog':
      out.push(`<circle cx="33" cy="32" r="14" fill="${body}"/><circle cx="67" cy="32" r="14" fill="${body}"/>`);
      break;
    case 'crest':
      out.push(`<path d="M50 30 Q36 12 44 2 Q47 14 52 6 Q52 16 62 8 Q62 22 50 30 Z" fill="#FBBF24" stroke="#F97316" stroke-width="1.5"/>`);
      break;
    case 'rays':
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12;
        const p = (r, off) => `${(50 + r * Math.cos(a + off)).toFixed(1)},${(56 + r * Math.sin(a + off)).toFixed(1)}`;
        out.push(`<polygon points="${p(30, -0.2)} ${p(47, 0)} ${p(30, 0.2)}" fill="#FB923C"/>`);
      }
      break;
    case 'mane': {
      const mc = s.mane || '#EA580C';
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI * 2 * i) / 16;
        out.push(`<circle cx="${(50 + 35 * Math.cos(a)).toFixed(1)}" cy="${(57 + 33 * Math.sin(a)).toFixed(1)}" r="11" fill="${i % 2 ? mc : shade(mc, 0.08)}"/>`);
      }
      out.push(`<circle cx="27" cy="32" r="9" fill="${body}"/><circle cx="73" cy="32" r="9" fill="${body}"/>`);
      break;
    }
    case 'tentacles':
      [26, 38, 50, 62, 74].forEach((x, i) => {
        const dir = i % 2 ? 6 : -6;
        out.push(`<path d="M${x} 80 q${dir} 10 0 16" stroke="${dark}" stroke-width="9" stroke-linecap="round" fill="none"/>`);
      });
      break;
    case 'claws':
      out.push(`<path d="M18 62 Q4 54 8 40 Q14 46 20 44 Q12 36 18 30 Q28 40 24 58 Z" fill="${dark}"/>`);
      out.push(`<path d="M82 62 Q96 54 92 40 Q86 46 80 44 Q88 36 82 30 Q72 40 76 58 Z" fill="${dark}"/>`);
      out.push(`<line x1="40" y1="30" x2="36" y2="18" stroke="${dark}" stroke-width="3"/><line x1="60" y1="30" x2="64" y2="18" stroke="${dark}" stroke-width="3"/>`);
      break;
    case 'antenna':
      out.push(`<line x1="50" y1="28" x2="50" y2="10" stroke="#64748B" stroke-width="3"/><circle cx="50" cy="9" r="5" fill="#F43F5E"/>`);
      break;
    case 'antennae':
      out.push(`<line x1="40" y1="30" x2="31" y2="9" stroke="${dark}" stroke-width="3"/><line x1="60" y1="30" x2="69" y2="9" stroke="${dark}" stroke-width="3"/>`);
      out.push(`<circle cx="31" cy="9" r="5" fill="#FDE047"/><circle cx="69" cy="9" r="5" fill="#FDE047"/>`);
      break;
    case 'spout':
      out.push(`<path d="M50 24 Q44 12 36 12 M50 24 L50 6 M50 24 Q56 12 64 12" stroke="#7DD3FC" stroke-width="3.5" stroke-linecap="round" fill="none"/>`);
      out.push(`<circle cx="34" cy="12" r="3" fill="#BAE6FD"/><circle cx="66" cy="12" r="3" fill="#BAE6FD"/><circle cx="50" cy="5" r="3" fill="#BAE6FD"/>`);
      break;
    case 'unicorn':
      out.push(`<path d="M26 42 L28 20 L42 32 Z" fill="${body}" stroke="#F0ABFC" stroke-width="1.5"/><path d="M74 42 L72 20 L58 32 Z" fill="${body}" stroke="#F0ABFC" stroke-width="1.5"/>`);
      break;
    default:
      break;
  }
  return out.join('');
}

// ---------- THÂN ----------
function bodyLayer(s, body, dark) {
  switch (s.shape) {
    case 'square':
      return `<rect x="18" y="28" width="64" height="60" rx="16" fill="${body}" stroke="${dark}" stroke-width="2"/>`;
    case 'ghost':
      return `<path d="M18 60 Q18 24 50 24 Q82 24 82 60 L82 88 Q75 80 68 87 Q61 94 54 87 Q47 80 40 87 Q33 94 26 87 Q20 82 18 88 Z" fill="${body}" stroke="${shade(body, -0.12)}" stroke-width="2"/>`;
    case 'slime':
      return `<path d="M12 88 C12 52 28 28 50 28 C72 28 88 52 88 88 Z" fill="${body}" stroke="${dark}" stroke-width="2"/>`;
    default:
      return `<ellipse cx="50" cy="58" rx="34" ry="32" fill="${body}" stroke="${dark}" stroke-width="1.5"/>`;
  }
}

// ---------- HOA VĂN TRÊN THÂN ----------
function patternLayer(s, body, dark, light) {
  const out = [];
  const pats = s.pattern || [];
  const eyeY = s.eyeY || 54;
  if (pats.includes('belly')) out.push(`<ellipse cx="50" cy="76" rx="20" ry="12" fill="${s.belly || light}"/>`);
  if (pats.includes('bellyBig')) out.push(`<path d="M24 66 Q50 58 76 66 Q72 88 50 90 Q28 88 24 66 Z" fill="${s.belly || light}"/>`);
  if (pats.includes('penguinFace')) out.push(`<path d="M50 40 Q60 30 72 42 Q86 62 70 84 Q50 94 30 84 Q14 62 28 42 Q40 30 50 40 Z" fill="${s.belly || '#F8FAFC'}"/>`);
  if (pats.includes('faceMask')) out.push(`<ellipse cx="50" cy="70" rx="22" ry="15" fill="${s.mask || '#FFF7ED'}"/>`);
  if (pats.includes('monkeyFace')) {
    out.push(`<circle cx="40" cy="54" r="12" fill="#FDE6C8"/><circle cx="60" cy="54" r="12" fill="#FDE6C8"/><ellipse cx="50" cy="70" rx="20" ry="14" fill="#FDE6C8"/>`);
  }
  if (pats.includes('hair')) {
    const hc = s.hair || '#1F2937';
    out.push(`<path d="M17 54 Q14 22 50 22 Q86 22 83 54 Q78 38 66 36 Q56 44 42 36 Q26 36 17 54 Z" fill="${hc}"/>`);
  }
  if (pats.includes('stripes')) {
    out.push(`<path d="M40 29 Q43 35 40 40 M50 26 Q53 33 50 38 M60 29 Q57 35 60 40 M17 54 L27 56 M17 63 L26 63 M83 54 L73 56 M83 63 L74 63" stroke="${shade(body, -0.35)}" stroke-width="3.5" stroke-linecap="round" fill="none"/>`);
  }
  if (pats.includes('spots')) {
    out.push(`<circle cx="30" cy="44" r="4" fill="${dark}" opacity=".45"/><circle cx="72" cy="76" r="5" fill="${dark}" opacity=".45"/><circle cx="66" cy="36" r="3" fill="${dark}" opacity=".45"/><circle cx="26" cy="72" r="3" fill="${dark}" opacity=".45"/>`);
  }
  if (pats.includes('craters')) {
    out.push(`<circle cx="30" cy="42" r="5" fill="${shade(body, -0.1)}"/><circle cx="72" cy="76" r="6" fill="${shade(body, -0.1)}"/><circle cx="70" cy="38" r="3.5" fill="${shade(body, -0.1)}"/>`);
  }
  if (pats.includes('bands')) {
    out.push(`<path d="M18 46 Q50 40 82 46 L84 52 Q50 46 16 52 Z" fill="${shade(body, -0.12)}"/><path d="M17 74 Q50 80 83 74 L80 80 Q50 86 20 80 Z" fill="${shade(body, 0.12)}"/>`);
  }
  if (pats.includes('pandaPatch')) {
    out.push(`<ellipse cx="37" cy="${eyeY}" rx="9" ry="11" transform="rotate(-20 37 ${eyeY})" fill="#1F2937"/>`);
    out.push(`<ellipse cx="63" cy="${eyeY}" rx="9" ry="11" transform="rotate(20 63 ${eyeY})" fill="#1F2937"/>`);
  }
  if (pats.includes('raccoon')) {
    out.push(`<path d="M17 52 Q30 42 50 50 Q70 42 83 52 Q72 64 50 58 Q28 64 17 52 Z" fill="#334155"/>`);
    out.push(`<path d="M40 64 Q50 80 60 64 Z" fill="#F3F4F6"/>`);
  }
  if (pats.includes('ninjaWindow')) {
    out.push(`<path d="M20 46 Q50 38 80 46 L80 62 Q50 54 20 62 Z" fill="${SKIN}"/>`);
  }
  if (pats.includes('beard')) {
    out.push(`<path d="M24 64 Q28 98 50 99 Q72 98 76 64 Q64 74 50 72 Q36 74 24 64 Z" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1.5"/>`);
    out.push(`<path d="M38 68 Q44 64 50 68 Q56 64 62 68" stroke="#E2E8F0" stroke-width="5" stroke-linecap="round" fill="none"/>`);
  }
  if (pats.includes('unicornMane')) {
    out.push(`<path d="M56 26 Q86 26 84 62 Q78 46 62 40 Z" fill="#F472B6"/><path d="M64 30 Q90 42 82 70 Q78 52 68 46 Z" fill="#60A5FA"/><path d="M52 26 Q72 22 78 40 Q66 32 56 34 Z" fill="#FDE047"/>`);
  }
  if (pats.includes('snout')) {
    out.push(`<ellipse cx="50" cy="67" rx="11" ry="8" fill="${shade(body, -0.1)}"/><ellipse cx="46" cy="67" rx="2" ry="3" fill="${shade(body, -0.4)}"/><ellipse cx="54" cy="67" rx="2" ry="3" fill="${shade(body, -0.4)}"/>`);
  }
  if (pats.includes('nose')) out.push(`<ellipse cx="50" cy="64" rx="7" ry="9" fill="#374151"/>`);
  if (pats.includes('pinkNose')) out.push(`<ellipse cx="50" cy="63" rx="3.5" ry="2.5" fill="#F472B6"/>`);
  if (pats.includes('bolts')) {
    out.push(`<circle cx="25" cy="35" r="2.5" fill="${dark}"/><circle cx="75" cy="35" r="2.5" fill="${dark}"/><circle cx="25" cy="81" r="2.5" fill="${dark}"/><circle cx="75" cy="81" r="2.5" fill="${dark}"/>`);
  }
  // Highlight bóng sáng 3D
  if (s.shape !== 'square') out.push(`<ellipse cx="34" cy="40" rx="9" ry="5" transform="rotate(-30 34 40)" fill="#FFFFFF" opacity=".35"/>`);
  else out.push(`<rect x="24" y="32" width="18" height="4" rx="2" fill="#FFFFFF" opacity=".4"/>`);
  return out.join('');
}

// ---------- MẮT ----------
function eyesLayer(s) {
  const y = s.eyeY || 54;
  const eye = (x, kind) => {
    switch (kind) {
      case 'big':
        return `<circle cx="${x}" cy="${y}" r="9" fill="#FFFFFF"/><circle cx="${x + 1}" cy="${y + 1}" r="5.5" fill="${INK}"/><circle cx="${x + 3}" cy="${y - 2}" r="2.2" fill="#FFFFFF"/>`;
      case 'small':
        return `<circle cx="${x}" cy="${y}" r="4.5" fill="#FFFFFF"/><circle cx="${x + 0.5}" cy="${y + 0.5}" r="2.6" fill="${INK}"/>`;
      case 'happy':
        return `<path d="M${x - 6} ${y + 2} Q${x} ${y - 6} ${x + 6} ${y + 2}" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" fill="none"/>`;
      case 'sleepy':
        return `<path d="M${x - 6} ${y} Q${x} ${y + 5} ${x + 6} ${y}" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" fill="none"/>`;
      case 'star':
        return star(x, y, 8, '#FACC15', `stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"`);
      case 'ninja':
        return `<ellipse cx="${x}" cy="${y}" rx="6" ry="3.5" fill="#FFFFFF"/><circle cx="${x + 1}" cy="${y}" r="2.5" fill="${INK}"/><path d="M${x - 7} ${y - 6} L${x + 6} ${y - 3}" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" transform="${x > 50 ? `scale(-1 1) translate(${-2 * x} 0)` : ''}"/>`;
      default:
        return `<circle cx="${x}" cy="${y}" r="5" fill="${INK}"/><circle cx="${x + 1.8}" cy="${y - 1.8}" r="1.8" fill="#FFFFFF"/>`;
    }
  };
  switch (s.eyes) {
    case 'visor':
      return `<rect x="24" y="${y - 10}" width="52" height="20" rx="10" fill="#0F172A"/><rect x="31" y="${y - 4}" width="13" height="8" rx="4" fill="#22D3EE"/><rect x="56" y="${y - 4}" width="13" height="8" rx="4" fill="#22D3EE"/><rect x="30" y="${y - 8}" width="20" height="2" rx="1" fill="#FFFFFF" opacity=".35"/>`;
    case 'cyclops':
      return `<circle cx="50" cy="${y - 2}" r="13" fill="#FFFFFF" stroke="${INK}" stroke-width="1.5"/><circle cx="51" cy="${y - 1}" r="7" fill="${INK}"/><circle cx="54" cy="${y - 5}" r="3" fill="#FFFFFF"/>`;
    case 'wink':
      return eye(38, 'dot') + eye(62, 'happy');
    default:
      return eye(38, s.eyes) + eye(62, s.eyes);
  }
}

// ---------- MIỆNG ----------
function mouthLayer(s) {
  const y = s.mouthY || 70;
  switch (s.mouth) {
    case 'none': return '';
    case 'cat': return `<path d="M42 ${y} Q46 ${y + 5} 50 ${y} Q54 ${y + 5} 58 ${y}" stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"/>`;
    case 'open': return `<path d="M42 ${y - 2} Q50 ${y + 12} 58 ${y - 2} Z" fill="#7F1D1D"/><ellipse cx="50" cy="${y + 5}" rx="4.5" ry="3" fill="#FB7185"/>`;
    case 'beak': return `<path d="M43 ${y - 7} L57 ${y - 7} L50 ${y + 3} Z" fill="#F59E0B" stroke="#D97706" stroke-width="1.2" stroke-linejoin="round"/>`;
    case 'fang': return `<path d="M42 ${y} Q50 ${y + 7} 58 ${y}" stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M44.5 ${y + 1.5} L46.5 ${y + 7} L48.5 ${y + 3} Z" fill="#FFFFFF"/><path d="M55.5 ${y + 1.5} L53.5 ${y + 7} L51.5 ${y + 3} Z" fill="#FFFFFF"/>`;
    case 'tongue': return `<path d="M42 ${y} Q50 ${y + 7} 58 ${y}" stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M46.5 ${y + 3.5} Q50 ${y + 12} 53.5 ${y + 3.5} Z" fill="#FB7185"/>`;
    case 'grin': return `<path d="M38 ${y - 3} Q50 ${y + 14} 62 ${y - 3} Z" fill="${INK}"/><path d="M40 ${y - 2.5} L60 ${y - 2.5} L58 ${y + 2} L42 ${y + 2} Z" fill="#FFFFFF"/>`;
    case 'sharkGrin': return `<path d="M36 ${y - 3} Q50 ${y + 14} 64 ${y - 3} Z" fill="${INK}"/><path d="M38 ${y - 2.5} L41 ${y + 3} L44 ${y - 1} L47 ${y + 3} L50 ${y - 1} L53 ${y + 3} L56 ${y - 1} L59 ${y + 3} L62 ${y - 2.5} Z" fill="#FFFFFF"/>`;
    case 'smileWide': return `<path d="M36 ${y - 2} Q50 ${y + 12} 64 ${y - 2}" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" fill="none"/>`;
    case 'robot': return `<rect x="38" y="${y - 3}" width="24" height="8" rx="2" fill="#0F172A"/><path d="M44 ${y - 3} V${y + 5} M50 ${y - 3} V${y + 5} M56 ${y - 3} V${y + 5}" stroke="#22D3EE" stroke-width="1.5"/>`;
    case 'o': return `<ellipse cx="50" cy="${y + 1}" rx="4" ry="5" fill="${INK}"/>`;
    default: return `<path d="M43 ${y} Q50 ${y + 7} 57 ${y}" stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"/>`;
  }
}

// ---------- PHỤ KIỆN (lớp trên cùng) ----------
function accLayer(s, body) {
  const y = s.eyeY || 54;
  const out = [];
  if (s.ears === 'unicorn') {
    out.push(`<path d="M50 2 L43 30 L57 30 Z" fill="#FDE68A" stroke="#F59E0B" stroke-width="1.5" stroke-linejoin="round"/><path d="M45.5 22 L54.5 19 M46.5 14 L53 12" stroke="#F59E0B" stroke-width="1.5"/>`);
  }
  if (s.ears === 'tuft') {
    out.push(`<path d="M50 28 Q42 12 48 6 Q51 16 55 8 Q60 20 50 28 Z" fill="${shade(body, -0.12)}"/>`);
  }
  if (s.cheeks) {
    out.push(`<ellipse cx="27" cy="${y + 11}" rx="6" ry="3.5" fill="#FB7185" opacity=".5"/><ellipse cx="73" cy="${y + 11}" rx="6" ry="3.5" fill="#FB7185" opacity=".5"/>`);
  }
  switch (s.acc) {
    case 'crown':
      out.push(`<path d="M33 30 L35 11 L43 21 L50 7 L57 21 L65 11 L67 30 Z" fill="#FACC15" stroke="#CA8A04" stroke-width="1.5" stroke-linejoin="round"/>`);
      out.push(`<circle cx="50" cy="23" r="2.8" fill="#EF4444"/><circle cx="40" cy="26" r="2" fill="#3B82F6"/><circle cx="60" cy="26" r="2" fill="#10B981"/>`);
      break;
    case 'wizard':
      out.push(`<path d="M24 34 L54 0 L76 34 Z" fill="#6D28D9"/><ellipse cx="50" cy="34" rx="31" ry="6" fill="#5B21B6"/>`);
      out.push(star(52, 18, 5, '#FDE047'));
      out.push(`<circle cx="40" cy="26" r="1.5" fill="#FDE047"/><circle cx="62" cy="28" r="1.5" fill="#FDE047"/>`);
      break;
    case 'glasses':
      out.push(`<circle cx="38" cy="${y}" r="10" fill="#FFFFFF" fill-opacity=".15" stroke="${INK}" stroke-width="2.5"/><circle cx="62" cy="${y}" r="10" fill="#FFFFFF" fill-opacity=".15" stroke="${INK}" stroke-width="2.5"/><path d="M48 ${y} L52 ${y}" stroke="${INK}" stroke-width="2.5"/>`);
      break;
    case 'sunglasses':
      out.push(`<path d="M25 ${y - 6} L48 ${y - 6} L46 ${y + 4} Q37 ${y + 9} 29 ${y + 4} Z" fill="#111827"/><path d="M75 ${y - 6} L52 ${y - 6} L54 ${y + 4} Q63 ${y + 9} 71 ${y + 4} Z" fill="#111827"/><path d="M48 ${y - 5} L52 ${y - 5}" stroke="#111827" stroke-width="3"/><path d="M30 ${y - 3} L36 ${y - 3}" stroke="#FFFFFF" stroke-width="2" opacity=".6"/>`);
      break;
    case 'headphones':
      out.push(`<path d="M18 58 Q16 18 50 18 Q84 18 82 58" stroke="#334155" stroke-width="5" fill="none"/>`);
      out.push(`<rect x="9" y="48" width="13" height="22" rx="6" fill="#EC4899" stroke="#9D174D" stroke-width="1.5"/><rect x="78" y="48" width="13" height="22" rx="6" fill="#EC4899" stroke="#9D174D" stroke-width="1.5"/>`);
      break;
    case 'bow':
      out.push(`<path d="M68 27 L57 19 L57 35 Z" fill="#EC4899"/><path d="M68 27 L79 19 L79 35 Z" fill="#EC4899"/><circle cx="68" cy="27" r="3.5" fill="#BE185D"/>`);
      break;
    case 'halo':
      out.push(`<ellipse cx="50" cy="13" rx="18" ry="5" fill="none" stroke="#FACC15" stroke-width="4"/>`);
      break;
    case 'helmet':
      out.push(`<circle cx="50" cy="56" r="42" fill="#BAE6FD" fill-opacity=".22" stroke="#E2E8F0" stroke-width="4"/><path d="M22 40 Q28 22 46 16" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" fill="none" opacity=".75"/>`);
      out.push(`<line x1="78" y1="22" x2="86" y2="10" stroke="#E2E8F0" stroke-width="3"/><circle cx="86" cy="9" r="3.5" fill="#F43F5E"/>`);
      break;
    case 'ninjaBand':
      out.push(`<path d="M19 36 Q50 30 81 36 L81 44 Q50 38 19 44 Z" fill="#DC2626"/><path d="M80 38 L95 32 L92 42 Z M80 41 L93 49 L86 52 Z" fill="#DC2626"/><circle cx="50" cy="38" r="3" fill="#FDE047"/>`);
      break;
    case 'scarf':
      out.push(`<path d="M24 80 Q50 92 76 80 L76 88 Q50 100 24 88 Z" fill="#EF4444"/><rect x="62" y="86" width="9" height="12" rx="2" fill="#DC2626"/>`);
      break;
    case 'mushroom':
      out.push(`<path d="M12 46 Q12 6 50 6 Q88 6 88 46 Q50 36 12 46 Z" fill="#EF4444" stroke="#B91C1C" stroke-width="1.5"/>`);
      out.push(`<circle cx="32" cy="24" r="5" fill="#FFFFFF"/><circle cx="56" cy="16" r="6" fill="#FFFFFF"/><circle cx="72" cy="32" r="4" fill="#FFFFFF"/><circle cx="46" cy="34" r="3" fill="#FFFFFF"/>`);
      break;
    case 'stars':
      out.push(star(14, 18, 6, '#FDE047') + star(86, 22, 5, '#FDE047') + star(84, 82, 4, '#FDE047'));
      break;
    case 'ring':
      out.push(`<ellipse cx="50" cy="60" rx="46" ry="10" fill="none" stroke="#FDE68A" stroke-width="5" transform="rotate(-12 50 60)"/>`);
      break;
    default:
      break;
  }
  return out.join('');
}

export function renderAvatarSVG(id, extraAttrs = '') {
  const a = getAvatar(id);
  const s = a.spec || {};
  const body = s.body || '#CBD5E1';
  const dark = shade(body, -0.22);
  const light = shade(body, 0.3);
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" ${extraAttrs} aria-label="${a.name}">
    <ellipse cx="50" cy="95" rx="26" ry="3.5" fill="#000000" opacity=".18"/>
    ${backLayer(s, body, dark, light)}
    ${bodyLayer(s, body, dark)}
    ${patternLayer(s, body, dark, light)}
    ${eyesLayer(s)}
    ${mouthLayer(s)}
    ${accLayer(s, body)}
  </svg>`;
}

/**
 * Trả về HTML khung avatar có nền gradient.
 * @param {string} id
 * @param {string} cls Tailwind class kích thước, ví dụ 'w-12 h-12'
 * @param {object} opts { ring: boolean, bounce: boolean, bare: boolean }
 */
export function renderAvatar(id, cls = 'w-12 h-12', opts = {}) {
  const a = getAvatar(id);
  const [c1, c2] = a.bg || ['#a78bfa', '#4f46e5'];
  const rounded = /rounded/.test(cls) ? '' : 'rounded-2xl';
  if (opts.bare) {
    return `<div class="${cls} shrink-0 flex items-center justify-center">${renderAvatarSVG(id, 'class="w-full h-full"')}</div>`;
  }
  return `<div class="${cls} ${rounded} shrink-0 relative overflow-hidden flex items-center justify-center shadow-sm ${opts.ring ? 'ring-2 ring-white/70' : ''}" style="background:radial-gradient(circle at 30% 25%, ${c1}, ${c2});">
    ${renderAvatarSVG(id, 'class="w-[88%] h-[88%] drop-shadow"')}
  </div>`;
}

export function randomAvatarId() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)].id;
}

/**
 * Sinh chuỗi Data URL SVG cục bộ hoàn toàn cho ảnh đại diện,
 * không cần gửi tên học sinh ra bên ngoài (chống rò rỉ dữ liệu học sinh).
 */
export function getAvatarDataUrl(nameOrId = 'HS', role = 'student') {
  if (nameOrId && typeof nameOrId === 'string' && nameOrId.startsWith('data:image/svg+xml')) {
    return nameOrId;
  }

  const avatarObj = AVATARS.find(a => a.id === nameOrId);
  if (avatarObj) {
    const svgStr = renderAvatarSVG(avatarObj.id);
    return `data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}`;
  }

  const cleanName = String(nameOrId || 'HS').trim();
  const words = cleanName.split(/\s+/).filter(Boolean);
  let initials = 'HS';
  if (words.length >= 2) {
    initials = (words[0][0] + words[words.length - 1][0]).toUpperCase();
  } else if (words.length === 1) {
    initials = words[0].slice(0, 2).toUpperCase();
  }

  let bg = '#3b82f6';
  if (role === 'admin') bg = '#ef4444';
  else if (role === 'teacher') bg = '#8b5cf6';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <rect width="100" height="100" rx="28" fill="${bg}"/>
    <text x="50" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="38" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

if (typeof window !== 'undefined') {
  window.Avatars = { AVATARS, renderAvatar, renderAvatarSVG, getAvatar, randomAvatarId, getAvatarDataUrl };
}

export default { AVATARS, AVATAR_CATEGORIES, RARITY, renderAvatar, renderAvatarSVG, getAvatar, randomAvatarId, getAvatarDataUrl };
