# listSearchBridge.py
import sys
import os
import json
import re
from pypinyin import slug, Style  # 需要安装 pypinyin 库
import io

# 强制标准流编码
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from util import get_list_data, db, process_list_documents
from WeiBoCrawler.database import BodyRecord


# 自动生成安全集合名称
# 修改后（MongoDB 集合名风格）
# 列表搜索.py（更新集合名称生成和调用）
def generate_safe_collection_name(search_text: str) -> str:
    """生成符合 MongoDB 规范的集合名称（支持中文转拼音）"""
    
    # 第一步：原始清理（处理英文/数字的情况）
    cleaned = re.sub(r'[^a-z0-9_]', '', search_text.lower())
    
    # 第二步：如果原始清理结果为空（说明是纯中文或无效字符）
    if not cleaned:
        # 将中文转换为拼音（示例："测试" → "ce_shi"）
        pinyin_str = slug(
            search_text,
            style=Style.NORMAL,
            separator='_'       # 明确指定分隔符
        ).lower()                # 统一转换为小写
        
        # 对拼音结果再次清理（确保没有漏网之鱼）
        cleaned = re.sub(r'[^a-z0-9_]', '', pinyin_str)
        
        # 兜底处理：如果仍然为空，使用默认值
        if not cleaned:
            cleaned = "default"

    # 处理以数字开头的情况
    if cleaned[0].isdigit():
        cleaned = f"col_{cleaned}"

    # 组合最终名称并截断
    return f"search_{cleaned}"[:63]

# 异常处理装饰器
def handle_errors(func):
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            print(f"ERROR: {str(e)}", file=sys.stderr)
            sys.exit(1)
    return wrapper

@handle_errors
def main_process():
    # 兼容原config_path路径
    import WeiBoCrawler.util as crawler_util
    sys.modules['WeiBoCrawler.util.config_path'] = crawler_util.config_path
    sys.modules['WeiBoCrawler.util.cookies_config'] = crawler_util.cookies_config

    
    # 接收命令行参数
    params = {
        "search_for": sys.argv[1],
        "kind": sys.argv[2],
        "advanced_kind": sys.argv[3],
        "start": sys.argv[4],
        "end": sys.argv[5]
    }
    
    # 原业务逻辑处理
    collection_name = generate_safe_collection_name(params["search_for"])
    res_ids = get_list_data(
        search_for=params["search_for"],
        table_name=collection_name,
        kind=params["kind"],
        advanced_kind=params["advanced_kind"],
        time_start=params["start"],
        time_end=params["end"]
    )
    
    records = db.sync_get_records_by_ids(
        collection_name=collection_name,
        ids=res_ids
    )
    documents = [record["json_data"] for record in records]
    processed_data = process_list_documents(documents)
    
    print(json.dumps(processed_data))


if __name__ == '__main__':
    # 直接调用主处理函数
    main_process()