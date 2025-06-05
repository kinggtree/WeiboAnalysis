import torch
import json
import pandas as pd
from transformers import BertTokenizer, BertModel
from torch import nn
import warnings
import os
import sys
import numpy as np
import traceback
from tqdm.auto import tqdm


warnings.filterwarnings('ignore')

_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model")
_BERT_MODEL_PATH = os.path.join(_MODEL_DIR, "chinese_wwm_pytorch")
_DNN_MODEL_PATH = os.path.join(_MODEL_DIR, "bert_dnn_10_weight_only.model")
_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"DEBUG [sentiment.py]: Using device: {_DEVICE}", file=sys.stderr)

class _Net(nn.Module):
    def __init__(self, input_size):
        super().__init__()
        self.fc = nn.Linear(input_size, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        return self.sigmoid(self.fc(x))

def _parse_data(df_input: pd.DataFrame) -> pd.DataFrame:
    df = df_input.copy()
    print(f"DEBUG [_parse_data]: Received DataFrame shape: {df.shape}", file=sys.stderr)
    print(f"DEBUG [_parse_data]: Received columns: {df.columns.tolist()}", file=sys.stderr)

    if 'content_all' in df.columns:
        print("DEBUG [_parse_data]: Found 'content_all' column. Using it for 'content'.", file=sys.stderr)
        df['content'] = df['content_all'].fillna('').astype(str)
    elif 'content' in df.columns:
        print("DEBUG [_parse_data]: Found 'content' column directly. Using it.", file=sys.stderr)
        df['content'] = df['content'].fillna('').astype(str)
    else:
        print("WARN [_parse_data]: Neither 'content_all' nor 'content' column found in input DataFrame. Sentiment analysis will likely yield default results.", file=sys.stderr)
        df['content'] = ''

    if 'search_for' not in df.columns:
        print("WARN [_parse_data]: 'search_for' column not found. Aggregation might not work as expected.", file=sys.stderr)

    print(f"DEBUG [_parse_data]: DataFrame columns after parsing: {df.columns.tolist()}", file=sys.stderr)
    return df

class _SentimentAnalyzer:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            print("DEBUG [_SentimentAnalyzer]: Initializing models...", file=sys.stderr)
            cls._instance = super(_SentimentAnalyzer, cls).__new__(cls)
            try:
                cls._instance.tokenizer = BertTokenizer.from_pretrained(_BERT_MODEL_PATH)
                cls._instance.bert = BertModel.from_pretrained(_BERT_MODEL_PATH).to(_DEVICE)
                cls._instance.model = _Net(input_size=768)
                cls._instance.model.load_state_dict(
                    torch.load(_DNN_MODEL_PATH, map_location=_DEVICE)
                )
                cls._instance.model.to(_DEVICE)
                cls._instance.model.eval()
                print("DEBUG [_SentimentAnalyzer]: Models loaded successfully.", file=sys.stderr)
            except Exception as e:
                print(f"ERROR [_SentimentAnalyzer]: Failed to load models - {str(e)}", file=sys.stderr)
                print(traceback.format_exc(), file=sys.stderr)
                cls._instance = None
                raise RuntimeError(f"Failed to initialize SentimentAnalyzer models: {e}") from e
        return cls._instance

    def predict(self, texts, batch_size=32):
        if not texts:
            print("DEBUG [predict]: Received empty list of texts. Returning empty list.", file=sys.stderr)
            return []
        if all(not t for t in texts):
            print("DEBUG [predict]: All texts are empty. Returning default predictions.", file=sys.stderr)
            return [0.5] * len(texts)
        
        predictions = []
        self.model.eval()
        
        with tqdm(total=len(texts), desc="Analysing Sentiments", unit="text", file=sys.stderr, ascii=True) as pbar:
            with torch.no_grad():
                for i in range(0, len(texts), batch_size):
                    batch = texts[i:i+batch_size]
                    valid_batch = [t for t in batch if t] 
                    
                    if not valid_batch:
                        predictions.extend([0.5] * len(batch))
                        pbar.update(len(batch))
                        continue

                    try:
                        tokens = self.tokenizer(
                            valid_batch,
                            padding=True,
                            truncation=True,
                            max_length=512,
                            return_tensors="pt"
                        ).to(_DEVICE)

                        if _DEVICE == "cuda":
                            with torch.cuda.amp.autocast():
                                outputs = self.bert(**tokens)
                                cls_embeddings = outputs.last_hidden_state[:, 0]
                                preds = self.model(cls_embeddings)
                        else: 
                            outputs = self.bert(**tokens)
                            cls_embeddings = outputs.last_hidden_state[:, 0]
                            preds = self.model(cls_embeddings)

                        pred_iter = iter(preds.cpu().flatten().tolist())
                        batch_preds = [next(pred_iter) if t else 0.5 for t in batch]
                        predictions.extend(batch_preds)

                    except Exception as e:
                        print(f"ERROR [predict]: Error during batch prediction ({i}-{i+len(batch)-1}) - {str(e)}", file=sys.stderr)
                        print(traceback.format_exc(), file=sys.stderr)
                        predictions.extend([0.5] * len(batch)) # 失败的批次也使用默认预测

                    pbar.update(len(batch)) # 更新进度条，增加处理的文本数量

        return predictions

def analysis_sentiment(input_data: pd.DataFrame, output_csv_path: str = 'sentiment_analysis_result.csv'):
    if not isinstance(input_data, pd.DataFrame):
        print("ERROR [analysis_sentiment]: Input data is not a Pandas DataFrame.", file=sys.stderr)
        return pd.DataFrame()

    if input_data.empty:
        print("WARN [analysis_sentiment]: Received empty DataFrame. Returning empty result.", file=sys.stderr)
        return pd.DataFrame(columns=['search_for', 'count', 'mean', 'positive_ratio'])

    try:
        analyzer = _SentimentAnalyzer()
        if analyzer is None:
             raise RuntimeError("SentimentAnalyzer instance is None, models likely failed to load.")

        df = _parse_data(input_data)

        texts = df['content'].tolist()

        if not texts or all(not t for t in texts):
             print("WARN [analysis_sentiment]: No valid text content found after parsing. Cannot perform prediction.", file=sys.stderr)
             if 'search_for' in df.columns:
                 unique_keywords = df['search_for'].unique()
                 results = pd.DataFrame({
                     'search_for': unique_keywords,
                     'count': 0,
                     'mean': np.nan,
                     'positive_ratio': np.nan
                 })
                 return results
             else:
                 return pd.DataFrame(columns=['search_for', 'count', 'mean', 'positive_ratio'])

        df['sentiment_score'] = analyzer.predict(texts)
        print(f"DEBUG [analysis_sentiment]: Added 'sentiment_score' column. Shape: {df.shape}", file=sys.stderr)

        if output_csv_path:
            try:
                results_to_save = df[['content', 'sentiment_score']].copy()
                results_to_save.rename(columns={
                    'content': '分析的语句',
                    'sentiment_score': '分析结果（情感倾向，数字表示）'
                }, inplace=True)

                # Save to CSV
                results_to_save.to_csv(output_csv_path, index=False, encoding='utf-8-sig') # Use utf-8-sig for Excel compatibility
                print(f"INFO [analysis_sentiment]: Individual sentiment results saved to {output_csv_path}", file=sys.stderr)
            except Exception as e_csv:
                print(f"ERROR [analysis_sentiment]: Failed to save individual results to CSV - {str(e_csv)}", file=sys.stderr)
                print(traceback.format_exc(), file=sys.stderr)

        if 'search_for' in df.columns:
            print("DEBUG [analysis_sentiment]: Grouping results by 'search_for'...", file=sys.stderr)
            results = df.groupby('search_for').agg(
                count=('sentiment_score', 'size'),
                mean=('sentiment_score', 'mean'),
                positive_ratio=('sentiment_score', lambda x: (x > 0.5).mean() if not x.empty else np.nan)
            ).reset_index()
            print(f"DEBUG [analysis_sentiment]: Aggregation complete. Result shape: {results.shape}", file=sys.stderr)
            results = results.sort_values(by='count', ascending=False)
        else:
            print("WARN [analysis_sentiment]: 'search_for' column missing. Aggregating all results into one row.", file=sys.stderr)
            total_count = len(df)
            if total_count > 0:
                 mean_sentiment = df['sentiment_score'].mean()
                 positive_ratio = (df['sentiment_score'] > 0.5).mean()
                 results = pd.DataFrame([{
                     'search_for': 'Overall',
                     'count': total_count,
                     'mean': mean_sentiment,
                     'positive_ratio': positive_ratio
                 }])
            else:
                 results = pd.DataFrame(columns=['search_for', 'count', 'mean', 'positive_ratio'])

        results['mean'] = results['mean'].replace({np.nan: None})
        results['positive_ratio'] = results['positive_ratio'].replace({np.nan: None})

        print("DEBUG [analysis_sentiment]: Analysis finished successfully.", file=sys.stderr)
        return results

    except Exception as e:
        print(f"ERROR [analysis_sentiment]: An error occurred during sentiment analysis - {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return pd.DataFrame(columns=['search_for', 'count', 'mean', 'positive_ratio'])

if __name__ == "__main__":
    print("Testing sentiment.py functions...")
    data = {
        'search_for': ['topic1', 'topic2', 'topic1', 'topic3', 'topic2', 'topic1'],
        'content_all': [
            '这是一个非常好的产品',
            '我不喜欢这个东西',
            '真的很棒，推荐购买',
            '', 
            '体验太差了',
            None
        ],
        'other_col': [1, 2, 3, 4, 5, 6]
    }
    test_df = pd.DataFrame(data)

    print("\n--- Testing _parse_data ---")
    parsed_df = _parse_data(test_df)
    print("Parsed DataFrame head:\n", parsed_df.head())
    print("Parsed DataFrame columns:", parsed_df.columns)
    print("Content column:\n", parsed_df['content'])

    print("\n--- Testing analysis_sentiment ---")
    try:
        analysis_results = analysis_sentiment(test_df)
        print("Analysis Results:\n", analysis_results)
    except Exception as main_e:
         print(f"Error during main test execution: {main_e}")

    print("\n--- Testing with missing content_all ---")
    data_no_content = {
         'search_for': ['topicA', 'topicB'],
         'some_other_data': [10, 20]
    }
    test_df_no_content = pd.DataFrame(data_no_content)
    try:
        analysis_results_no_content = analysis_sentiment(test_df_no_content)
        print("Analysis Results (no content_all):\n", analysis_results_no_content)
    except Exception as main_e2:
         print(f"Error during main test execution (no content_all): {main_e2}")
