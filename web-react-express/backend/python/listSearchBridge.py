# listSearchBridge.py
import sys
import os
import json
import re
from pypinyin import slug, Style
import io
from datetime import date
import traceback
import pandas as pd


# 强制标准流编码
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from util import get_list_data, db, process_list_documents
from WeiBoCrawler.database import BodyRecord


# 自动生成安全集合名称
def generate_safe_collection_name(search_text: str) -> str:
    """生成符合 MongoDB 规范的集合名称（支持中文转拼音）"""
    
    # 第一步：原始清理（处理英文/数字的情况）
    cleaned = re.sub(r'[^a-z0-9_]', '', search_text.lower())
    
    # 第二步：如果原始清理结果为空（说明是纯中文或无效字符）
    if not cleaned:
        # 将中文转换为拼音
        pinyin_str = slug(
            search_text,
            style=Style.NORMAL,
            separator='_'   # 明确指定分隔符
        ).lower()   # 统一转换为小写
        
        # 对拼音结果再次清理
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
            # 尝试执行被装饰的函数 (例如 main_process)
            return func(*args, **kwargs)
        except Exception as e:
            # --- 捕获到异常，打印详细信息 ---
            err_type = type(e).__name__  # 获取异常类型名称
            err_msg = str(e)             # 获取异常消息
            # 获取完整的 traceback 字符串
            err_traceback = traceback.format_exc()

            # 打印到 stderr (Node.js 会捕获这里的内容)
            print(f"--- Python Script Error ---", file=sys.stderr)
            print(f"ERROR Type: {err_type}", file=sys.stderr)
            print(f"ERROR Message: {err_msg}", file=sys.stderr)
            print(f"Traceback:\n{err_traceback}", file=sys.stderr) # 打印完整 traceback
            print(f"--- End Python Script Error ---", file=sys.stderr)
            sys.exit(1) # 以非零状态码退出，表示出错
    return wrapper

@handle_errors
def main_process():
    # --- 从 stdin 读取 JSON 参数 ---
    try:
        input_data = sys.stdin.read() # 读取所有来自 Node.js 的输入
        if not input_data:
             print("ERROR: Python received empty data from stdin.", file=sys.stderr)
             sys.exit(1)
        params = json.loads(input_data) # 解析 JSON 字符串为 Python 字典
    except json.JSONDecodeError as e:
        print(f"ERROR: Python failed to decode JSON from stdin: {e}", file=sys.stderr)
        # 打印接收到的原始数据，帮助调试
        print(f"Received raw data: {input_data}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Python error reading/parsing params from stdin: {e}", file=sys.stderr)
        sys.exit(1)
    # --- 结束: 从 stdin 读取 JSON 参数 ---

    # --- 使用从 stdin 获取的 params 字典中的值 ---
    # 使用 .get() 获取值更安全，可以提供默认值，避免 KeyError
    search_for = params.get("search_for", "")
    kind = params.get("kind", "综合")
    advanced_kind = params.get("advanced_kind", "综合")
    start = params.get("start", "2020-01-01")
    # 确保结束日期有合理的默认值或处理逻辑
    end = params.get("end", date.today().isoformat()) # 使用 date.today() 获取今天日期，isoformat() 转为 YYYY-MM-DD 格式


    # 添加调试打印，确认参数已正确接收
    print(f"DEBUG Python: Received params - search_for='{search_for}', kind='{kind}', start='{start}', end='{end}'", file=sys.stderr)

    
    # 业务逻辑处理
    collection_name = generate_safe_collection_name(search_for)
    res_ids = get_list_data(
        search_for=search_for, # 确保这里用的是从 params 获取的变量
        table_name=collection_name,
        kind=kind,
        advanced_kind=advanced_kind,
        time_start=start,
        time_end=end
    )
    
    records = db.sync_get_records_by_ids(
        collection_name=collection_name,
        ids=res_ids
    )
    documents = [record["json_data"] for record in records]
    processed_data = process_list_documents(documents)

    df_results = process_list_documents(documents)

    # 检查 df_results 是否真的是 DataFrame
    if isinstance(df_results, pd.DataFrame):
        serializable_data = df_results.to_dict(orient='records')
    else:
        serializable_data = df_results
    
    print(json.dumps(serializable_data, ensure_ascii=False)) # 打印转换后的列表/字典


if __name__ == '__main__':
    # 直接调用主处理函数
    main_process()