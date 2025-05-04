import React, { useState, useEffect } from 'react';
import {
  Select, InputNumber, Button, Table,
  Divider, Alert, Spin, message // 引入 message 用于提示
} from 'antd';
import axios from 'axios';

const SentimentAnalysis = () => {
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [limit, setLimit] = useState(1000);
  const [queryResult, setQueryResult] = useState(null); // 存储用于显示的查询结果
  const [csvFilename, setCsvFilename] = useState(null); // **新增：存储CSV文件名**
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false); // 查询按钮的loading
  const [analysisLoading, setAnalysisLoading] = useState(false); // 分析按钮的loading
  const [collectionsLoading, setCollectionsLoading] = useState(true);

  // 获取集合列表
  useEffect(() => {
    setCollectionsLoading(true);
    axios.get('/api/analysis/collections')
      .then(res => {
        setCollections(res.data || []); // 添加 || [] 防止 undefined
      })
      .catch(err => {
        console.error("获取集合列表失败:", err.response?.data || err.message);
        message.error(`获取集合列表失败: ${err.response?.data?.details || err.message}`);
        setCollections([]);
      })
      .finally(() => {
          setCollectionsLoading(false);
      });
  }, []);

  // 执行查询
  const handleQuery = async () => {
    if (!selectedCollection) {
        message.warning('请先选择一个集合');
        return;
    }
    setQueryLoading(true);
    setQueryResult(null); // 清空旧结果
    setCsvFilename(null);  // 清空旧文件名
    setAnalysisResult(null); // 清空旧分析结果

    try {
      const res = await axios.post('/api/analysis/query', {
        collection: selectedCollection,
        limit: limit || 0
      });

      // **修改：同时设置查询结果和CSV文件名**
      const rawData = res.data.queryData || []; // 从返回对象中获取 queryData
      const receivedCsvFilename = res.data.csvFilename; // 从返回对象中获取 csvFilename

      // console.log("收到的原始数据:", rawData); // Debug
      // console.log("收到的CSV文件名:", receivedCsvFilename); // Debug

      // --- 前端数据处理逻辑保持不变 ---
       let processedData = rawData;
       if (Array.isArray(rawData) && rawData.some(item => item && typeof item.json_data === 'object' && item.json_data !== null)) {
         processedData = rawData.map(item => {
            // 确保 item 是对象并且 json_data 存在
            if (item && typeof item === 'object') {
                const { json_data, ...rest } = item;
                 // 只有当 json_data 是对象时才展开
                if (typeof json_data === 'object' && json_data !== null) {
                     // 防止json_data中的字段覆盖外部字段 (可选，根据需要决定)
                     const filteredJsonData = {};
                     for (const key in json_data) {
                         if (!(key in rest)) {
                             filteredJsonData[key] = json_data[key];
                         } else {
                             // console.warn(`字段 "${key}" 在 json_data 和外部同时存在，保留外部值。`);
                         }
                     }
                    return { ...rest, ...filteredJsonData };
                }
                 return rest; // 如果 json_data 不是对象，返回原始 item (去掉 json_data)
            }
            return item; // 如果 item 不是对象，直接返回
         });
       }
       // --- 数据处理结束 ---

      setQueryResult(processedData);
      setCsvFilename(receivedCsvFilename); // 设置收到的文件名

      if (processedData.length === 0) {
          message.info('查询成功，但未找到符合条件的数据。');
      } else {
          message.success(`查询成功，共获取 ${processedData.length} 条数据。`);
      }

    } catch (err) {
       console.error("查询失败:", err.response?.data || err.message);
       message.error(`查询失败: ${err.response?.data?.details || err.message}`);
       setQueryResult([]); // 查询失败设为空数组，避免 Table 出错
       setCsvFilename(null);
    } finally {
        setQueryLoading(false);
    }
  };

  // 执行情感分析
  const handleAnalysis = async () => {
    if (!csvFilename) { // **修改：检查是否有 csvFilename**
        message.warning('没有可供分析的数据文件。请先执行查询。');
        return;
    }
    setAnalysisLoading(true);
    setAnalysisResult(null); // 清空旧结果

    try {
      // **修改：发送包含 csvFilename 的请求**
      const res = await axios.post('/api/analysis/sentiment', {
        csvFilename: csvFilename // 只发送文件名
      });
      setAnalysisResult(res.data);
      message.success('情感分析执行成功！');
    } catch (err) {
      console.error("分析失败:", err.response?.data || err.message);
      message.error(`分析失败: ${err.response?.data?.details || err.message}`);
      setAnalysisResult(null);
    } finally {
        setAnalysisLoading(false);
    }
  };

  // 表格列配置 (保持不变)
  const queryColumns = [
    { title: 'ID', dataIndex: '_id', key: '_id', width: 150, ellipsis: true }, // 添加_id显示
    { title: '搜索关键词', dataIndex: 'search_for', key: 'search_for', width: 150, ellipsis: true },
    { title: '用户昵称', dataIndex: 'personal_name', key: 'personal_name', width: 150, ellipsis: true },
    { title: '内容', dataIndex: 'content_all', key: 'content', render: text => text || '-' }, // 保持 content_all
    // 可以根据需要添加其他从json_data展平的列
    // { title: 'Json UID', dataIndex: 'json_uid', key: 'json_uid', width: 150 },
  ];

  const analysisColumns = [
    { title: '关键词', dataIndex: 'search_for', key: 'search_for' },
    { title: '样本量', dataIndex: 'count', key: 'count' },
    {
      title: '情感均值',
      dataIndex: 'mean',
      key: 'mean',
      render: value => (value !== null && value !== undefined) ? value.toFixed(2) : '-' // 添加空值处理
    },
    {
      title: '积极率',
      dataIndex: 'positive_ratio',
      key: 'positive_ratio',
      render: value => (value !== null && value !== undefined) ? `${(value * 100).toFixed(1)}%` : '-' // 添加空值处理
    }
  ];

  // 计算查询结果表格的动态列 (可选，如果需要显示所有列)
