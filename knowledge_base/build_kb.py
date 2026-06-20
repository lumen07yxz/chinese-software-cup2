"""构建课程知识库 —— 将 raw 目录下的 Markdown 文档分块并导入 ChromaDB"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.chdir(os.path.join(os.path.dirname(__file__), '..', 'backend'))

import time
import logging
logging.basicConfig(level=logging.WARNING, stream=sys.stdout)

from services.embedding_service import embedding_service


def build_knowledge_base():
    import chromadb
    from chromadb.config import Settings

    client = chromadb.PersistentClient(
        path="data/chroma",
        settings=Settings(anonymized_telemetry=False),
    )

    raw_dir = os.path.join(os.path.dirname(__file__), 'raw')
    chapters = sorted([f for f in os.listdir(raw_dir) if f.endswith('.md')])

    all_ids = []
    all_texts = []
    all_metadatas = []

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

            all_ids.append(f'ch{len(all_ids):04d}')
            all_texts.append(section_content[:8000])
            all_metadatas.append({
                'chapter': chapter_title,
                'section': section_title,
                'file': ch_file,
            })

    if not all_texts:
        print('No documents found')
        return

    # 获取或创建集合（保持同一个 UUID，避免跨进程 segment 索引不一致）
    try:
        coll = client.get_collection("ai_intro_course")
        # 清空已有数据
        all_existing_ids = coll.get(limit=99999)["ids"]
        if all_existing_ids:
            coll.delete(ids=all_existing_ids)
            print(f"Cleared {len(all_existing_ids)} existing chunks")
    except Exception:
        coll = client.create_collection(
            name="ai_intro_course",
            metadata={"hnsw:space": "cosine"},
        )
    print(f"Collection ready. Total: {len(all_texts)} chunks to add")

    # 分批处理，每批计算 embedding 后添加
    BATCH = 10
    t0 = time.time()
    for start in range(0, len(all_ids), BATCH):
        end = start + BATCH
        batch_ids = all_ids[start:end]
        batch_texts = all_texts[start:end]
        batch_metas = all_metadatas[start:end]

        embeds = embedding_service.embed_batch(batch_texts)
        coll.add(
            ids=batch_ids,
            documents=batch_texts,
            metadatas=batch_metas,
            embeddings=embeds,
        )
        print(f"  [{end}/{len(all_ids)}] {time.time()-t0:.1f}s")

    elapsed = time.time() - t0
    print(f"Done adding in {elapsed:.1f}s")

    # 关键步骤：force 一次查询来触发 HNSW 索引构建和持久化
    print("Forcing HNSW index persistence via query...")
    _ = coll.query(
        query_embeddings=[[0.0] * len(embeds[0])],
        n_results=1,
    )

    # 再用 get 触发 metadata segment 持久化
    _ = coll.get(limit=1)

    print(f"Index persisted. Collection count: {coll.count()}")

    # 验证：关闭 client 重新打开
    client.clear_system_cache()
    c2 = chromadb.PersistentClient(
        path="data/chroma",
        settings=Settings(anonymized_telemetry=False),
    )
    col2 = c2.get_collection("ai_intro_course")
    cnt2 = col2.count()
    print(f"New connection verify: {cnt2} chunks")

    if cnt2 > 0:
        from collections import Counter
        data = col2.get(include=["metadatas"])
        chs = Counter(m["chapter"] for m in data["metadatas"])
        print("Chapter distribution:")
        for ch, n in sorted(chs.items()):
            print(f"  {ch}: {n}")

        # 搜索测试
        q_emb = embedding_service.embed("Transformer 自注意力机制")
        results = col2.query(
            query_embeddings=[q_emb],
            n_results=3,
            include=["documents", "metadatas", "distances"],
        )
        print()
        print("Search test 'Transformer 自注意力机制':")
        for i, doc_id in enumerate(results["ids"][0]):
            meta = results["metadatas"][0][i]
            d = results["distances"][0][i]
            doc = results["documents"][0][i][:120]
            print(f"  [{meta['chapter']}] (dist={d:.3f}) {doc}")


if __name__ == '__main__':
    build_knowledge_base()
