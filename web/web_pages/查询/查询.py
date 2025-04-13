from util import db
import streamlit as st
import pandas as pd
import json
from SentimentAnalysis import analysis_sentiment

# ================== SQL查询部分 ==================
# 1. 用户选择需要查询的表
table_name = st.selectbox("请选择要查询的表：", ["BodyRecord", "Comment1Record", "Comment2Record"])

# 2. 用户输入查询的 limit 值（0 表示取消 limit，查询全部内容）
limit_value = st.number_input("请输入查询的 limit 值（0 表示查询全部）：", min_value=0, step=1, value=100, key="limit_value")

# 3. 从所选表中获取所有不重复的 search_for 值，供用户选择
query_distinct = f"SELECT DISTINCT search_for FROM {table_name};"
distinct_df = pd.DataFrame(db.sql(query_distinct))
if not distinct_df.empty and "search_for" in distinct_df.columns:
    unique_search_for = distinct_df["search_for"].dropna().unique().tolist()
else:
    unique_search_for = []

if unique_search_for:
    selected_search_for = st.selectbox("请选择 search_for：", unique_search_for)
else:
    selected_search_for = None
    st.write("该表中没有获取到 search_for 数据。")

# 4. 执行查询按钮
if st.button("执行查询"):
    # 如果输入的 limit 大于 1000，则提示不显示查询结果
    if limit_value > 1000:
        st.write("limit 值大于 1000，出于性能考虑不显示查询结果。")
        if "sql_result" in st.session_state:
            del st.session_state["sql_result"]
        if "last_sql_query" in st.session_state:
            del st.session_state["last_sql_query"]
    else:
        # 构造 SQL 查询语句
        sql_query = f"SELECT * FROM {table_name} "
        if selected_search_for:
            sql_query += f"WHERE search_for = '{selected_search_for}' "
        # 如果 limit_value 为 0，则不追加 LIMIT 限制
        if limit_value != 0:
            sql_query += f"LIMIT {limit_value};"
        else:
            sql_query += ";"
        
        # 将SQL查询语句存入会话状态
        st.session_state["last_sql_query"] = sql_query
        
        try:
            df = pd.DataFrame(db.sql(sql_query))
            st.session_state["sql_result"] = df
            st.session_state["used_limit"] = limit_value  # 保存此次使用的 limit 值
        except Exception as e:
            st.error(f"查询执行失败：{e}")

# 显示最近一次执行的SQL语句（新增部分）
if "last_sql_query" in st.session_state:
    st.write("执行的 SQL 语句为：", st.session_state["last_sql_query"])

# 5. 展示查询结果
if "sql_result" in st.session_state:
    df = st.session_state["sql_result"]
    used_limit = st.session_state.get("used_limit", None)
    
    # 如果用户设置了 limit 为 0（即查询全部内容），则只显示结果行数
    if used_limit == 0:
        st.write(f"查询结果共有 {df.shape[0]} 条记录（全部数据的行数）")
    else:
        # 如返回结果中包含 json_data 字段，则解析并提取 content_all 字段
        if "json_data" in df.columns:
            def parse_json(x):
                try:
                    return json.loads(x.replace("'", '"'))
                except Exception:
                    return {}
            df['json_data'] = df['json_data'].apply(parse_json)
            df['content'] = df['json_data'].apply(lambda x: x.get('content_all', ''))
        
        # 将 uid 列转换为字符串，避免显示时出现千位分隔
        if "uid" in df.columns:
            df['uid'] = df['uid'].astype(str)
        
        # 只保留需要显示的列（如果存在）
        display_columns = [col for col in ['search_for', 'uid', 'content'] if col in df.columns]
        if display_columns:
            df = df[display_columns]
        
        st.write("原始查询结果：")
        st.write(df)

# ================== 情感分析部分 ==================
st.divider()
analysis_cols = st.columns([10, 1])
analysis_cols[1].button("执行情感分析", key="sentiment_button")

if st.session_state.get("sentiment_button"):
    if "sql_result" not in st.session_state:
        st.error("请先执行SQL查询获取数据")
    else:
        # 关键修改：创建原始数据的副本，避免污染原始数据
        raw_df = st.session_state.sql_result.copy()  # 新增 .copy()
        
        with st.spinner("正在分析情感（首次使用需加载模型，约需30秒）..."):
            try:
                # 将副本传入分析函数，确保原始数据不被修改
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