//   const dynamicQueryColumns = queryResult && queryResult.length > 0
//     ? Object.keys(queryResult[0]).map(key => ({
//         title: key,
//         dataIndex: key,
//         key: key,
//         ellipsis: true, // 对长内容启用省略
//         width: 150, // 给个默认宽度
//         render: (text) => text === null || text === undefined ? '-' : String(text), // 处理 null/undefined
//       }))
//     : queryColumns; // 如果没有数据，使用默认列配置

  return (
    <div className="sentiment-container" style={{ padding: 24 }}>
      {/* Spin for overall loading */}
      <Spin spinning={collectionsLoading} tip="加载集合列表中...">
          <div className="query-section" style={{ marginBottom: 24 }}>
            <div className="query-controls" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}> {/* 添加 flexWrap */}
              <Select
                style={{ minWidth: 250 }} // 使用 minWidth
                options={collections.map(c => ({ label: c, value: c }))}
                value={selectedCollection}
                onChange={setSelectedCollection}
                placeholder="选择集合"
                loading={collectionsLoading}
                disabled={collectionsLoading || queryLoading || analysisLoading} // 任何加载状态都禁用
                notFoundContent={
                  collectionsLoading ? (
                    <span style={{ padding: 8 }}><Spin size="small" /> 加载中...</span>
                  ) : (
                    <span style={{ padding: 8 }}>无可用集合</span>
                  )
                }
              />

              <InputNumber
                min={0}
                value={limit}
                onChange={value => setLimit(value === null ? 0 : value)} // 处理清空输入框的情况
                placeholder="查询条数 (0为不限制)"
                 style={{ width: 180 }}
                disabled={collectionsLoading || queryLoading || analysisLoading}
              />

              <Button
                type="primary"
                onClick={handleQuery}
                loading={queryLoading} // 使用独立的loading状态
                disabled={collectionsLoading || queryLoading || analysisLoading || !selectedCollection} // 添加 !selectedCollection 禁用条件
              >
                执行查询
              </Button>
            </div>

            {/* 使用 Spin 包裹查询结果 */}
            <Spin spinning={queryLoading} tip="查询中...">
                {queryResult && ( // 只有当 queryResult 不是 null 时才渲染
                <div className="query-result" style={{ marginTop: 24 }}>
                    <Divider orientation="left">查询结果（共 {queryResult.length} 条）{csvFilename && `| 文件名: ${csvFilename}`}</Divider> {/* 显示文件名 */}
                    {queryResult.length > 0 ? (
                         <Table
                            // columns={dynamicQueryColumns} // 使用动态列或固定列
                            columns={queryColumns} // 使用固定列
                            dataSource={queryResult}
                            rowKey={(record, index) => record._id || `query-${index}`} // 优先使用_id，否则用索引
                            scroll={{ x: 'max-content' }} // 让表格内容决定宽度
                            bordered
                            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'] }} // 添加分页选项
                         />
                    ) : (
                        <Alert message="没有查询到数据" type="info" showIcon style={{marginTop: 10}} />
                    )}
                </div>
                )}
             </Spin>
          </div>
      </Spin> {/* End of collections loading Spin */}

      <Divider />

      <div className="analysis-section">
        <div style={{ textAlign: 'right', marginBottom: 16 }}>
          <Button
            type="primary"
            onClick={handleAnalysis}
            // **修改：禁用条件现在检查 csvFilename**
            disabled={!csvFilename || analysisLoading || queryLoading || collectionsLoading}
            loading={analysisLoading} // 使用独立的loading状态
          >
            执行情感分析
          </Button>
        </div>

        {/* 使用 Spin 包裹分析结果 */}
        <Spin spinning={analysisLoading} tip="分析中...">
            {analysisResult && ( // 只有当 analysisResult 不是 null 时才渲染
            <>
                <Divider orientation="left">情感分析结果</Divider>
                {analysisResult.length > 0 ? (
                    <Table
                    columns={analysisColumns}
                    dataSource={analysisResult}
                    rowKey={(record, index) => record.search_for || `analysis-${index}`} // 优先使用 search_for，否则用索引
                    bordered
                    pagination={false}
                    />
                 ) : (
                     <Alert message="分析完成，但没有生成结果数据" type="info" showIcon style={{marginTop: 10}}/>
                 )}
            </>
            )}
        </Spin>
      </div>
    </div>
  );
};

export default SentimentAnalysis;