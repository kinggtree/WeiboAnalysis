import React, { useState, useEffect } from 'react';
import { Button, Form, Input, Select, Table, message, Spin } from 'antd';

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
  const [serverErrorOccurred, setServerErrorOccurred] = useState(false); // 新增状态

  // 统一的错误处理函数
  const handleApiError = (error, actionDescription = '操作') => {
    let userMessage = `${actionDescription}失败`;
    let isServerError = false;

    if (error instanceof Response) { // fetch API 的 Response 对象
        const status = error.status;
        if (status === 500) {
            userMessage = '服务器内部错误';
            isServerError = true;
        } else if (status === 404) {
            userMessage = '服务器未启动';
            isServerError = true;
        } else {
            // 尝试异步读取 response body
            error.text().then(text => {
                try {
                    const errorData = JSON.parse(text);
                    userMessage = errorData.message || errorData.details || `${actionDescription}失败，状态码: ${status}`;
                } catch (e) {
                    userMessage = `${actionDescription}失败，状态码: ${status} (响应非JSON: ${text.substring(0, 100)})`;
                }
                message.error(userMessage);
            }).catch(() => {
                message.error(`${actionDescription}失败，状态码: ${status} (无法读取响应体)`);
            });
            // 注意：由于异步解析，isServerError 可能不会立即在 message.error 之前设置
            // 但对于 500/404 已经同步处理了
        }
    } else if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
        userMessage = '网络连接错误，请检查您的网络或服务器状态。';
        isServerError = true;
    } else { // 其他 JavaScript 错误
        userMessage = `处理${actionDescription}时发生未知错误: ${error.message}`;
        // 对于非网络或HTTP错误，通常不认为是服务器宕机，除非有特定逻辑
    }

    if (isServerError) {
        setServerErrorOccurred(true);
        // 对于非异步解析的错误，可以立即显示消息
        if (!(error instanceof Response && error.status !== 500 && error.status !== 404)) {
            message.error(userMessage);
        }
    } else if (!(error instanceof Response && error.status !== 500 && error.status !== 404)) {
        // 如果不是服务器错误，并且不是正在异步处理的 Response 错误，也显示消息
        message.error(userMessage);
    }


    console.error(`${actionDescription}时发生错误 (开发日志):`, error);
    return isServerError;
  };


  const resetSearchState = (keepSearchIdOnError = false) => {
    setDataSource([]);
    setPagination(prev => ({ ...prev, total: 0, current: 1 }));
    if (!keepSearchIdOnError) {
        setSearchId(null);
    }
  };

  const fetchPageData = async (sId, page, pageSize) => {
    if (serverErrorOccurred) {
        message.warning('服务器当前不可用，无法加载分页数据。');
        setLoading(false); // 确保 loading 状态被重置
        return;
    }
    setLoading(true);
    const url = `/api/list-search/page?searchId=${sId}&page=${page}&pageSize=${pageSize}`;
    try {
      const response = await fetch(url, { method: 'GET' });

      if (!response.ok) {
        handleApiError(response, '请求分页数据'); // 使用统一错误处理
        resetSearchState(true); // 保留 searchId，因为可能是临时分页错误
        // 如果分页错误非常严重，可以考虑 setSearchId(null)
        // if (response.status === 500 || response.status === 404) setSearchId(null);
        return;
      }

      const result = await response.json();
      if (result.status === 'success' && result.data && result.pagination) {
        setDataSource(result.data);
        setPagination({
          current: result.pagination.current,
          pageSize: result.pagination.pageSize,
          total: result.pagination.total,
        });
        setServerErrorOccurred(false); // 成功获取数据，清除错误标记
      } else {
         message.error(result.message || '获取分页数据成功，但响应格式不正确或处理失败。');
         // resetSearchState(); // 可选：如果认为这是严重错误
      }
    } catch (error) {
      handleApiError(error, '处理分页数据');
      resetSearchState(true); // 保留 searchId
      // if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) setSearchId(null);
    } finally {
      setLoading(false);
    }
  };

   const handleSearch = async (values) => {
    if (serverErrorOccurred) {
        message.warning('服务器当前不可用，无法执行搜索。');
        return;
    }
    setLoading(true);
    setSearchId(null);
    resetSearchState();

    try {
      const response = await fetch('/api/list-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        handleApiError(response, '搜索请求');
        return; // resetSearchState 已经在开头调用
      }

      const result = await response.json();
      if (result.status === 'success') {
        if (result.searchId && result.data && result.pagination) {
            setDataSource(result.data);
            setPagination(result.pagination);
            setSearchId(result.searchId);
            setServerErrorOccurred(false); // 搜索成功，清除错误标记
            if (result.data.length === 0 || result.pagination.total === 0) {
                 message.info('搜索成功，但未找到相关结果。');
            }
        } else {
             message.error('搜索响应格式不正确，缺少必要数据。');
        }
      } else {
         message.error(result.message || '搜索失败，请重试。');
      }
    } catch (error) {
      handleApiError(error, '处理搜索请求');
    } finally {
      setLoading(false);
    }
  };

  const handleTableChange = (newPagination, filters, sorter) => {
    if (serverErrorOccurred) {
        message.warning('服务器当前不可用，无法切换分页。');
        // 可以选择是否回退分页状态
        // setPagination(prev => ({ ...prev, current: pagination.current, pageSize: pagination.pageSize }));
        return;
    }
    if (searchId) {
        if (newPagination.current !== pagination.current || newPagination.pageSize !== pagination.pageSize) {
            fetchPageData(
                searchId,
                newPagination.current,
                newPagination.pageSize
            );
        }
    } else {
         setPagination(prev => ({
            ...prev,
            current: newPagination.current,
            pageSize: newPagination.pageSize,
        }));
    }
  };

  const columns = dataSource.length > 0 && dataSource[0]
    ? Object.keys(dataSource[0]).map(key => ({
        title: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        dataIndex: key,
        key: key,
        width: 150,
        ellipsis: true,
        render: (text) => (text === null || typeof text === 'undefined' || text === '') ? '-' : String(text),
      }))
    : [];

  const isValidDateString = (dateString) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;
    const [year, month, day] = dateString.split('-').map(Number);
    return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
      <Form form={form} layout="vertical" onFinish={handleSearch} style={{ marginBottom: 20 }}>
        {/* ... (Form.Item fields remain the same) ... */}
        <Form.Item
          label="搜索内容"
          name="search_for"
          initialValue="江南大学"
          rules={[{ required: true, message: '请输入搜索内容!' }]}
        >
          <Input placeholder="例如：事件、人物、地点" disabled={serverErrorOccurred || loading} />
        </Form.Item>
        <Form.Item label="搜索类型" name="kind" initialValue="综合">
          <Select options={[
            { value: '综合', label: '综合' },
            { value: '实时', label: '实时' },
          ]} disabled={serverErrorOccurred || loading} />
        </Form.Item>
        <Form.Item
          label="筛选条件 (类型为综合时有效)"
          name="advanced_kind"
          initialValue="综合"
        >
          <Select
            options={[
              { value: '综合', label: '综合' },
              { value: '热度', label: '热度' },
              { value: '原创', label: '原创' }
            ]}
            disabled={serverErrorOccurred || loading}
          />
        </Form.Item>
        <Form.Item
          label="起始日期"
          name="start"
          initialValue="2020-01-01"
          rules={[
            { required: true, message: '请输入起始日期!' },
            { validator: (_, value) => (value && !isValidDateString(value)) ? Promise.reject(new Error('日期格式无效，应为 YYYY-MM-DD')) : Promise.resolve() },
          ]}
        >
          <Input placeholder="YYYY-MM-DD" disabled={serverErrorOccurred || loading} />
        </Form.Item>
        <Form.Item
          label="结束日期"
          name="end"
          initialValue={new Date().toISOString().split('T')[0]}
          dependencies={['start']}
          rules={[
            { required: true, message: '请输入结束日期!' },
            { validator: (_, value) => (value && !isValidDateString(value)) ? Promise.reject(new Error('日期格式无效，应为 YYYY-MM-DD')) : Promise.resolve() },
            ({ getFieldValue }) => ({
              validator(_, value) {
                const startDateStr = getFieldValue('start');
                if (!value || !startDateStr || !isValidDateString(startDateStr) || !isValidDateString(value)) return Promise.resolve();
                if (new Date(value) < new Date(startDateStr)) return Promise.reject(new Error('结束日期不能早于起始日期!'));
                return Promise.resolve();
              },
            }),
          ]}
        >
          <Input placeholder="YYYY-MM-DD" disabled={serverErrorOccurred || loading} />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading && !searchId} // Original loading condition
            disabled={loading || serverErrorOccurred} // Add serverErrorOccurred
          >
            {serverErrorOccurred ? '服务不可用' : '搜索'}
          </Button>
        </Form.Item>
      </Form>

      {serverErrorOccurred && (
        <div style={{ textAlign: 'center', color: 'red', marginBottom: '20px' }}>
          服务器连接失败或发生内部错误，部分功能可能无法使用。请稍后重试。
        </div>
      )}

      <Spin spinning={loading} tip="加载数据中...">
        <Table
          columns={columns}
          dataSource={dataSource}
          rowKey={(record, index) => record.id || `${record[Object.keys(record)[0]] || 'key'}-${index}-${pagination.current}`}
          bordered
          pagination={pagination}
          onChange={handleTableChange}
          scroll={{ x: 'max-content' }}
          // Disable pagination interaction if server error
          components={serverErrorOccurred ? {
            pagination: () => <div style={{textAlign: 'center', padding: '16px', color: 'grey'}}>分页功能暂不可用</div>
          } : undefined}
        />
      </Spin>
    </div>
  );
};

export default ListSearch;
