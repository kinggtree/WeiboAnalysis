import React, { useState, useEffect, useRef } from 'react';
import { Button, Modal, Image, message, Card, Descriptions, Tag, Collapse, Spin } from 'antd';
import { ReloadOutlined, QrcodeOutlined, CopyOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Panel } = Collapse;

const CookieAuth = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [checking, setChecking] = useState(false);
  const [cookies, setCookies] = useState(null);
  const [loading, setLoading] = useState(false); // For generateQR button
  const [initLoading, setInitLoading] = useState(true);
  const pollingRef = useRef(null);
  const [serverErrorOccurred, setServerErrorOccurred] = useState(false); // 新增状态：标记服务器是否出错

  // 统一的错误处理函数，用于设置 serverErrorOccurred
  const handleApiError = (error, actionDescription = '操作') => {
    let userMessage = `${actionDescription}失败`;
    let isServerError = false;

    if (error.response) {
      const status = error.response.status;
      if (status === 500) {
        userMessage = '服务器内部错误';
        isServerError = true;
      } else if (status === 404) {
        userMessage = '服务器未启动';
        isServerError = true;
      } else {
        userMessage = `${actionDescription}失败: ${error.response.data?.message || error.message || `状态码 ${status}`}`;
      }
    } else if (error.request) {
      userMessage = `${actionDescription}失败: 网络连接错误，请检查服务器状态或您的网络连接。`;
      // 考虑将网络连接错误也视为一种服务器错误，从而禁用按钮
      isServerError = true;
    } else {
      userMessage = `${actionDescription}失败: 请求发生错误 - ${error.message}`;
    }
    message.error(userMessage);
    if (isServerError) {
      setServerErrorOccurred(true);
    }
    console.error(`${actionDescription}错误详情:`, error);
    return isServerError; // 返回是否是服务器级错误
  };


  // 获取Cookie信息的函数
  const fetchCookies = async (showErrorMessages = true) => {
    try {
      const response = await axios.get('/api/cookie/get-last-cookies', {
        validateStatus: (status) => status < 500 // 4xx 状态码不会抛出错误
      });
      
      if (response.status === 404) {
        if (showErrorMessages) message.error('服务器未启动');
        setServerErrorOccurred(true); // 404 也标记服务器错误
        return null;
      }
      
      // 如果成功获取，清除之前的服务器错误标记
      setServerErrorOccurred(false);
      if (response.data?.status === 'success') {
        setCookies(response.data.cookies || null);
      }
      return response.data?.cookies || null;
    } catch (error) {
      // 500 及以上错误会进入这里
      // handleApiError 会处理 message.error 和 setServerErrorOccurred
      if (showErrorMessages) {
        handleApiError(error, '获取Cookie信息');
      } else {
        // 即使不显示消息，也需要标记服务器错误
        if (error.response && (error.response.status === 500 || error.response.status === 404)) {
          setServerErrorOccurred(true);
        } else if (error.request) { // 网络错误
          setServerErrorOccurred(true);
        }
        console.error('获取Cookie失败 (静默):', error);
      }
      return null;
    }
  };

  // 初始化加载
  useEffect(() => {
    const initLoad = async () => {
      setInitLoading(true); // 确保初始加载状态正确
      await fetchCookies();
      setInitLoading(false);
    };
    initLoad();
  }, []);

  // 复制到剪贴板功能
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  };

  // 生成二维码
  const generateQR = async () => {
    if (serverErrorOccurred) { // 如果已知服务器错误，则不尝试
        message.warning('服务器当前不可用，请稍后再试。');
        return;
    }
    setLoading(true);
    try {
      const response = await axios.post('/api/cookie/generate-qr');
      if (response.data.status === 'success') {
        setQrData(response.data.data);
        setModalOpen(true);
        startPolling(response.data.data);
        setServerErrorOccurred(false); // 成功后清除错误标记
      } else {
        message.error(response.data.message || '生成二维码失败');
        // 根据后端返回的错误类型，判断是否是服务器级错误
        // 假设如果不是 success，且没有特定状态码，可能是业务逻辑错误，不一定是服务器宕机
      }
    } catch (error) {
      handleApiError(error, '生成二维码');
    } finally {
      setLoading(false);
    }
  };


  const startPolling = (data) => {
    stopPolling();
    
    setChecking(true);
    pollingRef.current = setInterval(async () => {
      if (serverErrorOccurred) { // 如果在轮询期间检测到服务器错误，停止轮询
          stopPolling();
          message.error('因服务器连接问题，已停止检查登录状态。');
          return;
      }
      try {
        const response = await axios.post('/api/cookie/check-login', {
          client: data.client,
          login_signin_url: data.login_signin_url,
          qrid: data.qrid
        });
        
        if (response.data.status === 'success') {
          stopPolling();
          setCookies(response.data.cookies);
          message.success('登录成功！');
          setModalOpen(false);
          setServerErrorOccurred(false); // 登录成功，清除错误标记
          
          // 额外获取一次确保数据最新
          // fetchCookies(false) 静默获取，不重复弹窗，但会更新 serverErrorOccurred
          const freshCookies = await fetchCookies(false);
          if (freshCookies) {
            setCookies(freshCookies);
          }
        } else if (response.data.status === 'pending') {
          // 继续等待
        } else {
          stopPolling();
          message.error(response.data.message || '登录状态检查失败');
        }
      } catch (error) {
        stopPolling();
        // handleApiError 会处理 message.error 和 setServerErrorOccurred
        handleApiError(error, '检查登录状态');
      }
    }, 3000);
  };


  // 停止轮询
  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setChecking(false);
  };

  // 组件卸载时清除轮询
  useEffect(() => {
    return () => stopPolling();
  }, []);

  if (initLoading) {
    return (
      <div style={{ padding: '16px', textAlign: 'center' }}>
        <Spin tip="加载中..." size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      <Button 
        icon={<QrcodeOutlined />}
        onClick={generateQR}
        type="primary"
        style={{ marginBottom: 16 }}
        loading={loading}
        disabled={loading || serverErrorOccurred} // 添加 serverErrorOccurred 到 disabled 条件
      >
        {loading ? '生成二维码中...' : (serverErrorOccurred ? '服务不可用' : '扫码登录')}
      </Button>

      {/* 显示Cookie信息的卡片 */}
      {cookies && !serverErrorOccurred ? ( // 只有在没有服务器错误且有cookies时显示
        <Card title="当前Cookie信息" style={{ marginTop: 16 }}>
          <Collapse bordered={false} defaultActiveKey={['1']}>
            <Panel header="查看详细Cookie" key="1">
              <Descriptions bordered column={1}>
                {Object.entries(cookies).map(([key, value]) => (
                  <Descriptions.Item 
                    label={
                      <span>
                        {key} 
                        <Button 
                          type="text" 
                          icon={<CopyOutlined />} 
                          onClick={() => copyToClipboard(String(value))}
                          size="small"
                          disabled={serverErrorOccurred} // 复制按钮也应禁用
                        />
                      </span>
                    }
                    key={key}
                  >
                    <Tag color="blue" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {String(value)}
                    </Tag>
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </Panel>
          </Collapse>
        </Card>
      ) : (
        <Card title="Cookie状态" style={{ marginTop: 16 }}>
          {serverErrorOccurred ? (
            <p style={{ color: 'red' }}>服务器连接失败，请检查网络或稍后再试。</p>
          ) : (
            <p>尚未登录或Cookie已过期。</p>
          )}
        </Card>
      )}

      <Modal
        title="使用微博APP扫码登录"
        open={modalOpen}
        onCancel={() => {
          stopPolling();
          setModalOpen(false);
        }}
        footer={null}
        width={350}
        destroyOnClose
      >
        <div style={{ textAlign: 'center' }}>
          {qrData?.image ? (
            <div style={{ padding: '16px' }}>
              <Image
                src={`data:image/png;base64,${qrData.image}`}
                alt="微博登录二维码"
                width={256}
                height={256}
                preview={false}
              />
            </div>
          ) : (
            <div style={{ 
              width: 256, 
              height: 256, 
              margin: '0 auto',
              backgroundColor: '#f0f0f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999'
            }}>
              {loading ? <Spin tip="生成二维码中..." /> : '二维码加载中...'}
            </div>
          )}

          <Button
            icon={<ReloadOutlined />}
            loading={checking || loading}
            onClick={() => {
              if (loading || serverErrorOccurred) return; // 防止在生成或服务器错误时重复点击
              stopPolling();
              generateQR();
            }}
            style={{ marginTop: 16 }}
            disabled={checking || loading || serverErrorOccurred} // 添加 serverErrorOccurred
          >
            {checking ? '检测登录状态中...' : (loading ? '生成二维码中...' : (serverErrorOccurred ? '服务不可用' : '刷新二维码'))}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default CookieAuth;
