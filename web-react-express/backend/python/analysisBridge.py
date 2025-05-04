import sys
import json
import pandas as pd
from util import db
from SentimentAnalysis import analysis_sentiment
import numpy as np
import datetime
from bson import ObjectId  # 如果用到MongoDB原生类型


import io

# 强制标准流编码
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

def get_collections():
    try:
        return db.sync_get_collection_names()
    except Exception as e:
        print(f"ERROR: {str(e)}", file=sys.stderr)
        sys.exit(1)

import numpy as np
from pandas import json_normalize

def execute_query(params):
    try:
        collection = params['collection']
        limit = int(params['limit']) if params['limit'] else 0
        
        # 增加查询容错处理
        cursor = db.sync_db[collection].find().limit(limit) if limit > 0 else db.sync_db[collection].find()
        
        df = pd.DataFrame(list(cursor))
        
        # 处理嵌套字段（新增与streamlit版本一致的逻辑）
        if 'json_data' in df.columns:
            # 安全展开嵌套字段
            try:
                json_df = json_normalize(df['json_data'])
                # 处理空数据的情况
                if not json_df.empty:  # 显式判断空数组
                    if 'uid' in json_df.columns:
                        json_df.rename(columns={'uid':'json_uid'}, inplace=True)
                    df = pd.concat([df.drop('json_data', axis=1), json_df], axis=1)
            except Exception as e:
                print(f"WARN: 嵌套字段展开失败 - {str(e)}")

        # 增强类型转换函数
        def convert_types(value):
            # 处理数组类型
            if isinstance(value, np.ndarray):
                return value.tolist() if value.size > 0 else []  # 显式判断空数组
            # 处理时间类型
            if isinstance(value, (pd.Timestamp, datetime.datetime)):
                return value.isoformat()
            # 处理数值类型
            if isinstance(value, (np.integer, np.floating)):
                return int(value) if isinstance(value, np.integer) else float(value)
            # 处理空值
            if pd.isna(value):
                return None
            return value

        # 安全应用类型转换
        df = df.applymap(lambda x: convert_types(x) if not isinstance(x, list) else [convert_types(i) for i in x])

        # 确保_id字段处理
        if '_id' in df.columns:
            df['_id'] = df['_id'].astype(str)
            
        return df.to_dict(orient='records')
    except Exception as e:
        print(f"ERROR: {str(e)}", file=sys.stderr)
        sys.exit(1)



def analyze_sentiment(data):
    try:
        df = pd.DataFrame(data)
        result_df = analysis_sentiment(df)
        return result_df.to_dict(orient='records')
    except Exception as e:
        print(f"ERROR: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    action = sys.argv[1]
    
    # 根据操作类型选择输入方式
    if action == "get_collections":
        # 无参数操作直接执行
        print(json.dumps(get_collections()))
    else:
        # 从标准输入读取参数
        input_str = sys.stdin.read()
        if action == "execute_query":
            params = json.loads(input_str)
            print(json.dumps(execute_query(params)))
        elif action == "analyze_sentiment":
            data = json.loads(input_str)
            print(json.dumps(analyze_sentiment(data)))


