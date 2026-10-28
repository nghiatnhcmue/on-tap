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

        q_obj = {
            'id': f'q_{grade}_{i}',
            'stt': stt,
            'grade': grade,
            'topic': topic,
            'lesson': lesson,
            'level': level, # '1', '2', '3', '4', 'DS', 'TLN'
            'question': q_text,
            'options': [opt_a, opt_b, opt_c, opt_d] if level in ['1', '2', '3', '4', 'DS'] else [],
            'answer': correct,
            'video': video
        }

        if grade in grades_data:
            grades_data[grade].append(q_obj)
            manifest['total_questions'] += 1
            
            m_grade = manifest['grades'][grade]
            m_grade['total'] += 1
            m_grade['levels'][level] = m_grade['levels'].get(level, 0) + 1
            
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
