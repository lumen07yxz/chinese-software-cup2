"""构建课程知识库 —— 将 raw 目录下的 Markdown 文档分块并导入 ChromaDB"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.chdir(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from services.rag_service import rag_service


def build_knowledge_base():
    raw_dir = os.path.join(os.path.dirname(__file__), 'raw')
    chapters = sorted([f for f in os.listdir(raw_dir) if f.endswith('.md')])

    chunk_id = 0
    all_chunks = []

    for ch_file in chapters:
        ch_path = os.path.join(raw_dir, ch_file)
        with open(ch_path, 'r', encoding='utf-8') as f:
            content = f.read()

        sections = content.split('\n## ')
        chapter_title = sections[0].split('\n')[0].replace('# ', '').strip()

        for i, section in enumerate(sections):
            if i == 0:
                section_content = section.split('\n', 1)[1] if '\n' in section else section
                section_title = chapter_title
            else:
                section_content = '## ' + section
                section_title = section.split('\n')[0].replace('##', '').strip()[:80]

            if len(section_content.strip()) < 50:
                continue

            chunk = {
                'id': f'ch{chunk_id:04d}',
                'content': section_content[:2000],
                'metadata': {
                    'chapter': chapter_title,
                    'section': section_title,
                    'file': ch_file,
                }
            }
            all_chunks.append(chunk)
            chunk_id += 1

    if all_chunks:
        # Clear existing collection and re-add
        try:
            rag_service.client.delete_collection("ai_intro_course")
            rag_service.collection = rag_service.client.get_or_create_collection(
                name="ai_intro_course",
                metadata={"hnsw:space": "cosine"},
            )
        except Exception:
            pass
        rag_service.add_documents(all_chunks)
        print(f'Built knowledge base: {len(all_chunks)} chunks from {len(chapters)} chapters')
    else:
        print('No documents found in raw/ directory')


if __name__ == '__main__':
    build_knowledge_base()
