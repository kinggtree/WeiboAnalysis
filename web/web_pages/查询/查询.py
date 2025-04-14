from util import db
import streamlit as st
import pandas as pd
from SentimentAnalysis import analysis_sentiment

# ================== MongoDB查询部分 ==================



# 获取所有集合名称（同步方式）
try:
    collection_names = db.sync_get_collection_names()
except Exception as e:
    st.error(f"获取集合列表失败: {str(e)}")
    collection_names = []

# 用户选择集合
selected_collection = st.selectbox(
    "请选择要查询的集合：", 
    collection_names,
    index=0 if collection_names else None
)
# 2. 用户输入查询的 limit 值（0 表示取消 limit，查询全部内容）
limit_value = st.number_input("请输入查询的 limit 值（0 表示查询全部）：", 
                            min_value=0, step=1, value=0, key="limit_value")



# 4. 执行查询按钮
if st.button("执行查询"):
    
    # 执行查询
    try:
        cursor = db.sync_db[selected_collection].find(
            limit=limit_value if limit_value > 0 else 0
        )
        df = pd.DataFrame(list(cursor))
        
        # 处理 ObjectId 类型
        if '_id' in df.columns:
            df['_id'] = df['_id'].astype(str)
        
        st.session_state["mongo_result"] = df
        st.session_state["used_limit"] = limit_value
    except Exception as e:
        st.error(f"查询执行失败：{str(e)}")

# 显示最近一次查询条件
if "mongo_result" in st.session_state:
    st.write(f"查询条件：集合={selected_collection} 限制条数={st.session_state['used_limit']}")

# 5. 展示查询结果
if "mongo_result" in st.session_state:
    df = st.session_state["mongo_result"]
    used_limit = st.session_state.get("used_limit", None)
    
    # 如果用户设置了 limit 为 0
    if used_limit == 0:
        st.write(f"查询结果共有 {df.shape[0]} 条记录（全部数据的行数）")
    else:
        # 处理嵌套的 json_data 字段
        if "json_data" in df.columns:
            # 直接展开嵌套字段（MongoDB 不需要手动解析）
            json_df = pd.json_normalize(df['json_data'])
            df = pd.concat([df.drop('json_data', axis=1), json_df], axis=1)
        
        # 显示内容字段
        display_columns = [col for col in ['search_for', 'uid', 'content_all'] if col in df.columns]
        if display_columns:
            df = df[display_columns]
            df.rename(columns={'content_all': 'content'}, inplace=True)
        
        st.write("查询结果：")
        st.dataframe(df, use_container_width=True)

# ================== 情感分析部分 ==================
st.divider()
analysis_cols = st.columns([10, 1])
analysis_cols[1].button("执行情感分析", key="sentiment_button")

if st.session_state.get("sentiment_button"):
    if "mongo_result" not in st.session_state:
        st.error("请先执行查询获取数据")
    else:
        raw_df = st.session_state.mongo_result.copy()
        
        with st.spinner("正在分析情感（首次使用需加载模型，约需30秒）..."):
            try:
                result_df = analysis_sentiment(raw_df)
                st.session_state["analysis_result"] = result_df
            except Exception as e:
                st.error(f"分析失败: {str(e)}")

if "analysis_result" in st.session_state:
    st.subheader("情感分析结果")
    st.dataframe(
        st.session_state.analysis_result,
        column_config={
            "search_for": "搜索关键词",
            "count": "样本量",
            "mean": "情感均值",
            "positive_ratio": "积极率"
        },
        hide_index=True,
        use_container_width=True
    )
