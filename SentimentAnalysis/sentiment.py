import torch
import json
from transformers import BertTokenizer, BertModel
from torch import nn
import warnings
import os

warnings.filterwarnings('ignore')

# 模型路径配置（保持私有）
_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model")
_BERT_MODEL_PATH = os.path.join(_MODEL_DIR, "chinese_wwm_pytorch")
_DNN_MODEL_PATH = os.path.join(_MODEL_DIR, "bert_dnn_10_weight_only.model")
_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

class _Net(nn.Module):  # 内部类加下划线
    def __init__(self, input_size):
        super().__init__()
        self.fc = nn.Linear(input_size, 1)
        self.sigmoid = nn.Sigmoid()
    
    def forward(self, x):
        return self.sigmoid(self.fc(x))

def _parse_data(df):
    def parse_json(x):
        try:
            return json.loads(x.replace("'", '"'))
        except:
            return {}
    
    # 保留原始列，新增parsed_json列
    # df['parsed_json'] = df['json_data'].apply(parse_json)
    df['content'] = df['json_data'].apply(lambda x: x.get('content_all', ''))
    return df

class _SentimentAnalyzer:
    def __init__(self):
        self.tokenizer = BertTokenizer.from_pretrained(_BERT_MODEL_PATH)
        self.bert = BertModel.from_pretrained(_BERT_MODEL_PATH).to(_DEVICE)
        
        # 加载DNN模型
        self.model = _Net(input_size=768)  # 根据实际维度调整
        self.model.load_state_dict(
            torch.load(_DNN_MODEL_PATH, map_location=_DEVICE)
        )
        self.model.to(_DEVICE)
        self.model.eval()  # 现在可以正常调用了
    
    def predict(self, texts, batch_size=32):
        predictions = []
        with torch.no_grad():
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i+batch_size]
                tokens = self.tokenizer(
                    batch, 
                    padding=True, 
                    truncation=True, 
                    max_length=512,
                    return_tensors="pt"
                ).to(_DEVICE)
                
                with torch.cuda.amp.autocast():
                    outputs = self.bert(**tokens)
                    cls_embeddings = outputs.last_hidden_state[:, 0]
                    preds = self.model(cls_embeddings)
                
                predictions.extend(preds.cpu().flatten().tolist())
        return predictions

def analysis_sentiment(sql_data):  # 唯一公开接口
    analyzer = _SentimentAnalyzer()
    df = _parse_data(sql_data)
    
    texts = df['content'].tolist()
    df['sentiment'] = analyzer.predict(texts)
    
    results = df.groupby('search_for').agg(
        count=('sentiment', 'count'),
        mean=('sentiment', 'mean'),
        positive_ratio=('sentiment', lambda x: (x > 0.5).mean())
    ).reset_index()
    
    return results.sort_values(by='count', ascending=False)