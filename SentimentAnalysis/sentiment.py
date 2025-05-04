import torch
import json
import pandas as pd # Make sure pandas is imported
from transformers import BertTokenizer, BertModel
from torch import nn
import warnings
import os
import sys # Import sys for printing debug/warning messages
import numpy as np # Import numpy for aggregation if needed
import traceback # Import traceback for error handling

warnings.filterwarnings('ignore')

# --- Model Path Configuration (Keep as is) ---
_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model")
_BERT_MODEL_PATH = os.path.join(_MODEL_DIR, "chinese_wwm_pytorch")
_DNN_MODEL_PATH = os.path.join(_MODEL_DIR, "bert_dnn_10_weight_only.model")
_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"DEBUG [sentiment.py]: Using device: {_DEVICE}", file=sys.stderr) # Add device info log

# --- _Net Class (Keep as is) ---
class _Net(nn.Module):
    def __init__(self, input_size):
        super().__init__()
        self.fc = nn.Linear(input_size, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        return self.sigmoid(self.fc(x))

# --- MODIFIED _parse_data Function ---
def _parse_data(df_input: pd.DataFrame) -> pd.DataFrame:
    """
    Parses the input DataFrame to extract the text content for analysis.
    Expects the content to be in the 'content_all' column.
    """
    # Work on a copy to avoid SettingWithCopyWarning and modifying the original df
    df = df_input.copy()
    print(f"DEBUG [_parse_data]: Received DataFrame shape: {df.shape}", file=sys.stderr)
    print(f"DEBUG [_parse_data]: Received columns: {df.columns.tolist()}", file=sys.stderr)

    # Remove the old logic relying on 'json_data'
    # def parse_json(x): ... # No longer needed here
    # df['parsed_json'] = df['json_data'].apply(parse_json) # Remove

    # --- NEW LOGIC ---
    # Check if the 'content_all' column exists (it should, based on analysisBridge.py)
    if 'content_all' in df.columns:
        print("DEBUG [_parse_data]: Found 'content_all' column. Using it for 'content'.", file=sys.stderr)
        # Assign content from 'content_all', fill NaNs with empty string, ensure string type
        df['content'] = df['content_all'].fillna('').astype(str)
    # --- Fallback/Alternative: Check for 'content' column directly ---
    # Sometimes the column might already be named 'content' if preprocessing happened differently
    elif 'content' in df.columns:
        print("DEBUG [_parse_data]: Found 'content' column directly. Using it.", file=sys.stderr)
        # Ensure it's clean (fillna, astype)
        df['content'] = df['content'].fillna('').astype(str)
    else:
        # If neither 'content_all' nor 'content' is found, create an empty 'content' column and warn
        print("WARN [_parse_data]: Neither 'content_all' nor 'content' column found in input DataFrame. Sentiment analysis will likely yield default results.", file=sys.stderr)
        df['content'] = '' # Create empty column to prevent downstream errors

    # Optional: Check if 'search_for' exists for grouping later
    if 'search_for' not in df.columns:
        print("WARN [_parse_data]: 'search_for' column not found. Aggregation might not work as expected.", file=sys.stderr)
        # You might want to add a default 'search_for' value if needed for aggregation
        # df['search_for'] = 'default_keyword'

    print(f"DEBUG [_parse_data]: DataFrame columns after parsing: {df.columns.tolist()}", file=sys.stderr)
    return df

# --- _SentimentAnalyzer Class (Keep as is, but add debug logs) ---
class _SentimentAnalyzer:
    _instance = None # Singleton pattern to load models only once per process

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            print("DEBUG [_SentimentAnalyzer]: Initializing models...", file=sys.stderr)
            cls._instance = super(_SentimentAnalyzer, cls).__new__(cls)
            # Initialize models here within __new__ or in a separate __init__ called only once
            try:
                cls._instance.tokenizer = BertTokenizer.from_pretrained(_BERT_MODEL_PATH)
                cls._instance.bert = BertModel.from_pretrained(_BERT_MODEL_PATH).to(_DEVICE)

                cls._instance.model = _Net(input_size=768) # Bert base hidden size
                cls._instance.model.load_state_dict(
                    torch.load(_DNN_MODEL_PATH, map_location=_DEVICE)
                )
                cls._instance.model.to(_DEVICE)
                cls._instance.model.eval()
                print("DEBUG [_SentimentAnalyzer]: Models loaded successfully.", file=sys.stderr)
            except Exception as e:
                print(f"ERROR [_SentimentAnalyzer]: Failed to load models - {str(e)}", file=sys.stderr)
                print(traceback.format_exc(), file=sys.stderr) # Add traceback
                # Handle error appropriately, maybe raise it or set instance to None
                cls._instance = None
                raise RuntimeError(f"Failed to initialize SentimentAnalyzer models: {e}") from e
        return cls._instance

    # Removed __init__ as initialization is handled in __new__ for singleton

    def predict(self, texts, batch_size=32):
        if not texts:
            print("DEBUG [predict]: Received empty list of texts. Returning empty list.", file=sys.stderr)
            return []
        if all(not t for t in texts): # Check if all texts are empty strings
             print("DEBUG [predict]: All texts are empty. Returning default predictions.", file=sys.stderr)
             # Return a list of default scores (e.g., 0.5 for neutral) matching the input length
             return [0.5] * len(texts)

        print(f"DEBUG [predict]: Predicting sentiment for {len(texts)} texts (batch size: {batch_size})...", file=sys.stderr)
        predictions = []
        self.model.eval() # Ensure model is in eval mode
        with torch.no_grad():
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i+batch_size]
                # Handle potential empty strings within a batch if not filtered earlier
                valid_batch = [t for t in batch if t] # Filter out empty strings for tokenization
                if not valid_batch:
                    # If the entire batch was empty strings, append default scores
                    predictions.extend([0.5] * len(batch))
                    continue

                try:
                    tokens = self.tokenizer(
                        valid_batch, # Tokenize only non-empty texts
                        padding=True,
                        truncation=True,
                        max_length=512, # Consider if this length is appropriate
                        return_tensors="pt"
                    ).to(_DEVICE)

                    # Use autocast for potential performance improvement on CUDA
                    if _DEVICE == "cuda":
                        with torch.cuda.amp.autocast():
                            outputs = self.bert(**tokens)
                            cls_embeddings = outputs.last_hidden_state[:, 0] # [CLS] token embedding
                            preds = self.model(cls_embeddings)
                    else: # Run without autocast on CPU
                         outputs = self.bert(**tokens)
                         cls_embeddings = outputs.last_hidden_state[:, 0]
                         preds = self.model(cls_embeddings)

                    # Map predictions back to the original batch size (including empty strings)
                    pred_iter = iter(preds.cpu().flatten().tolist())
                    batch_preds = [next(pred_iter) if t else 0.5 for t in batch] # Assign 0.5 to empty strings
                    predictions.extend(batch_preds)

                except Exception as e:
                     print(f"ERROR [predict]: Error during batch prediction ({i}-{i+batch_size}) - {str(e)}", file=sys.stderr)
                     print(traceback.format_exc(), file=sys.stderr) # Add traceback
                     # Add default predictions for the failed batch to avoid length mismatch
                     predictions.extend([0.5] * len(batch)) # Or handle error differently

        print(f"DEBUG [predict]: Prediction complete. Got {len(predictions)} scores.", file=sys.stderr)
        return predictions

