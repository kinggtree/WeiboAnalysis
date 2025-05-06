# analysisBridge.py

import sys
import json
import pandas as pd
from util import db
from SentimentAnalysis import analysis_sentiment
import numpy as np
import datetime
from bson import ObjectId
import io
import os # 引入 os 模块
import traceback # 引入 traceback 用于更详细的错误输出

# 强制标准流编码
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# --- get_collections 函数 ---
def get_collections():
    try:
        if not hasattr(db, 'sync_db') or db.sync_db is None:
             raise ConnectionError("Database connection not established.")
        return db.sync_get_collection_names()
    except Exception as e:
        print(f"ERROR [get_collections]: {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr) # 打印完整 traceback
        sys.exit(1)

# --- 修改 execute_query 函数 ---
def execute_query(params):
    try:
        collection = params.get('collection') # 使用 get 获取，避免 KeyError
        limit = int(params.get('limit', 0))

        if not collection:
            raise ValueError("Collection name is required.")
        if not hasattr(db, 'sync_db') or db.sync_db is None:
            raise ConnectionError("Database connection not established.")

        print(f"DEBUG: Executing query on collection '{collection}' with limit {limit}", file=sys.stderr)
        cursor = db.sync_db[collection].find().limit(limit) if limit > 0 else db.sync_db[collection].find()
        df = pd.DataFrame(list(cursor))
        print(f"DEBUG: Initial DataFrame shape: {df.shape}", file=sys.stderr)

        if df.empty:
            print("DEBUG: DataFrame is empty, returning empty list.", file=sys.stderr)
            return []

        # --- 展开 'json_data' ---
        if 'json_data' in df.columns:
            print("DEBUG: Processing 'json_data' column.", file=sys.stderr)
            try:
                # 仅处理字典类型的元素，非字典视为空字典
                valid_json_data = df['json_data'].apply(lambda x: x if isinstance(x, dict) else {})
                # 检查是否有有效的JSON数据需要展开
                if not valid_json_data.apply(lambda d: bool(d)).any():
                     print("DEBUG: 'json_data' column contains no valid dictionaries to normalize.", file=sys.stderr)
                     df = df.drop('json_data', axis=1) # 如果全是空的，直接删除列
                else:
                    original_index = df.index # 保存原始索引
                    # 使用 pd.json_normalize
                    json_df = pd.json_normalize(valid_json_data)
                    json_df.index = original_index # 恢复索引以匹配原始df

                    if not json_df.empty:
                        print(f"DEBUG: Normalized json_data shape: {json_df.shape}", file=sys.stderr)
                        if 'uid' in json_df.columns and 'uid' in df.columns: # 处理列名冲突
                            json_df.rename(columns={'uid': 'json_uid'}, inplace=True)
                            print("DEBUG: Renamed 'uid' in json_df to 'json_uid'.", file=sys.stderr)
                        # 合并前检查列名冲突
                        common_columns = df.columns.intersection(json_df.columns).tolist()
                        if common_columns:
                             print(f"WARN: Common columns found between base df and json_df: {common_columns}. Json_df columns will be preferred.", file=sys.stderr)
                             # 可以选择保留哪个，这里默认 json_df 的会覆盖（如果 concat 不处理的话）
                             # 或者重命名 df 中的冲突列
                        df = pd.concat([df.drop('json_data', axis=1), json_df], axis=1)
                        print(f"DEBUG: DataFrame shape after merging json_data: {df.shape}", file=sys.stderr)
                    else:
                         print("DEBUG: json_normalize resulted in an empty DataFrame.", file=sys.stderr)
                         df = df.drop('json_data', axis=1) # 如果normalize后为空，也删除原列

            except Exception as e:
                print(f"WARN [execute_query]: Failed to normalize 'json_data' - {str(e)}", file=sys.stderr)
                print(traceback.format_exc(), file=sys.stderr)
                # 选择是继续（可能丢失json_data）还是抛出错误
                if 'json_data' in df.columns:
                     df = df.drop('json_data', axis=1) # 尝试删除列后继续


        # analysisBridge.py (在 execute_query 函数内部)

        # --- 类型转换函数 ---
        def convert_types_elementwise(value):
            # 1. 优先处理可能引发 pd.isna() 问题的特定类型
            if isinstance(value, ObjectId):
                return str(value)
            if isinstance(value, (datetime.datetime, pd.Timestamp)):
                return value.isoformat()
            # 显式处理列表和 ndarray (包括空的)
            if isinstance(value, list):
                # 递归转换列表内的元素
                return [convert_types_elementwise(i) for i in value]
            if isinstance(value, np.ndarray):
                # 递归转换数组内的元素 (空数组会返回空列表 [])
                return [convert_types_elementwise(i) for i in value.tolist()]

            # 2. 在排除了上述复杂类型后，再检查 None/NA
            #    此时 value 更有可能是标量值
            if pd.isna(value):
                return None

            # 3. 处理标量数值类型
            if isinstance(value, (np.bool_, bool)):
                return bool(value)
            if isinstance(value, np.integer):
                return int(value)
            if isinstance(value, np.floating):
                # 再次检查 NaN/Inf 以防万一
                return None if np.isnan(value) or np.isinf(value) else float(value)
            # 处理 Python 原生数字类型
            if isinstance(value, int):
                return value
            if isinstance(value, float):
                 # 再次检查 NaN/Inf
                return None if np.isnan(value) or np.isinf(value) else float(value)

            # 4. 其他标量类型（如字符串）
            return value

        print("DEBUG: Applying type conversion using applymap...", file=sys.stderr)
        # --- 使用 applymap () ---
        df = df.applymap(convert_types_elementwise)
        print("DEBUG: Type conversion applied.", file=sys.stderr)

        print("DEBUG: Applying type conversion using applymap...", file=sys.stderr)
        # --- 使用 applymap ---
        # applymap 保证逐元素应用，因此 convert_types_elementwise 接收的应是标量
        df = df.applymap(convert_types_elementwise)
        print("DEBUG: Type conversion applied.", file=sys.stderr)

        # 再次检查并替换 NaN/NaT (以防万一)
        df = df.replace({np.nan: None, pd.NaT: None})
        print("DEBUG: Final NaN/NaT replacement done.", file=sys.stderr)

        # 转换为字典列表
        dict_records = df.to_dict(orient='records')
        print(f"DEBUG: Converted to {len(dict_records)} records.", file=sys.stderr)
        return dict_records

    except Exception as e:
        # 打印更详细的错误信息和 traceback
        print(f"ERROR [execute_query]: An unexpected error occurred - {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        sys.exit(1) # 确保异常时退出并返回错误码

# --- analyze_sentiment_from_csv 函数 ---
def analyze_sentiment_from_csv(params):
    try:
        csv_filepath = params.get('csv_filepath')
        if not csv_filepath:
            raise ValueError("Missing 'csv_filepath' in input parameters.")

        if not os.path.exists(csv_filepath):
             raise FileNotFoundError(f"CSV file not found at path: {csv_filepath}")

        print(f"DEBUG: Reading CSV file: {csv_filepath}", file=sys.stderr)
        df = pd.read_csv(csv_filepath)
        print(f"DEBUG: Read CSV shape: {df.shape}", file=sys.stderr)

        if df.empty:
            print("WARN [analyze_sentiment_from_csv]: Input CSV file is empty.", file=sys.stderr)
            return []

        if not callable(analysis_sentiment):
             raise ImportError("Function 'analysis_sentiment' is not available or not callable.")

        print("DEBUG: Calling analysis_sentiment function...", file=sys.stderr)
        result_df = analysis_sentiment(df)
        print(f"DEBUG: Analysis result shape: {result_df.shape}", file=sys.stderr)

        if result_df.empty:
            print("WARN [analyze_sentiment_from_csv]: Analysis result is empty.", file=sys.stderr)
            return []

        result_df = result_df.replace({np.nan: None, pd.NaT: None})
        dict_records = result_df.to_dict(orient='records')
        print(f"DEBUG: Converted analysis result to {len(dict_records)} records.", file=sys.stderr)
        return dict_records

    except Exception as e:
        print(f"ERROR [analyze_sentiment_from_csv]: An unexpected error occurred - {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr) # 打印完整 traceback
        sys.exit(1)

# --- __main__ 部分 ---
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("ERROR: Missing action argument.", file=sys.stderr)
        sys.exit(1)

    action = sys.argv[1]
    print(f"DEBUG: Action received: {action}", file=sys.stderr)

    try:
        if action == "get_collections":
            result = get_collections()
            print(json.dumps(result)) # 直接打印JSON结果到stdout
        else:
            print(f"DEBUG: Reading parameters from stdin for action '{action}'...", file=sys.stderr)
            input_str = sys.stdin.read()
            if not input_str:
                 print(f"ERROR [{action}]: No input received via stdin.", file=sys.stderr)
                 sys.exit(1)
            print(f"DEBUG: Received stdin (first 500 chars): {input_str[:500]}...", file=sys.stderr)

            try:
                params = json.loads(input_str)
            except json.JSONDecodeError as json_err:
                print(f"ERROR [{action}]: Invalid JSON input - {json_err}", file=sys.stderr)
                sys.exit(1)

            print(f"DEBUG: Parsed parameters: {params}", file=sys.stderr)

            result = None
            if action == "execute_query":
                result = execute_query(params)
            elif action == "analyze_sentiment_from_csv":
                result = analyze_sentiment_from_csv(params)
            else:
                print(f"ERROR: Unknown action '{action}'", file=sys.stderr)
                sys.exit(1)

            # 确保结果可以被JSON序列化
            try:
                 # 使用 default=str 处理一些可能未转换的类型，例如 Decimal
                 json_output = json.dumps(result, default=str, ensure_ascii=False) # 添加 ensure_ascii=False
                 print(json_output) # 打印最终JSON结果到stdout
            except TypeError as dump_err:
                 print(f"ERROR [{action}]: Failed to serialize result to JSON - {dump_err}", file=sys.stderr)
                 # 可以尝试打印部分 result 帮助调试
                 print(f"DEBUG: Result snippet before serialization error: {str(result)[:500]}", file=sys.stderr)
                 sys.exit(1)

    except SystemExit: # 捕获 sys.exit() 调用，防止被下面的 Exception 捕获
         raise # 重新抛出 SystemExit
    except Exception as e:
         # 捕获主流程中的意外错误
         print(f"FATAL ERROR in main execution block for action '{action}': {str(e)}", file=sys.stderr)
         print(traceback.format_exc(), file=sys.stderr)
         sys.exit(1)