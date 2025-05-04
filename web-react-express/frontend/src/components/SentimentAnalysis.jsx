import React, { useState, useEffect } from 'react';
import { 
  Select, InputNumber, Button, Table, 
  Divider, Alert, Spin 
} from 'antd';
import axios from 'axios';

const SentimentAnalysis = () => {
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [limit, setLimit] = useState(0);
  const [queryResult, setQueryResult] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // 获取集合列表
  useEffect(() => {
    axios.get('/api/analysis/collections')
      .then(res => setCollections(res.data))
      .catch(err => console.error(err));
  }, []);

  // 执行查询
  const handleQuery = async () => {
    setLoading(true);
    try {
      const res = await axios.post('/api/analysis/query', {
        collection: selectedCollection,
        limit: limit || 0
      });
      
      const rawData = res.data;
      let processedData = rawData;

      // 处理嵌套字段
      if (rawData.some(item => item.json_data)) {
        processedData = rawData.map(item => ({
          ...item,
          ...item.json_data,
          json_data: undefined
        }));
      }

      setQueryResult(processedData);
    } catch (err) {
      Alert.error(`查询失败: ${err.message}`);
    }
    setLoading(false);
  };

  // 执行情感分析
  const handleAnalysis = async () => {
    setLoading(true);
    try {
      const res = await axios.post('/api/analysis/sentiment', {
        data: queryResult
      });
      
      setAnalysisResult(res.data);
    } catch (err) {
      Alert.error(`分析失败: ${err.message}`);
    }
    setLoading(false);
  };

  // 表格列配置
  const queryColumns = [
    { title: '搜索关键词', dataIndex: 'search_for', key: 'search_for' },
    { title: '用户昵称', dataIndex: 'personal_name', key: 'personal_name' },
    { title: '内容', dataIndex: 'content_all', key: 'content', render: text => text || '-' },
  ];

  const analysisColumns = [
    { title: '关键词', dataIndex: 'search_for', key: 'search_for' },
    { title: '样本量', dataIndex: 'count', key: 'count' },
    { 
      title: '情感均值', 
      dataIndex: 'mean', 
      key: 'mean',
      render: value => value?.toFixed(2) 
    },
    { 
      title: '积极率', 
      dataIndex: 'positive_ratio', 
      key: 'positive_ratio',
      render: value => `${(value * 100).toFixed(1)}%`
    }
  ];

  return (
    <div className="sentiment-container" style={{ padding: 24 }}>
      <div className="query-section" style={{ marginBottom: 24 }}>
        <div className="query-controls" style={{ display: 'flex', gap: 16 }}>
          <Select
            style={{ width: 300 }}
            options={collections.map(c => ({ label: c, value: c }))}
            value={selectedCollection}
            onChange={setSelectedCollection}
            placeholder="选择集合"
          />

          <InputNumber
            min={0}
            value={limit}
            onChange={setLimit}
            placeholder="Limit值"
          />

          <Button 
            type="primary" 
            onClick={handleQuery}
            loading={loading}
          >
            执行查询
          </Button>
        </div>

        {queryResult && (
          <div className="query-result" style={{ marginTop: 24 }}>
            <Divider orientation="left">查询结果（共 {queryResult.length} 条）</Divider>
            <Table
              columns={queryColumns}
              dataSource={queryResult}
              rowKey="_id"
              scroll={{ x: true }}
              bordered
              pagination={{ pageSize: 10 }}
            />
          </div>
        )}
      </div>

      <Divider />

      <div className="analysis-section">
        <div style={{ textAlign: 'right', marginBottom: 16 }}>
          <Button
            type="primary"
            onClick={handleAnalysis}
            disabled={!queryResult}
            loading={loading}
          >
            执行情感分析
          </Button>
        </div>

        {analysisResult && (
          <>
            <Divider orientation="left">情感分析结果</Divider>
            <Table
              columns={analysisColumns}
              dataSource={analysisResult}
              rowKey="search_for"
              bordered
              pagination={false}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default SentimentAnalysis;
