import sys
import json
import pandas as pd
from util import db
from SentimentAnalysis import analysis_sentiment

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

def execute_query(params):
    try:
        collection = params['collection']
        limit = params['limit'] or 0
        
        cursor = db.sync_db[collection].find(limit=limit if limit > 0 else 0)
        df = pd.DataFrame(list(cursor))
        
        # 处理ObjectId
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
    
    # 从标准输入读取数据
    input_str = sys.stdin.read()
    
    if action == "get_collections":
        print(json.dumps(get_collections()))
        
    elif action == "execute_query":
        params = json.loads(input_str)
        print(json.dumps(execute_query(params)))
        
    elif action == "analyze_sentiment":
        data = json.loads(input_str)
        print(json.dumps(analyze_sentiment(data)))

