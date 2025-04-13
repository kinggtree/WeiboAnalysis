import streamlit as st
from util import get_list_data, db, BodyRecord, process_list_documents
from datetime import date
import re

cols = st.columns([3, 3, 2, 2, 2, 2, 2, 2], vertical_alignment="bottom")

# 搜索内容输入框
cols[0].text_input(
    "搜索内容(话题需要在前后加上#)",
    value="姜平",
    key="search_for"
)

# 自动生成安全表名
def generate_safe_table_name(search_text):
    # 移除非法字符（保留中文、字母、数字和下划线）
    cleaned = re.sub(r'[^\u4e00-\u9fa5a-zA-Z0-9_]', '', search_text)
    # 添加前缀防止保留字冲突
    return f"search_{cleaned}"[:63]  # 限制长度

# 实时显示生成的表名
cols[1].markdown(
    f"**存储表名**<br>`{generate_safe_table_name(st.session_state.search_for)}`",
    unsafe_allow_html=True
)

# 其他表单元素保持不变...
cols[2].selectbox("搜索类型", options=["综合", "实时", "高级"], key="kind")
cols[3].selectbox("筛选条件", options=["综合", "热度", "原创"], key="advanced_kind", 
                 disabled=st.session_state["kind"] != "高级")
cols[4].date_input("起始时间", value="today", min_value=date(year=2000, month=1, day=1), 
                 key="start", disabled=st.session_state["kind"] != "高级")
cols[5].date_input("结束时间", value="today", key="end", 
                 min_value=date(year=2000, month=1, day=1), 
                 disabled=st.session_state["kind"] != "高级")

cols[-1].button("搜索", type="primary", key="list_button")

if st.session_state["list_button"]:
    if not st.session_state["search_for"]:
        st.warning("搜索内容不能为空")
    else:
        # 获取最终表名
        final_table = generate_safe_table_name(st.session_state.search_for)
        
        with st.spinner("搜索中(进展在控制台)..."):
            res_ids = get_list_data(
                search_for=st.session_state["search_for"],
                table_name=f'"{final_table}"',  # SQLite特殊字符处理
                kind=st.session_state["kind"],
                advanced_kind=st.session_state["advanced_kind"],
                time_start=st.session_state["start"],
                time_end=st.session_state["end"]
            )
        
        with st.spinner("导入中(进展在控制台)..."):
            records = db.sync_get_records_by_ids(BodyRecord, res_ids)
            documents = [record.json_data for record in records]
            st.session_state["list"] = process_list_documents(documents)

if "list" in st.session_state:
    st.dataframe(st.session_state["list"])