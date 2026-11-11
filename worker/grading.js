/**
 * worker/grading.js
 * Module chấm điểm phía máy chủ (Server-Authoritative Grading) cho TinHocHub
 * Tuân thủ barem quy chế thi Tốt nghiệp THPT 2025 của Bộ Giáo dục & Đào tạo:
 * - Phần I (MCQ): 0.25 điểm / câu (cho đề chuẩn 24 câu = 6.0 điểm)
 * - Phần II (Đúng/Sai): Barem 4 ý: [0, 0.1, 0.25, 0.5, 1.0] (4 câu = 4.0 điểm)
 * - Phần III (Trả lời ngắn): 0.25 điểm / câu
 * - Tổng điểm: Thang 10, làm tròn 2 chữ số thập phân.
 */

import { answerStore } from './data/answer_store.js';

/**
 * Chuẩn hóa chuỗi văn bản cho câu hỏi trả lời ngắn (TLN)
 */
function normalizeShortAnswer(str) {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase().replace(/\s+/g, '').replace(/[,.;:!?'"()]/g, '');
}

/**
 * Chấm điểm toàn diện bài thi một cách độc lập từ kho đáp án máy chủ
 * @param {object} submissionData - Dữ liệu bài nộp từ thí sinh
 * @param {object} options - Tùy chọn (override answerStore, customAnswersMap)
 */
export function gradeSubmission(submissionData, options = {}) {
  const store = options.answerStore || answerStore;
  const customMap = options.customAnswersMap || {};

  const answers = submissionData.answers || {};
  const examConfig = submissionData.examConfig || {};
  const isBgdFormat = (examConfig.type === 'bgd_2025');

  // Lấy danh sách ID câu hỏi cần chấm
  let questionIds = [];
  if (Array.isArray(submissionData.examQuestions) && submissionData.examQuestions.length > 0) {
    questionIds = submissionData.examQuestions.map(q => typeof q === 'string' ? q : q.id);
  } else {
    questionIds = Object.keys(answers);
  }

  const totalQuestions = questionIds.length || 1;
  let totalScore = 0;
  let part1Score = 0;
  let part2Score = 0;
  let correctCount = 0;
  const details = [];

  // Tạo map tra cứu nhanh nếu examQuestions được gửi kèm
  const examQuestionsMap = {};
  if (Array.isArray(submissionData.examQuestions)) {
    submissionData.examQuestions.forEach(q => {
      if (q && q.id) examQuestionsMap[q.id] = q;
    });
  }

  for (const qid of questionIds) {
    // 1. Tìm thông tin đáp án gốc máy chủ
    const qMeta = customMap[qid] || examQuestionsMap[qid] || store[qid] || {};
    const level = String(qMeta.level || '1').trim();
    const userAns = answers[qid] || null;

    let itemScore = 0;
    let isCorrect = false;

    if (['1', '2', '3', '4'].includes(level)) {
      // -------------------------------------------------------------
      // PHẦN I: TRẮC NGHIỆM NHIỀU LỰA CHỌN (MCQ)
      // -------------------------------------------------------------
      const correctAnsLetter = String(qMeta.answer || 'A').trim().toUpperCase();
      let correctAnsText = null;

      if (Array.isArray(qMeta.options) && qMeta.options.length === 4) {
        const correctIdx = ['A', 'B', 'C', 'D'].indexOf(correctAnsLetter);
        if (correctIdx !== -1) {
          correctAnsText = String(qMeta.options[correctIdx] || '').trim();
        }
      }

      // So khớp câu trả lời của thí sinh
      if (userAns) {
        if (userAns.chosenText && correctAnsText) {
          // So khớp nội dung phương án (chống gian lận xáo trộn)
          isCorrect = (String(userAns.chosenText).trim() === correctAnsText);
        } else if (userAns.chosenLetter) {
          // So khớp ký tự lựa chọn
          isCorrect = (String(userAns.chosenLetter).trim().toUpperCase() === correctAnsLetter);
        } else if (userAns.chosen) {
          // Tương thích với client cũ
          const chosenVal = String(userAns.chosen).trim();
          isCorrect = (chosenVal.toUpperCase() === correctAnsLetter || (correctAnsText && chosenVal === correctAnsText));
        }
      }

      if (isCorrect) {
        correctCount++;
        itemScore = isBgdFormat ? 0.25 : (10 / totalQuestions);
      }
      part1Score += itemScore;

      details.push({
        questionId: qid,
        level,
        isCorrect,
        score: Math.round(itemScore * 1000) / 1000,
        userChoice: userAns?.chosenLetter || userAns?.chosenText || userAns?.chosen || null,
        correctAnswer: correctAnsLetter
      });

    } else if (level === 'DS') {
      // -------------------------------------------------------------
      // PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI (DS)
      // Barem chuẩn Bộ GD&ĐT: [0, 0.1, 0.25, 0.5, 1.0]
      // -------------------------------------------------------------
      const rawAns = qMeta.answer || 'Đ,Đ,Đ,Đ';
      const correctParts = rawAns.split(',').map(p => p.trim().toUpperCase());
      const userChoices = (userAns && Array.isArray(userAns.choices))
        ? userAns.choices.map(c => c ? String(c).trim().toUpperCase() : '')
        : ['', '', '', ''];

      let correctSub = 0;
      const subDetails = [];

      for (let i = 0; i < 4; i++) {
        const expected = correctParts[i] || 'Đ';
        const actual = userChoices[i] || '';
        const isSubCorrect = (actual === expected);
        if (isSubCorrect) correctSub++;

        subDetails.push({
          index: i,
          userChoice: actual,
          correctPart: expected,
          isCorrect: isSubCorrect
        });
      }

      const pointMap = [0, 0.1, 0.25, 0.5, 1.0];
      itemScore = pointMap[correctSub] || 0;
      isCorrect = (correctSub === 4);
      if (correctSub >= 2) correctCount += (correctSub / 4);

      part2Score += itemScore;

      details.push({
        questionId: qid,
        level: 'DS',
        isCorrect,
        score: itemScore,
        correctSub,
        userChoices,
        correctParts,
        subDetails
      });

    } else if (level === 'TLN') {
      // -------------------------------------------------------------
      // PHẦN III: TRẢ LỜI NGẮN (TLN)
      // -------------------------------------------------------------
      const userInput = (userAns && (userAns.userInput || userAns.input)) ? String(userAns.userInput || userAns.input) : '';
      const expectedAns = String(qMeta.answer || '');

      const normUser = normalizeShortAnswer(userInput);
      const normExp = normalizeShortAnswer(expectedAns);

      if (normUser && normUser === normExp) {
        isCorrect = true;
        correctCount++;
        itemScore = isBgdFormat ? 0.25 : (10 / totalQuestions);
      }

      details.push({
        questionId: qid,
        level: 'TLN',
        isCorrect,
        score: Math.round(itemScore * 1000) / 1000,
        userInput,
        correctAnswer: expectedAns
      });
    }

    totalScore += itemScore;
  }

  // Làm tròn điểm số tối đa 10.0, 2 chữ số thập phân
  const rawScore = Math.min(10, Math.max(0, Math.round(totalScore * 100) / 100));

  // Kiểm tra xử lý gian lận / đình chỉ thi từ giám sát Proctor
  const proctor = submissionData.proctor || {};
  const isDisqualified = Boolean(proctor.isDisqualified || submissionData.isDisqualified);
  const finalScore = isDisqualified ? 0.0 : rawScore;

  return {
    score: finalScore,
    rawScore,
    part1Score: Math.round(part1Score * 100) / 100,
    part2Score: Math.round(part2Score * 100) / 100,
    totalQuestions,
    correctCount: Math.round(correctCount),
    isDisqualified,
    disqualifiedReason: proctor.disqualifiedReason || submissionData.disqualifiedReason || '',
    violationCount: proctor.violationCount || submissionData.violationCount || 0,
    violationLogs: proctor.violationLogs || submissionData.violationLogs || [],
    details
  };
}
