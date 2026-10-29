# -*- coding: utf-8 -*-
"""
Script chuyển đổi dữ liệu từ 'Ngan Hang de.xlsx' sang định dạng JSON tối ưu hóa cho web
Tách theo Khối 10, Khối 11, Khối 12 và tạo manifest.json tổng hợp metadata.
"""

import os
import sys
import json
import openpyxl

def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    excel_path = os.path.join(os.path.dirname(__file__), 'Ngan Hang de.xlsx')
    if not os.path.exists(excel_path):
        print(f"Error: {excel_path} does not exist.")
        sys.exit(1)

    print("Đang đọc file Excel:", excel_path)
    wb = openpyxl.load_workbook(excel_path, read_only=True)
    ws = wb.active

    data_dir = os.path.join(os.path.dirname(__file__), 'data')
    os.makedirs(data_dir, exist_ok=True)

    grades_data = {'10': [], '11': [], '12': []}
    manifest = {
        'total_questions': 0,
        'grades': {
            '10': {'name': 'Tin học Lớp 10', 'total': 0, 'levels': {}, 'topics': {}},
            '11': {'name': 'Tin học Lớp 11', 'total': 0, 'levels': {}, 'topics': {}},
            '12': {'name': 'Tin học Lớp 12', 'total': 0, 'levels': {}, 'topics': {}}
        }
    }

    seen_dedup = set()

    # Đọc các hàng
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        
        stt = row[0]
        topic = str(row[1]).strip() if row[1] else 'Chủ đề chung'
        lesson = str(row[2]).strip() if row[2] else 'Bài học chung'
        q_text = str(row[3]).strip() if row[3] else ''
        
        if not q_text:
            continue
        
        opt_a = str(row[4]).strip() if row[4] is not None else ''
        opt_b = str(row[5]).strip() if row[5] is not None else ''
        opt_c = str(row[6]).strip() if row[6] is not None else ''
        opt_d = str(row[7]).strip() if row[7] is not None else ''
        level = str(row[8]).strip() if row[8] else '1'
        note = str(row[9]).strip() if row[9] is not None else ''
        grade = str(row[11]).strip() if row[11] else '10'
        video = str(row[13]).strip() if row[13] else ''

        v_stop = None
        if len(row) > 14 and row[14] is not None and str(row[14]).strip():
            try:
                v_stop = int(float(str(row[14]).strip()))
            except:
                v_stop = str(row[14]).strip()

        v_quiz = None
        if len(row) > 15 and row[15] is not None and str(row[15]).strip():
            v_quiz = str(row[15]).strip()

        v_time = 15
        if len(row) > 16 and row[16] is not None and str(row[16]).strip():
            try:
                v_time = int(float(str(row[16]).strip()))
            except:
                v_time = 15

        # CHỈ GIỮ LẠI DẠNG TRẮC NGHIỆM (1, 2, 3, 4) VÀ ĐÚNG/SAI (DS) - LOẠI BỎ TRẢ LỜI NGẮN (TLN)
        if level not in ['1', '2', '3', '4', 'DS']:
            continue

        # Xử lý các trường hợp đặc biệt phát hiện trong dữ liệu gốc
        if i + 1 == 1230 and not opt_a:
            opt_a = '"" (Hai dấu ngoặc kép liền nhau)'
        elif i + 1 == 1328 and not opt_a:
            opt_a = 'None'
        elif i + 1 == 1385:
            if not opt_a or opt_a == 'True':
                opt_a = '1'
            if not opt_c:
                opt_c = '0'
        elif i + 1 == 1386:
            if not opt_c:
                opt_c = '0'

        # Sửa các lỗi cụ thể trong dữ liệu gốc
        if stt == 184 or (grade == '10' and 'Phép nhân cơ bản 1 * 0' in q_text):
            opt_d = 'Bằng giá trị 11.'
        elif stt == 777 or (grade == '10' and 'print("Python")' in q_text and 'xuất ra' in q_text):
            opt_a = 'Python'
            opt_b = 'print("Python")'
            opt_c = '"Python"'
            opt_d = 'Lỗi cú pháp'
        elif stt == 856 or (grade == '10' and 'print("Tuổi:", 15)' in q_text):
            opt_d = '("Tuổi:", 15)'
        elif stt == 871 or (grade == '10' and 'x = input()' in q_text and 'x * 2' in q_text):
            opt_a = "'55'"
            opt_c = "'10'"
            opt_d = 'Báo lỗi cú pháp'
        elif stt == 904 or (grade == '10' and 'khác nhau' in q_text and 'Python' in q_text):
            opt_d = '=='
        elif stt == 1057 or (grade == '10' and 'chỉ số (index) của phần tử đầu tiên' in q_text):
            opt_d = 'Bắt đầu từ số -1.'
        elif stt == 1112 or (grade == '10' and 'A.clear()' in q_text):
            opt_b = 'None'
            opt_c = '1'
        elif stt == 1156 or (grade == '10' and 'chỉ số (index) của kí tự đầu tiên' in q_text):
            opt_c = 'Bắt đầu từ -1.'
        elif stt == 1158 or (grade == '10' and 'Chỉ số dương của kí tự cuối cùng' in q_text):
            opt_a = 'Là len(s) - 1.'
            opt_d = 'Là len(s) - 2.'
        elif stt == 1201 or (grade == '10' and 'xâu có nằm trong xâu khác' in q_text):
            opt_b = 'not in'
            opt_c = 'has'
        elif stt == 1203 or (grade == '10' and '"A" in "abc"' in q_text):
            opt_a = 'False'
            opt_b = 'True'
            opt_c = 'None'
            opt_d = 'Lỗi cú pháp (SyntaxError)'
        elif stt == 1208 or (grade == '10' and '"tin học".find("tin")' in q_text):
            opt_c = '-1'
            opt_d = 'True'
        elif stt == 1210 or (grade == '10' and 's.find("a", 1)' in q_text):
            opt_d = '-1'
        elif stt == 1217 or (grade == '10' and '"".join(["a", "b", "c"])' in q_text):
            opt_b = 'a b c'
            opt_c = '["a", "b", "c"]'
        elif stt == 1223 or (grade == '10' and 's = "Python", biểu thức s[0]' in q_text):
            opt_a, opt_b, opt_c, opt_d = "'P'", "'p'", "'y'", "'n'"
        elif stt == 1225 or (grade == '10' and 's = "python"' in q_text and 's[1]' in q_text):
            q_text = 'Cho xâu s = "python", phép truy cập s[-1] sẽ lấy ra kí tự nào?'
            opt_a, opt_b, opt_c, opt_d = "'n'", "'p'", "'o'", 'Gây ra lỗi'
        elif stt == 1553 or (grade == '10' and '" ".join(["A", "B"])' in q_text):
            opt_d = '["A", "B"]'
        elif stt == 1598 or (grade == '10' and "int('10') + 5" in q_text):
            opt_b = "'105'"
        elif grade == '11' and "'Sữa'" in q_text and opt_d == '#ERROR!':
            opt_d = "= '%Sữa%'"

        # Xác định đáp án đúng
        correct = ''
        if level in ['1', '2', '3', '4']:
            if note.upper() in ['A', 'B', 'C', 'D']:
                correct = note.upper()
            else:
                correct = 'A' # Mặc định trong các ngân hàng đề chuẩn
        elif level == 'DS':
            # Chuẩn hóa chuỗi như 'Đ,S,Đ,S' hoặc 'Đ,Đ,S,D' (D -> Đ)
            norm_note = note.upper().replace('D', 'Đ').replace(';', ',').replace(' ', '')
            correct = norm_note
        elif level == 'TLN':
            correct = note.strip()

        # Deduplication: Bỏ qua câu hỏi trùng lặp 100% nội dung và phương án
        dedup_key = (grade, q_text.strip().lower(), tuple(str(o).strip().lower() for o in [opt_a, opt_b, opt_c, opt_d]))
        if dedup_key in seen_dedup:
            continue
        seen_dedup.add(dedup_key)

        q_obj = {
            'id': f'q_{grade}_{i}',
            'stt': stt,
            'grade': grade,
            'topic': topic,
            'lesson': lesson,
            'level': level, # '1', '2', '3', '4', 'DS'
            'question': q_text,
            'options': [opt_a, opt_b, opt_c, opt_d] if level in ['1', '2', '3', '4', 'DS'] else [],
            'answer': correct,
            'video': video,
            'video_stop': v_stop,
            'video_quiz': v_quiz,
            'video_time': v_time
        }

        if grade in grades_data:
            grades_data[grade].append(q_obj)
            manifest['total_questions'] += 1
            
            m_grade = manifest['grades'][grade]
            m_grade['total'] += 1
            m_grade['levels'][level] = m_grade['levels'].get(level, 0) + 1

            if 'interactive_videos' not in m_grade:
                m_grade['interactive_videos'] = {}
            if video and v_stop is not None:
                if video not in m_grade['interactive_videos']:
                    m_grade['interactive_videos'][video] = {
                        'video': video,
                        'lesson': lesson,
                        'topic': topic,
                        'checkpoints': []
                    }
                v_entry = m_grade['interactive_videos'][video]
                if v_stop not in v_entry['checkpoints']:
                    v_entry['checkpoints'].append(v_stop)
                    v_entry['checkpoints'].sort()
            
            if topic not in m_grade['topics']:
                m_grade['topics'][topic] = {'name': topic, 'total': 0, 'lessons': {}}
            m_topic = m_grade['topics'][topic]
            m_topic['total'] += 1
            
            if lesson not in m_topic['lessons']:
                m_topic['lessons'][lesson] = {'name': lesson, 'total': 0, 'levels': {}}
            m_lesson = m_topic['lessons'][lesson]
            m_lesson['total'] += 1
            m_lesson['levels'][level] = m_lesson['levels'].get(level, 0) + 1

    # Xuất các file JSON
    print("\n--- KẾT QUẢ XỬ LÝ DỮ LIỆU ---")
    for g, q_list in grades_data.items():
        grade_file = os.path.join(data_dir, f'grade_{g}.json')
        with open(grade_file, 'w', encoding='utf-8') as f:
            json.dump(q_list, f, ensure_ascii=False, indent=2)
        size_kb = os.path.getsize(grade_file) / 1024
        print(f"Khối {g}: {len(q_list)} câu hỏi -> {grade_file} ({size_kb:.1f} KB)")

    manifest_file = os.path.join(data_dir, 'manifest.json')
    with open(manifest_file, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    manifest_kb = os.path.getsize(manifest_file) / 1024
    print(f"Manifest: {manifest['total_questions']} câu hỏi tổng hợp -> {manifest_file} ({manifest_kb:.1f} KB)")
    print("\nChuyển đổi hoàn tất thành công 100%!")

if __name__ == '__main__':
    main()
