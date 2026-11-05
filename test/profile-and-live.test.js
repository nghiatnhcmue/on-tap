import assert from 'node:assert/strict';

// Mock browser globals
const storageMap = new Map();
global.localStorage = {
  getItem: (k) => storageMap.get(k) ?? null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k)
};

const elements = new Map();
function makeEl(id) {
  const el = {
    id,
    value: '',
    innerHTML: '',
    textContent: '',
    dataset: {},
    className: '',
    classList: {
      classes: new Set(['hidden']),
      add(...cls) { cls.forEach(c => this.classes.add(c)); },
      remove(...cls) { cls.forEach(c => this.classes.delete(c)); },
      contains(c) { return this.classes.has(c); }
    },
    style: {
      props: new Map(),
      setProperty(k, v) { this.props.set(k, v); },
      removeProperty(k) { this.props.delete(k); },
      getPropertyValue(k) { return this.props.get(k) || ''; }
    },
    focus() {},
    onchange: null
  };
  elements.set(id, el);
  return el;
}

['modal-required-profile', 'profile-email-display', 'profile-input-fullname', 'profile-input-school', 'profile-input-school-custom', 'profile-input-grade', 'profile-input-class', 'profile-input-class-custom'].forEach(makeEl);

global.document = {
  getElementById: (id) => elements.get(id) || null,
  querySelectorAll: () => [],
  documentElement: { classList: { add() {}, remove() {}, contains() { return true; } } }
};
global.window = {
  location: { origin: 'https://on-tap.nghiaedu.workers.dev', pathname: '/' },
  dispatchEvent: () => {},
  addEventListener: () => {}
};
global.CustomEvent = class { constructor(name, opts) { this.type = name; this.detail = opts?.detail; } };
global.fetch = async () => ({ ok: true, json: async () => ({}) });

const { Auth } = await import('../js/auth.js');
const { Storage } = await import('../js/storage.js');
const { LiveVideo } = await import('../js/live-video.js');

console.log('=== TEST 1: CẬP NHẬT LỚP & TRƯỜNG CỦA HỌC SINH ===');
Auth.saveUser({
  uid: 'hs_01',
  email: 'hocsinh@tinhoc.edu.vn',
  fullName: 'Nguyễn Văn An',
  school: 'TT GDNN GDTX Chu Văn An',
  grade: '12',
  className: '12A1',
  role: 'student'
});

// Giả lập modal từng bị đóng bằng display: none !important khi login
const modal = document.getElementById('modal-required-profile');
modal.classList.add('hidden');
modal.style.setProperty('display', 'none', 'important');

// Học sinh bấm nút "Cập nhật Họ tên, Lớp, Trường"
Auth.openRequiredProfileModal();
assert.equal(Auth.isEditingProfile, true, 'isEditingProfile phải bật = true');
assert.equal(modal.classList.contains('hidden'), false, 'Modal phải gỡ class hidden');
assert.equal(modal.style.getPropertyValue('display'), 'flex', 'Modal phải đặt display: flex để hiển thị');

const schoolSel = document.getElementById('profile-input-school');
const gradeSel = document.getElementById('profile-input-grade');
const classSel = document.getElementById('profile-input-class');

// Kiểm tra đổi trường sang EMASI -> tự động chọn lớp của EMASI (không bị nhảy sang __other__)
schoolSel.value = 'EMASI';
schoolSel.onchange();
assert.equal(classSel.value, '12E', 'Khi đổi sang EMASI Khối 12, lớp mặc định phải là 12E');

// Kiểm tra đổi khối sang Khối 10 -> tự động chọn lớp 10E của EMASI
gradeSel.value = '10';
gradeSel.onchange();
assert.equal(classSel.value, '10E', 'Khi đổi sang Khối 10 EMASI, lớp mặc định phải là 10E');

// Học sinh chọn lớp 10I1 và lưu cập nhật
classSel.value = '10I1';
classSel.onchange();

Auth.updateProfile({
  fullName: 'Nguyễn Văn An',
  school: schoolSel.value,
  grade: gradeSel.value,
  className: classSel.value
});
Auth.closeRequiredProfileModal();

const updatedUser = Auth.getCurrentUser();
assert.equal(updatedUser.school, 'EMASI');
assert.equal(updatedUser.grade, '10');
assert.equal(updatedUser.className, '10I1');
assert.ok(updatedUser.profileUpdatedAt, 'Phải lưu dấu thời gian profileUpdatedAt');

const savedInList = Storage.getAccountsList().find(a => a.email === 'hocsinh@tinhoc.edu.vn');
assert.equal(savedInList.school, 'EMASI');
assert.equal(savedInList.className, '10I1');
console.log('  ✔ Cập nhật Trường, Khối, Lớp của học sinh hoạt động chính xác 100%!');

console.log('=== TEST 2: THỐNG KÊ TỪNG MỐC & TÍCH LŨY PHÒNG LIVE VIDEO ===');
const mockRemote = {
  roomId: 'LIVE-892',
  totalQuestions: 2,
  checkpoints: [
    { index: 0, sec: 30, question: 'Câu 1: AI là gì?', answer: 'A' },
    { index: 1, sec: 90, question: 'Câu 2: Học máy là gì?', answer: 'B' }
  ],
  students: {
    s1: { uid: 's1', name: 'An', className: '10I1', school: 'EMASI', queueOrder: 1, queueStatus: 'admitted' },
    s2: { uid: 's2', name: 'Bình', className: '10I1', school: 'EMASI', queueOrder: 2, queueStatus: 'admitted' }
  },
  responses: {
    0: {
      s1: { uid: 's1', selected: 'A', isCorrect: true, pointsEarned: 180 },
      s2: { uid: 's2', selected: 'C', isCorrect: false, pointsEarned: 0 }
    },
    1: {
      s1: { uid: 's1', selected: 'B', isCorrect: true, pointsEarned: 190 },
      s2: { uid: 's2', selected: 'B', isCorrect: true, pointsEarned: 170 }
    }
  }
};

const statsM1 = LiveVideo.computeMilestoneStats(mockRemote, 0);
assert.equal(statsM1.currentMilestone.accuracyPct, 50, 'Mốc 1 tỷ lệ đúng 50%');
assert.equal(statsM1.overallAccuracyPct, 50, 'Tích lũy đến Mốc 1 là 50%');
assert.equal(statsM1.rankedStudents[0].name, 'An');
assert.equal(statsM1.rankedStudents[0].scoreUpToNow, 180);

const statsM2 = LiveVideo.computeMilestoneStats(mockRemote, 1);
assert.equal(statsM2.currentMilestone.accuracyPct, 100, 'Mốc 2 tỷ lệ đúng 100%');
assert.equal(statsM2.overallAccuracyPct, 75, 'Tích lũy toàn bộ từ Mốc 1 -> Mốc 2 là 75%');
assert.equal(statsM2.rankedStudents[0].name, 'An');
assert.equal(statsM2.rankedStudents[0].scoreUpToNow, 370);
assert.equal(statsM2.rankedStudents[1].name, 'Bình');
assert.equal(statsM2.rankedStudents[1].scoreUpToNow, 170);
console.log('  ✔ Thống kê tại mỗi mốc, tích lũy đến mốc đó và xuất bảng xếp hạng chính xác 100%!');
