#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TinHocHub - Archive.org S3 Batch Uploader CLI
Công cụ dòng lệnh hỗ trợ Quản Trị Viên (Admin) tải hàng loạt 93 video bài giảng
lên Archive.org lưu trữ miễn phí vĩnh viễn, tốc độ cao, hỗ trợ resume tiếp tục.
"""

import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.error
from pathlib import Path

MANIFEST_PATH = Path(__file__).parent / 'data' / 'manifest.json'

def load_manifest_videos():
    if not MANIFEST_PATH.exists():
        print(f"❌ Không tìm thấy file manifest tại {MANIFEST_PATH}")
        sys.exit(1)
    
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    
    videos = []
    for grade in ['10', '11', '12']:
        grade_vids = manifest.get('grades', {}).get(grade, {}).get('interactive_videos', {})
        for vname, vdata in grade_vids.items():
            videos.append({
                'grade': grade,
                'video': vname,
                'lesson': vdata.get('lesson', ''),
                'topic': vdata.get('topic', ''),
                'checkpoints': vdata.get('checkpoints', [])
            })
    return videos

def get_existing_archive_files(identifier):
    url = f"https://archive.org/metadata/{identifier}/files"
    req = urllib.request.Request(url, headers={'User-Agent': 'TinHocHub-CLI/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            if res.status == 200:
                data = json.loads(res.read().decode('utf-8'))
                result = data.get('result', [])
                return set(f.get('name', '').lower() for f in result)
    except Exception:
        pass
    return set()

class ProgressUpload(object):
    def __init__(self, file_path, total_size):
        self.file_path = file_path
        self.total_size = total_size
        self.uploaded = 0
        self.start_time = time.time()
        self.file_obj = open(file_path, 'rb')

    def read(self, size):
        chunk = self.file_obj.read(size)
        if chunk:
            self.uploaded += len(chunk)
            self._print_progress()
        return chunk

    def _print_progress(self):
        elapsed = time.time() - self.start_time
        speed = self.uploaded / elapsed if elapsed > 0 else 0
        speed_mb = speed / (1024 * 1024)
        pct = (self.uploaded / self.total_size) * 100 if self.total_size > 0 else 0
        cur_mb = self.uploaded / (1024 * 1024)
        tot_mb = self.total_size / (1024 * 1024)
        bar_len = 30
        filled = int(bar_len * pct / 100)
        bar = '█' * filled + '-' * (bar_len - filled)
        sys.stdout.write(f"\r  [{bar}] {pct:5.1f}% | {cur_mb:6.1f}/{tot_mb:6.1f} MB | {speed_mb:4.1f} MB/s")
        sys.stdout.flush()

    def close(self):
        self.file_obj.close()

def upload_file_to_archive(file_path, target_filename, identifier, access_key, secret_key, lesson_name=''):
    url = f"https://s3.us.archive.org/{identifier}/{target_filename}"
    file_size = os.path.getsize(file_path)
    
    headers = {
        'Authorization': f'LOW {access_key}:{secret_key}',
        'x-amz-auto-make-bucket': '1',
        'x-archive-meta-mediatype': 'movies',
        'x-archive-meta-collection': 'opensource_movies',
        'x-archive-meta-title': f'Bài giảng Tin học THPT - {lesson_name or target_filename}',
        'x-archive-ignore-preexisting-bucket': '1',
        'Content-Type': 'video/mp4',
        'Content-Length': str(file_size)
    }

    progress_reader = ProgressUpload(file_path, file_size)
    req = urllib.request.Request(url, data=progress_reader, headers=headers, method='PUT')
    
    try:
        with urllib.request.urlopen(req, timeout=3600) as response:
            sys.stdout.write("\n")
            if 200 <= response.status < 300:
                return True, f"https://archive.org/download/{identifier}/{target_filename}"
            else:
                return False, f"Mã HTTP {response.status}: {response.reason}"
    except urllib.error.HTTPError as e:
        sys.stdout.write("\n")
        return False, f"HTTP Error {e.code}: {e.read().decode('utf-8', errors='ignore')}"
    except Exception as e:
        sys.stdout.write("\n")
        return False, str(e)
    finally:
        progress_reader.close()

def main():
    parser = argparse.ArgumentParser(description="TinHocHub - Tải hàng loạt video bài giảng lên Archive.org S3")
    parser.add_argument('--folder', type=str, required=True, help="Đường dẫn thư mục chứa video trên máy tính")
    parser.add_argument('--access-key', type=str, required=True, help="Archive.org S3 Access Key")
    parser.add_argument('--secret-key', type=str, required=True, help="Archive.org S3 Secret Key")
    parser.add_argument('--identifier', type=str, default='tinhoc-hub-thpt', help="Archive.org Item ID (Mặc định: tinhoc-hub-thpt)")
    parser.add_argument('--force', action='store_true', help="Bắt buộc upload lại kể cả khi file đã có trên Archive.org")

    args = parser.parse_args()

    folder_path = Path(args.folder)
    if not folder_path.exists() or not folder_path.is_dir():
        print(f"❌ Thư mục không tồn tại: {args.folder}")
        sys.exit(1)

    print("=" * 70)
    print("🎬 TINHOCHUB - BATCH ARCHIVE.ORG VIDEO S3 UPLOADER")
    print(f"📂 Thư mục nguồn : {folder_path.resolve()}")
    print(f"📦 Item Bucket   : {args.identifier}")
    print(f"🔗 Direct URL    : https://archive.org/download/{args.identifier}/")
    print("=" * 70)

    # 1. Đọc danh sách 93 video từ manifest
    target_videos = load_manifest_videos()
    print(f"📋 Tổng số video chuẩn theo ngân hàng đề: {len(target_videos)} video")

    # 2. Quét các file video trong thư mục local
    local_files = {}
    for p in folder_path.rglob('*'):
        if p.is_file() and p.suffix.lower() == '.mp4':
            local_files[p.name.lower()] = p

    print(f"🔎 Đã tìm thấy {len(local_files)} file .mp4 trong thư mục máy tính")

    # 3. Khớp file local với 93 video chuẩn
    matched = []
    missing = []
    for item in target_videos:
        v_lower = item['video'].lower()
        if v_lower in local_files:
            matched.append((item, local_files[v_lower]))
        else:
            missing.append(item)

    print(f"✅ Đã ghép khớp thành công: {len(matched)} / {len(target_videos)} video")
    if missing:
        print(f"⚠️ Còn thiếu {len(missing)} video chưa thấy trong thư mục:")
        for m in missing[:5]:
            print(f"   - Khối {m['grade']} | {m['video']} ({m['lesson']})")
        if len(missing) > 5:
            print(f"   ... và {len(missing) - 5} video khác.")

    if not matched:
        print("❌ Không có file video nào khớp tên với ngân hàng đề để tải lên!")
        sys.exit(1)

    # 4. Kiểm tra các file đã tồn tại trên Archive.org
    print(f"\n📡 Đang kiểm tra danh sách file đã có trên Archive.org ({args.identifier})...")
    existing_files = set() if args.force else get_existing_archive_files(args.identifier)
    print(f"ℹ️ Đã có {len(existing_files)} file trên Archive.org")

    # 5. Bắt đầu tải lên
    success_count = 0
    skip_count = 0
    fail_count = 0

    print("\n🚀 BẮT ĐẦU QUÁ TRÌNH TẢI LÊN:")
    for i, (item, file_path) in enumerate(matched, 1):
        target_name = item['video']
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)

        if not args.force and target_name.lower() in existing_files:
            print(f"[{i}/{len(matched)}] ⏭️ BỎ QUA (ĐÃ CÓ): {target_name} ({item['lesson']})")
            skip_count += 1
            continue

        print(f"[{i}/{len(matched)}] 📤 TẢI LÊN: {target_name} ({file_size_mb:.1f} MB) | Khối {item['grade']} - {item['lesson']}")
        success, msg = upload_file_to_archive(
            file_path=file_path,
            target_filename=target_name,
            identifier=args.identifier,
            access_key=args.access_key,
            secret_key=args.secret_key,
            lesson_name=item['lesson']
        )

        if success:
            print(f"   ✅ Thành công! Link trực tiếp: {msg}")
            success_count += 1
        else:
            print(f"   ❌ Thất bại: {msg}")
            fail_count += 1

        time.sleep(1) # Khoảng nghỉ chống quá tải

    print("\n" + "=" * 70)
    print("🏁 HOÀN TẤT TIẾN TRÌNH:")
    print(f" - Thành công : {success_count} video")
    print(f" - Bỏ qua     : {skip_count} video (đã có từ trước)")
    print(f" - Thất bại   : {fail_count} video")
    print(f" - Base URL   : https://archive.org/download/{args.identifier}/")
    print("=" * 70)

if __name__ == '__main__':
    main()
