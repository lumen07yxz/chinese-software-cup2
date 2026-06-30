"""修复脚本：重新解析磁盘上的文件，修复数据库中的乱码内容

用法：
    cd backend && python ../scripts/reparse_docs.py

功能：
1. 遍历 user_documents 表中所有文档
2. 如果磁盘上的原始文件存在且格式为 pdf/docx，用正确的解析器重新提取文本
3. 如果是文本文件（md/txt/csv），用 chardet 重新检测编码
4. 更新数据库中的 content 字段
5. 重建 ChromaDB 向量索引
"""

import os
import sys
import sqlite3
import logging

# 确保 backend 目录在 path 中
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(script_dir, "..", "backend")
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from services.document_parser import parse_document

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = "data/user_documents"


def get_all_documents():
    """从 SQLite 读取所有用户文档"""
    conn = sqlite3.connect("app.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.execute(
        "SELECT id, user_id, title, content, file_path, file_format, source_type "
        "FROM user_documents ORDER BY id"
    )
    docs = cursor.fetchall()
    conn.close()
    return docs


def update_document_content(doc_id: int, new_content: str):
    """更新文档的 content 字段"""
    conn = sqlite3.connect("app.db")
    conn.execute(
        "UPDATE user_documents SET content = ? WHERE id = ?",
        (new_content[:100000], doc_id),
    )
    conn.commit()
    conn.close()


def is_garbled(text: str) -> bool:
    """判断文本是否为乱码"""
    if not text:
        return True
    # 检查替换字符
    if text.count('�') > len(text) * 0.01:
        return True
    # 检查是否包含大量不可读控制字符
    sample = text[:2000]
    non_printable = sum(1 for c in sample if ord(c) < 32 and c not in '\n\r\t')
    if non_printable > 50:
        return True
    # 检查是否包含 PK 头（DOCX 二进制被当文本存储）
    if 'PK\x03\x04' in sample or 'PK' == sample[:2]:
        return True
    return False


def main():
    docs = get_all_documents()
    logger.info("共找到 %d 个文档", len(docs))

    fixed = 0
    failed = 0
    skipped = 0

    for doc in docs:
        doc_id = doc["id"]
        title = doc["title"]
        file_path = doc["file_path"]
        file_format = doc["file_format"] or "txt"
        content = doc["content"] or ""
        source_type = doc["source_type"] or "upload"

        # 跳过网页保存的文档（没有磁盘文件）
        if source_type == "web" or not file_path:
            # 但检查网页文档是否有内容
            if not content or len(content.strip()) < 5:
                logger.warning("  [%d] %s — 网页文档无内容，跳过", doc_id, title)
                skipped += 1
            else:
                skipped += 1
            continue

        # 检查磁盘文件是否存在
        if not os.path.exists(file_path):
            logger.warning("  [%d] %s — 磁盘文件不存在: %s", doc_id, title, file_path)
            # 尝试查找同名文件
            basename = os.path.basename(file_path)
            user_dir = os.path.join(DATA_DIR, doc["user_id"])
            alt_path = os.path.join(user_dir, basename)
            if os.path.exists(alt_path):
                file_path = alt_path
                logger.info("  找到替代路径: %s", alt_path)
            else:
                failed += 1
                continue

        # 检查内容是否已经是正常的
        if content and not is_garbled(content) and len(content.strip()) > 50:
            logger.info("  [%d] %s — 内容正常（%d 字），跳过", doc_id, title, len(content))
            skipped += 1
            continue

        # 需要重新解析
        logger.info("  [%d] %s — 格式=%s, 重新解析中...", doc_id, title, file_format)
        try:
            with open(file_path, "rb") as f:
                raw_bytes = f.read()

            new_text = parse_document(raw_bytes, os.path.basename(file_path))

            # 检查解析结果
            if not new_text or len(new_text.strip()) < 5:
                logger.error("  [%d] %s — 解析结果为空", doc_id, title)
                failed += 1
                continue

            if new_text.startswith("[") and "不可用" in new_text:
                logger.error("  [%d] %s — 解析库不可用: %s", doc_id, title, new_text[:100])
                failed += 1
                continue

            old_len = len(content)
            new_len = len(new_text)

            # 更新数据库
            update_document_content(doc_id, new_text)
            fixed += 1

            logger.info(
                "  [%d] %s — 修复成功！%d 字 → %d 字",
                doc_id, title, old_len, new_len,
            )

            # 打印前 200 字预览
            preview = new_text[:200].replace("\n", " ")
            logger.info("  预览: %s...", preview)

        except Exception as e:
            logger.error("  [%d] %s — 解析失败: %s", doc_id, title, e)
            failed += 1

    logger.info("=" * 60)
    logger.info("修复完成: 成功=%d, 失败=%d, 跳过=%d", fixed, failed, skipped)
    logger.info("=" * 60)

    if fixed > 0:
        logger.info("提示：已修复的文档需要重新建立向量索引。")
        logger.info("删除 data/chroma/ 目录后重启后端，或重新导入这些文档。")


if __name__ == "__main__":
    main()
