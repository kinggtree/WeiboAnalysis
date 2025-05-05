import React, { useState, useEffect } from 'react';
import { Button, DatePicker, Form, Input, Select, Table, message } from 'antd';

const ListSearch = () => {
  const [form] = Form.useForm();
  const [dataSource, setDataSource] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 25,
    total: 0,
  });
  const [searchId, setSearchId] = useState(null);

  // --- fetchPageData function remains the same ---
  const fetchPageData = async (sId, page, pageSize) => {
    setLoading(true);
    const url = `/api/list-search/page?searchId=${sId}&page=${page}&pageSize=${pageSize}`;
    try {
      const response = await fetch(url, { method: 'GET' });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 404) {
             message.error(errorData.message || '缓存已过期或未找到，请重新搜索。');
             setSearchId(null);
             setDataSource([]);
             setPagination(prev => ({ ...prev, total: 0, current: 1 }));
        } else {
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return;
      }
      const result = await response.json();
      if (result.status === 'success') {
        setDataSource(result.data);
        setPagination({
          current: result.pagination.current,
          pageSize: result.pagination.pageSize,
          total: result.pagination.total,
        });
      } else {
         message.error(result.message || '获取分页数据失败');
      }
    } catch (error) {
      console.error('Fetch page failed:', error);
      message.error(`请求分页失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- handleSearch function remains the same ---
   const handleSearch = async (values) => {
    setLoading(true);
    setSearchId(null);
    setDataSource([]);
    setPagination(prev => ({ ...prev, current: 1, total: 0 }));

    try {
      const response = await fetch('/api/list-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.status === 'success') {
        if (result.searchId && result.data.length > 0) {
            setDataSource(result.data);
            setPagination(result.pagination);
            setSearchId(result.searchId);
            if (result.pagination.total === 0) {
                 message.info('搜索成功，但未找到相关结果。');
            }
        } else {
             message.info('搜索成功，但未找到相关结果。');
             setDataSource([]);
             setPagination(prev => ({ ...prev, total: 0, current: 1 }));
             setSearchId(null);
        }
      } else {
         message.error(result.message || '搜索失败');
         setSearchId(null);
      }
    } catch (error) {
      console.error('Search failed:', error);
      message.error(`搜索请求失败: ${error.message}`);
      setSearchId(null);
      setDataSource([]);
      setPagination(prev => ({ ...prev, total: 0, current: 1 }));
    } finally {
      setLoading(false);
    }
  };

  // --- handleTableChange function remains the same ---
  const handleTableChange = (newPagination, filters, sorter) => {
    if (searchId && newPagination.current !== pagination.current) {
        fetchPageData(
            searchId,
            newPagination.current,
            newPagination.pageSize
        );
    } else if (searchId && newPagination.pageSize !== pagination.pageSize) {
         fetchPageData(
            searchId,
            1,
            newPagination.pageSize
        );
    } else if (!searchId) {
        message.warn('请先执行搜索操作。');
         setPagination(prev => ({
            ...prev,
            current: newPagination.current,
            pageSize: newPagination.pageSize,
        }));
    }
  };

  // --- Dynamic Columns: Add width ---
  const columns = dataSource.length > 0
    ? Object.keys(dataSource[0]).map(key => ({
        title: key,
        dataIndex: key,
        key: key,
        // --- 添加列宽 ---
        // 你可以根据 key 的不同设置不同的宽度
        // 例如：if (key === 'id') return { ..., width: 80 };
        // 这里给一个统一的默认宽度，你可以按需调整
        width: 150, // 给每列一个基础宽度，例如 150px
        // 如果某列内容特别长，可以给它更大的宽度，或者不设置宽度让它自适应
        // ellipsis: true, // 可以选择性地为长文本列添加省略号
      }))
    : [];

  // --- 计算一个合适的 scroll.x 值 ---
  // 简单的计算方法：列数 * 每列宽度 + 额外空间
  // 或者直接设置一个足够大的固定值，或者使用 'max-content'
  const scrollX = columns.length > 0
                  ? columns.reduce((acc, col) => acc + (col.width || 150), 0) // 基于设置的宽度计算
                  : '100%'; // 如果没有列，则不需要滚动
  // 或者直接设置一个较大的固定值: const scrollX = 2000;
  // 或者使用 'max-content': const scrollX = 'max-content'; (推荐，如果浏览器支持良好)


  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Form form={form} layout="vertical" onFinish={handleSearch}>
        {/* ... Form Items ... */}
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
          <Button type="primary" htmlType="submit" loading={loading && !searchId}>
            搜索
          </Button>
        </Form.Item>
      </Form>

      <Table
        columns={columns}
        dataSource={dataSource}
        rowKey={(record, index) => record.id || `row-${pagination.current}-${index}`}
        bordered
        loading={loading}
        pagination={pagination}
        onChange={handleTableChange}
        // --- 添加 scroll 属性 ---
        scroll={{
            // x: scrollX, // 可以使用上面计算的值
            x: 'max-content', // 或者直接使用 'max-content' 让浏览器自动计算所需宽度
            // y: 500, // 如果需要固定表头，可以设置 y 值 (垂直滚动)
        }}
      />
    </div>
  );
};

export default ListSearch;
