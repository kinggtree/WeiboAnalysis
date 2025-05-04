import React, { useState } from 'react';
import { Button, DatePicker, Form, Input, Select, Table } from 'antd';

const ListSearch = () => {
  const [form] = Form.useForm();
  const [searchResult, setSearchResult] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (values) => {
    setLoading(true);
    try {
      const response = await fetch('/api/list-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });
      
      const data = await response.json();
      setSearchResult(data);
    } catch (error) {
      console.error('Search failed:', error);
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Form form={form} layout="vertical" onFinish={handleSearch}>
        <Form.Item
          label="搜索内容(话题需要在前后加上#)"
          name="search_for"
          initialValue="原神"
        >
          <Input />
        </Form.Item>

        <Form.Item label="搜索类型" name="kind" initialValue="综合">
          <Select options={[
            { value: '综合', label: '综合' },
            { value: '实时', label: '实时' },
            { value: '高级', label: '高级' }
          ]} />
        </Form.Item>

        <Form.Item
          label="筛选条件"
          name="advanced_kind"
          initialValue="综合"
        >
          <Select
            options={[
              { value: '综合', label: '综合' },
              { value: '热度', label: '热度' },
              { value: '原创', label: '原创' }
            ]}
          />
        </Form.Item>


        <Form.Item label="起始日期" name="start" initialValue="2020-01-01">
          <Input />
        </Form.Item>

        <Form.Item label="结束日期" name="end" initialValue={new Date().toISOString().split('T')[0]}>
          <Input />
        </Form.Item>


        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            搜索
          </Button>
        </Form.Item>
      </Form>

      {searchResult.length > 0 && (
        <Table
          columns={Object.keys(searchResult[0]).map(key => ({
            title: key,
            dataIndex: key,
            key: key
          }))}
          dataSource={searchResult}
          rowKey="id"
          bordered
        />
      )}
    </div>
  );
};

export default ListSearch;
