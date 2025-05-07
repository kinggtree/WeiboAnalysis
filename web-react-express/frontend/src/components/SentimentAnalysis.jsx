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
  const [loading, setLoading] = useState(false); // Note: This state variable is declared but not directly used for Spin components. Consider removing if not needed elsewhere.
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
        console.error("获取集合列表失败:", err.response || err);
        if (err.response) {
          const status = err.response.status;
          if (status === 500) {
            message.error('服务器内部错误');
          } else if (status === 404) {
            message.error('服务器未启动');
          } else {
            const errorDetails = err.response.data?.details || err.response.data?.message || `服务器返回错误状态 ${status}`;
            message.error(`获取集合列表失败: ${errorDetails}`);
          }
        } else if (err.request) {
          // The request was made but no response was received
          message.error('获取集合列表失败: 网络连接错误，请检查服务器状态或您的网络连接。');
        } else {
          // Something happened in setting up the request that triggered an Error
          message.error(`获取集合列表失败: 请求发生错误 - ${err.message}`);
        }
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

      const rawData = res.data.queryData || [];
      const receivedCsvFilename = res.data.csvFilename;

       let processedData = rawData;
       if (Array.isArray(rawData) && rawData.some(item => item && typeof item.json_data === 'object' && item.json_data !== null)) {
         processedData = rawData.map(item => {
            if (item && typeof item === 'object') {
                const { json_data, ...rest } = item;
                if (typeof json_data === 'object' && json_data !== null) {
                     const filteredJsonData = {};
                     for (const key in json_data) {
                         if (!(key in rest)) {
                             filteredJsonData[key] = json_data[key];
                         }
                     }
                    return { ...rest, ...filteredJsonData };
                }
                 return rest;
            }
            return item;
         });
       }

      setQueryResult(processedData);
      setCsvFilename(receivedCsvFilename);

      if (processedData.length === 0) {
          message.info('查询成功，但未找到符合条件的数据。');
      } else {
          message.success(`查询成功，共获取 ${processedData.length} 条数据。`);
      }

    } catch (err) {
       console.error("查询失败:", err.response || err);
       if (err.response) {
         const status = err.response.status;
         if (status === 500) {
           message.error('服务器内部错误');
         } else if (status === 404) {
           message.error('服务器未启动');
         } else {
           const errorDetails = err.response.data?.details || err.response.data?.message || `服务器返回错误状态 ${status}`;
           message.error(`查询失败: ${errorDetails}`);
         }
       } else if (err.request) {
         message.error('查询失败: 网络连接错误，请检查服务器状态或您的网络连接。');
       } else {
         message.error(`查询失败: 请求发生错误 - ${err.message}`);
       }
       setQueryResult([]);
       setCsvFilename(null);
    } finally {
        setQueryLoading(false);
    }
  };

  // 执行情感分析
  const handleAnalysis = async () => {
    if (!csvFilename) {
        message.warning('没有可供分析的数据文件。请先执行查询。');
        return;
    }
    setAnalysisLoading(true);
    setAnalysisResult(null);

    try {
      const res = await axios.post('/api/analysis/sentiment', {
        csvFilename: csvFilename
      });
      setAnalysisResult(res.data);
      message.success('情感分析执行成功！');
    } catch (err) {
      console.error("分析失败:", err.response || err);
      if (err.response) {
        const status = err.response.status;
        if (status === 500) {
          message.error('服务器内部错误');
        } else if (status === 404) {
          message.error('服务器未启动');
        } else {
          const errorDetails = err.response.data?.details || err.response.data?.message || `服务器返回错误状态 ${status}`;
          message.error(`分析失败: ${errorDetails}`);
        }
      } else if (err.request) {
        message.error('分析失败: 网络连接错误，请检查服务器状态或您的网络连接。');
      } else {
        message.error(`分析失败: 请求发生错误 - ${err.message}`);
      }
      setAnalysisResult(null);
    } finally {
        setAnalysisLoading(false);
    }
  };

  // 表格列配置 (保持不变)
  const queryColumns = [
    { title: 'ID', dataIndex: '_id', key: '_id', width: 150, ellipsis: true },
    { title: '搜索关键词', dataIndex: 'search_for', key: 'search_for', width: 150, ellipsis: true },
    { title: '用户昵称', dataIndex: 'personal_name', key: 'personal_name', width: 150, ellipsis: true },
    { title: '内容', dataIndex: 'content_all', key: 'content', render: text => text || '-' },
  ];

  const analysisColumns = [
    { title: '关键词', dataIndex: 'search_for', key: 'search_for' },
    { title: '样本量', dataIndex: 'count', key: 'count' },
    {
      title: '情感均值',
      dataIndex: 'mean',
      key: 'mean',
      render: value => (value !== null && value !== undefined) ? value.toFixed(2) : '-'
    },
    {
      title: '积极率',
      dataIndex: 'positive_ratio',
      key: 'positive_ratio',
      render: value => (value !== null && value !== undefined) ? `${(value * 100).toFixed(1)}%` : '-'
    }
  ];

  return (
    <div className="sentiment-container" style={{ padding: 24 }}>
      <Spin spinning={collectionsLoading} tip="加载集合列表中...">
          <div className="query-section" style={{ marginBottom: 24 }}>
            <div className="query-controls" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Select
                style={{ minWidth: 250 }}
                options={collections.map(c => ({ label: c, value: c }))}
                value={selectedCollection}
                onChange={setSelectedCollection}
                placeholder="选择集合"
                loading={collectionsLoading}
                disabled={collectionsLoading || queryLoading || analysisLoading}
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
                onChange={value => setLimit(value === null ? 0 : value)}
                placeholder="查询条数 (0为不限制)"
                 style={{ width: 180 }}
                disabled={collectionsLoading || queryLoading || analysisLoading}
              />

              <Button
                type="primary"
                onClick={handleQuery}
                loading={queryLoading}
                disabled={collectionsLoading || queryLoading || analysisLoading || !selectedCollection}
              >
                执行查询
              </Button>
            </div>

            <Spin spinning={queryLoading} tip="查询中...">
                {queryResult && (
                <div className="query-result" style={{ marginTop: 24 }}>
                    <Divider orientation="left">查询结果（共 {queryResult.length} 条）{csvFilename && `| 文件名: ${csvFilename}`}</Divider>
                    {queryResult.length > 0 ? (
                         <Table
                            columns={queryColumns}
                            dataSource={queryResult}
                            rowKey={(record, index) => record._id || `query-${index}`}
                            scroll={{ x: 'max-content' }}
                            bordered
                            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'] }}
                         />
                    ) : (
                        <Alert message="没有查询到数据" type="info" showIcon style={{marginTop: 10}} />
                    )}
                </div>
                )}
             </Spin>
          </div>
      </Spin>

      <Divider />

      <div className="analysis-section">
        <div style={{ textAlign: 'right', marginBottom: 16 }}>
          <Button
            type="primary"
            onClick={handleAnalysis}
            disabled={!csvFilename || analysisLoading || queryLoading || collectionsLoading}
            loading={analysisLoading}
          >
            执行情感分析
          </Button>
        </div>

        <Spin spinning={analysisLoading} tip="分析中...">
            {analysisResult && (
            <>
                <Divider orientation="left">情感分析结果</Divider>
                {analysisResult.length > 0 ? (
                    <Table
                    columns={analysisColumns}
                    dataSource={analysisResult}
                    rowKey={(record, index) => record.search_for || `analysis-${index}`}
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
