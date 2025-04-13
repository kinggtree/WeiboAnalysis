### 项目源地址
https://github.com/zhouyi207/WeiBoCrawler

### 进度
目前暂未实现一级，二级评论搜索，详细页搜索这三个功能的数据处理

情感分析仅限于帖子，评论暂时无法获取

### 项目简介

该项目为微博数据爬取并且进行情感分析。具体分为两个步骤
- 首先对微博进行数据采集，包括微博详细页内容、微博评论内容、微博转发量、微博点赞量，微博评论量等信息
- 然后使用预训练模型对每条微博进行情感分析，然后统计整体情感倾向

### 项目特点

- **简单:** 快速上手，只需几行代码即可完成数据采集。
- **高效:** 采用异步请求和异步存储的方式，大大提高数据采集效率。
- **可视化:** 利用 streamlit 编写了一个可视化界面，方便用户进行数据采集和数据查询。
- **数据库:** 将 tinydb 改为 SQL 数据库，可以连接自定义数据库。
- **Cookies:** 不需要手动输入 cookies，扫码自动获取 cookies。
- **多模型可供选择:** 可以训练多个不同模型，并且使用这些模型进行情感分析



### 安装依赖

在项目根目录下使用 **pip 命令安装依赖**，注意这里的 Python 版本是 3.10 版本。

```bash
pip install -r requirements.txt
```

### 运行程序

在项目根目录下使用 **streamlit 命令运行程序**。

注意：如果使用anaconda，需要在anaconda powershell prompt中切换到对应python环境后再运行

```bash
streamlit run web/main.py
```

或者使用startProgram.ps1脚本直接运行（需要修改路径）


## 项目相关

### 1. 主体处理

<div align=center>
<img src="./Images/微博主体处理流程.png"  width=540 style="margin-top:30px;margin-bottom:20px"></img>
</div>

### 2. UID 和 MID

<div align=center>
<img src="./Images/各种ID.png"  width=600 style="margin-top:30px;margin-bottom:20px"></img>
</div>

### 3. 数据流向

<div align=center>
<img src="./Images/数据流向.png"  width=600 style="margin-top:30px;margin-bottom:20px"></img>
</div>


