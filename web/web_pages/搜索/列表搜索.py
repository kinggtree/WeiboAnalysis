import streamlit as st
from util import get_list_data, db, BodyRecord, process_list_documents
from datetime import date
import re
from pypinyin import slug, Style  # 需要安装 pypinyin 库


cols = st.columns([3, 3, 2, 2, 2, 2, 2, 2], vertical_alignment="bottom")

# 搜索内容输入框
cols[0].text_input(
    "搜索内容(话题需要在前后加上#)",
    value="原神",
    key="search_for"
)

# 自动生成安全集合名称
# 修改后（MongoDB 集合名风格）
# 列表搜索.py（更新集合名称生成和调用）
def generate_safe_collection_name(search_text: str) -> str:
    """生成符合 MongoDB 规范的集合名称（支持中文转拼音）"""
    
    # 第一步：原始清理（处理英文/数字的情况）
    cleaned = re.sub(r'[^a-z0-9_]', '', search_text.lower())
    
    # 第二步：如果原始清理结果为空（说明是纯中文或无效字符）
    if not cleaned:
        # 将中文转换为拼音（示例："测试" → "ce_shi"）
        pinyin_str = slug(
            search_text,
            style=Style.NORMAL,
            separator='_'       # 明确指定分隔符
        ).lower()                # 统一转换为小写
        
        # 对拼音结果再次清理（确保没有漏网之鱼）
        cleaned = re.sub(r'[^a-z0-9_]', '', pinyin_str)
        
        # 兜底处理：如果仍然为空，使用默认值
        if not cleaned:
            cleaned = "default"

    # 处理以数字开头的情况
    if cleaned[0].isdigit():
        cleaned = f"col_{cleaned}"

    # 组合最终名称并截断
    return f"search_{cleaned}"[:63]

# 实时显示生成的集合名称
cols[1].markdown(
    f"**存储集合名称**<br>`{generate_safe_collection_name(st.session_state.search_for)}`",
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
        # 获取最终集合名称
        collection_name = generate_safe_collection_name(st.session_state.search_for)

        
        with st.spinner("搜索中(进展在控制台)..."):
            res_ids = get_list_data(
                search_for=st.session_state["search_for"],
                table_name=collection_name,  # 传递集合名称
                kind=st.session_state["kind"],
                advanced_kind=st.session_state["advanced_kind"],
                time_start=st.session_state["start"],
                time_end=st.session_state["end"]
            )
        
        with st.spinner("导入中(进展在控制台)..."):
            # 直接从集合查询
            records = db.sync_get_records_by_ids(
                collection_name=collection_name,
                ids=res_ids
            )
            documents = [record["json_data"] for record in records]
            st.session_state["list"] = process_list_documents(documents)

if "list" in st.session_state:
    st.dataframe(st.session_state["list"])