# --- MODIFIED analysis_sentiment Function (Main public interface) ---
def analysis_sentiment(input_data: pd.DataFrame):
    """
    Performs sentiment analysis on the input DataFrame.
    Expects 'content_all' or 'content' column for text and 'search_for' for grouping.
    """
    if not isinstance(input_data, pd.DataFrame):
        print("ERROR [analysis_sentiment]: Input data is not a Pandas DataFrame.", file=sys.stderr)
        return pd.DataFrame() # Return empty DataFrame

    if input_data.empty:
        print("WARN [analysis_sentiment]: Received empty DataFrame. Returning empty result.", file=sys.stderr)
        return pd.DataFrame(columns=['search_for', 'count', 'mean', 'positive_ratio'])

    try:
        # Initialize the analyzer (loads models only once)
        analyzer = _SentimentAnalyzer()
        if analyzer is None: # Check if initialization failed
             raise RuntimeError("SentimentAnalyzer instance is None, models likely failed to load.")

        # Parse data to get the 'content' column
        df = _parse_data(input_data) # df is now the modified copy

        # Get texts for prediction
        texts = df['content'].tolist()

        # Predict sentiment
        # Handle case where all texts might be empty after parsing
        if not texts or all(not t for t in texts):
             print("WARN [analysis_sentiment]: No valid text content found after parsing. Cannot perform prediction.", file=sys.stderr)
             # Decide how to handle this: return empty result or result with zero counts/default scores
             if 'search_for' in df.columns:
                 # Create a result DataFrame with 0 counts based on unique search_for values
                 unique_keywords = df['search_for'].unique()
                 results = pd.DataFrame({
                     'search_for': unique_keywords,
                     'count': 0,
                     'mean': np.nan, # Or 0.5?
                     'positive_ratio': np.nan # Or 0?
                 })
                 return results
             else:
                 # If no search_for either, return completely empty structure
                 return pd.DataFrame(columns=['search_for', 'count', 'mean', 'positive_ratio'])

        df['sentiment'] = analyzer.predict(texts)
        print(f"DEBUG [analysis_sentiment]: Added 'sentiment' column. Shape: {df.shape}", file=sys.stderr)

        # Aggregate results
        if 'search_for' in df.columns:
            print("DEBUG [analysis_sentiment]: Grouping results by 'search_for'...", file=sys.stderr)
            results = df.groupby('search_for').agg(
                count=('sentiment', 'size'), # Use size for count, includes all rows
                mean=('sentiment', 'mean'),
                # Handle potential division by zero if count is 0 (though unlikely if we got here)
                positive_ratio=('sentiment', lambda x: (x > 0.5).mean() if not x.empty else np.nan)
            ).reset_index()
            print(f"DEBUG [analysis_sentiment]: Aggregation complete. Result shape: {results.shape}", file=sys.stderr)
            # Sort results
            results = results.sort_values(by='count', ascending=False)
        else:
            # If no 'search_for', aggregate everything into one row
            print("WARN [analysis_sentiment]: 'search_for' column missing. Aggregating all results into one row.", file=sys.stderr)
            total_count = len(df)
            if total_count > 0:
                 mean_sentiment = df['sentiment'].mean()
                 positive_ratio = (df['sentiment'] > 0.5).mean()
                 results = pd.DataFrame([{
                     'search_for': 'Overall', # Assign a default keyword
                     'count': total_count,
                     'mean': mean_sentiment,
                     'positive_ratio': positive_ratio
                 }])
            else: # Should not happen if we passed the earlier check, but for safety
                 results = pd.DataFrame(columns=['search_for', 'count', 'mean', 'positive_ratio'])

        # Final check for NaN in numeric columns and replace with None for JSON compatibility
        results['mean'] = results['mean'].replace({np.nan: None})
        results['positive_ratio'] = results['positive_ratio'].replace({np.nan: None})

        print("DEBUG [analysis_sentiment]: Analysis finished successfully.", file=sys.stderr)
        return results

    except Exception as e:
        print(f"ERROR [analysis_sentiment]: An error occurred during sentiment analysis - {str(e)}", file=sys.stderr)
        import traceback # Import traceback here if not globally imported
        print(traceback.format_exc(), file=sys.stderr)
        # Return an empty DataFrame or re-raise the exception depending on desired behavior
        return pd.DataFrame(columns=['search_for', 'count', 'mean', 'positive_ratio'])

# Example Usage (for testing purposes, won't run when called from analysisBridge.py)
if __name__ == "__main__":
    print("Testing sentiment.py functions...")
    # Create a dummy DataFrame similar to what might come from the CSV
    data = {
        'search_for': ['topic1', 'topic2', 'topic1', 'topic3', 'topic2', 'topic1'],
        'content_all': [
            '这是一个非常好的产品',
            '我不喜欢这个东西',
            '真的很棒，推荐购买',
            '', # Empty string
            '体验太差了',
            None # Missing value
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
