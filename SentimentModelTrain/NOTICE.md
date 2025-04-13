# WeiboSentiment
用各种机器学习对中文微博进行情感分析
语料来源： https://github.com/dengxiuqi/weibo2018
项目源地址：https://github.com/dengxiuqi/WeiboSentiment

---

#### 项目说明
* 训练集10000条语料, 测试集500条语料
* 使用朴素贝叶斯、SVM、XGBoost、LSTM和Bert, 等多种模型搭建并训练二分类模型
* 前3个模型都采用端到端的训练方法
* LSTM先预训练得到Word2Vec词向量, 在训练神经网络
* `Bert`使用的是哈工大的预训练模型, 用Bert的`[CLS]`位输出在一个下游网络上进行finetune。预训练模型需要自行下载:    
    * github下载地址: https://github.com/ymcui/Chinese-BERT-wwm
    * baidu网盘: https://pan.baidu.com/s/16z-ybrqT6wLdy_mLHtywSw  密码: djkj
    * 下载后将文件夹放在`./model`文件夹下, 并将`bert_config.json`改名为`config.json`


---

### bert_weight.ipynb会训练出只有权重的模型。模型更灵活，适合更多场景（本项目使用该代码训练出的模型）


---
#### 实验结果
各种分类器在测试集上的测试结果  

|模型|准确率|AUC|
| :---: | :---: | :---: |
|1.bayes|0.856| - |
|2.svm|0.856| - |
|3.xgboost|0.86| 0.904 |
|4.lstm|0.87| 0.931 |
|5.bert|0.87| 0.929 |

---
#### 注意事项
- 如果出现路径错误，请尝试直接使用本文件夹（SentimentModelTrain）作为工作目录
- requirements.txt中的包版本都比较老，需要自己安装新版本。具体来说就是在python 3.10的基础上，安装pytorch 2.6。然后直接使用pip安装requirements.txt中除torch外的其他包
