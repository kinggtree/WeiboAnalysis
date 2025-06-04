sentiment.py脚本旨在对给定文本集进行情感分析。它采用预训练的BERT模型（chinese_wwm_pytorch）作为特征提取器，并在BERT输出层叠加自定义的简单神经网络（_Net）实现二元情感分类（积极/消极）。该脚本采用模块化设计，analysis_sentiment是主要对外接口，同时包含健壮的错误处理、日志记录以及高效模型加载的单例模式。

核心组件与功能：

导入模块：
- torch, torch.nn：PyTorch功能与神经网络构建
- json：预留支持JSON格式输入（当前_parse_data聚焦处理DataFrame列）
- pandas：以DataFrame结构处理输入输出数据
- transformers（BertTokenizer, BertModel）：预训练BERT模型核心库
- warnings：屏蔽可忽略警告
- os：路径操作（定位模型文件）
- sys：向sys.stderr输出调试/警告信息
- numpy：数值运算（特别是聚合与NaN处理）
- traceback：详细错误报告

全局配置常量：
- _MODEL_DIR：模型文件目录路径
- _BERT_MODEL_PATH：中文BERT预训练模型路径
- _DNN_MODEL_PATH：自定义分类头（_Net）的权重文件路径（_weight_only.model表示仅含权重）
- _DEVICE：自动检测CUDA（GPU）可用性并设置运行设备（"cuda"或"cpu"），通过调试打印确认使用设备

_Net(nn.Module)类：
功能：作为BERT嵌入向量上的分类头神经网络
- __init__(self, input_size)：
  input_size：BERT输出向量维度（如BERT-base为768）
  self.fc = nn.Linear(input_size, 1)：全连接层将BERT向量映射为单个输出逻辑值
  self.sigmoid = nn.Sigmoid()：sigmoid激活函数将输出转换为0-1概率值（>0.5为积极，<0.5为消极）
- forward(self, x)：
  定义前向传播：BERT向量x经全连接层和sigmoid函数处理

_parse_data(df_input: pd.DataFrame) -> pd.DataFrame函数：
功能：预处理输入DataFrame并提取情感分析所需文本内容，统一生成'content'列
- df = df_input.copy()：避免修改原始DataFrame
文本提取逻辑：
  1. 优先检查'content_all'列
  2. 若无则检查'content'列
  3. fillna('')：将缺失值替换为空字符串
  4. astype(str)：确保文本列均为字符串类型
  若无上述列则创建空'content'列并发出警告（此时情感分析将无意义）
'search_for'列检查：用于后续结果分组，缺失时发出警告
调试：通过sys.stderr打印DataFrame各阶段形态与列信息

_SentimentAnalyzer类：
功能：封装BERT模型、_Net模型和分词器，负责加载组件与执行预测
单例模式（_instance = None, __new__）：
  确保BERT模型和分词器在Python进程中仅加载一次（即使多次调用_SentimentAnalyzer()）
  在__new__中首次调用时：
  - 加载分词器：self.tokenizer = BertTokenizer.from_pretrained(_BERT_MODEL_PATH)
  - 加载BERT模型：self.bert = BertModel.from_pretrained(_BERT_MODEL_PATH).to(_DEVICE)
  - 初始化_Net：self.model = _Net(input_size=768)
  - 加载_Net权重：self.model.load_state_dict(torch.load(_DNN_MODEL_PATH, map_location=_DEVICE))
  - 设备转移：self.model.to(_DEVICE)
  - 设为评估模式：self.model.eval()
  包含try-except块确保模型加载健壮性

predict(self, texts, batch_size=32)方法：
功能：处理文本列表并返回情感分数列表
输入处理：
  - 空文本列表直接返回空列表
  - 全空文本返回默认中性分数列表（0.5）
批处理：
  - 按batch_size分批处理（提升BERT效率）
批内空字符串处理：
  valid_batch = [t for t in batch if t]：过滤当前批次的空文本
  若valid_batch为空则对该批所有项追加默认分数（0.5）
分词：
  tokens = self.tokenizer(valid_batch, padding=True, truncation=True, max_length=512, return_tensors="pt").to(_DEVICE)：
  - padding=True：短序列填充至批次最大长度
  - truncation=True：超长序列截断
  - max_length=512：BERT标准最大序列长度
  - return_tensors="pt"：返回PyTorch张量
  - .to(_DEVICE)：张量转移至目标设备
推理：
  with torch.no_grad()：禁用梯度计算（节省推理内存）
  if _DEVICE == "cuda": with torch.cuda.amp.autocast()：CUDA环境下使用自动混合精度加速
  outputs = self.bert(**tokens)：将分词输入BERT模型
  cls_embeddings = outputs.last_hidden_state[:, 0]：提取[CLS]标记向量（作为整个序列的表征）
  preds = self.model(cls_embeddings)：将[CLS]向量输入_Net获得最终情感预测
预测映射：
  pred_iter = iter(preds.cpu().flatten().tolist())：将预测值转为CPU上的浮点数列表
  batch_preds = [next(pred_iter) if t else 0.5 for t in batch]：重构预测列表（空文本插入0.5）
错误处理：捕获批次预测异常时追加默认分数

analysis_sentiment(input_data: pd.DataFrame)函数：
功能：脚本主接口，接收DataFrame执行情感分析并返回聚合结果
输入验证：
  - 检查是否为Pandas DataFrame
  - 检查是否为空DataFrame
核心逻辑：
  analyzer = _SentimentAnalyzer()：获取单例分析器实例
  df = _parse_data(input_data)：解析输入DataFrame获取'content'列
  texts = df['content'].tolist()：提取待预测文本
  无效文本处理：若文本全空则根据'search_for'列存在性返回0计数结果或空DataFrame
  df['sentiment'] = analyzer.predict(texts)：预测情感分数并添加新列
聚合：
  存在'search_for'列时：
  df.groupby('search_for').agg(...)：
    - count=('sentiment', 'size')：分组计数
    - mean=('sentiment', 'mean')：分组平均情感分
    - positive_ratio=('sentiment', lambda x: (x > 0.5).mean() if not x.empty else np.nan)：分组积极比例（处理空组）
  results.sort_values(by='count', ascending=False)：按计数排序
  缺失'search_for'列时：
  将所有结果聚合为'Overall'单行
NaN转None：
  results['mean'].replace({np.nan: None})等：将np.nan替换为None（提升JSON序列化兼容性）
错误处理：捕获分析过程中的异常并返回空DataFrame

if __name__ == "__main__": 代码块：
功能：脚本直接运行时执行的示例代码
- 创建含'search_for'和'content_all'列的测试DataFrame（包含空字符串和None等边界案例）
- 测试_parse_data函数
- 测试analysis_sentiment主函数
- 测试无'content_all'列时的回退机制
该设计极佳，适用于开发测试和模块使用演示

总结：
sentiment.py是一个结构完善的中文情感分析Python脚本：
- 采用强大的预训练BERT模型理解中文文本
- 叠加可训练的简单分类层
- 使用单例模式实现高效模型管理
- 通过Pandas DataFrame处理数据输入（含预处理逻辑）
- 支持批量预测并处理空/无效输入
- 提供按关键词分组的结果聚合（计数/平均情感分/积极比例）
- 包含设备自动检测、错误处理、调试日志等最佳实践
- 设计健壮，易于集成到需要文本情感分析的数据处理流程中