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
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const pollingRef = useRef(null);

  // 获取Cookie信息的函数（可复用）
  const fetchCookies = async () => {
    try {
      const response = await axios.get('/api/cookie/get-last-cookies', {
        validateStatus: (status) => status < 500
      });
      
      if (response.data?.status === 'success') {
        setCookies(response.data.cookies || null);
      }
      return response.data?.cookies || null;
    } catch (error) {
      console.error('获取Cookie失败:', error);
      return null;
    }
  };

  // 初始化加载
  useEffect(() => {
    const initLoad = async () => {
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
    setLoading(true);
    try {
      const response = await axios.post('/api/cookie/generate-qr');
      if (response.data.status === 'success') {
        setQrData(response.data.data);
        setModalOpen(true);
        startPolling(response.data.data);
      } else {
        message.error(response.data.message || '生成二维码失败');
      }
    } catch (error) {
      message.error(`请求失败: ${error.response?.data?.message || error.message}`);
    } finally {
      setLoading(false);
    }
  };


  const startPolling = (data) => {
    stopPolling();
    
    setChecking(true);
    pollingRef.current = setInterval(async () => {
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
          setModalOpen(false); // 确保关闭弹窗
          
          // 额外获取一次确保数据最新
          try {
            const freshResponse = await axios.get('/api/cookie/get-last-cookies');
            if (freshResponse.data?.cookies) {
              setCookies(freshResponse.data.cookies);
            }
          } catch (refreshError) {
            console.log('额外刷新Cookie失败:', refreshError);
          }
        } else if (response.data.status === 'pending') {
          // 继续等待
        } else {
          stopPolling();
          message.error(response.data.message || '登录状态检查失败');
        }
      } catch (error) {
        stopPolling();
        message.error(`检查登录状态失败: ${error.response?.data?.message || error.message}`);
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
      >
        {loading ? '生成二维码中...' : '扫码登录'}
      </Button>

      {/* 显示Cookie信息的卡片 */}
      {cookies ? (
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
                          onClick={() => copyToClipboard(value)}
                          size="small"
                        />
                      </span>
                    }
                    key={key}
                  >
                    <Tag color="blue" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {value}
                    </Tag>
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </Panel>
          </Collapse>
        </Card>
      ) : (
        <Card title="Cookie状态" style={{ marginTop: 16 }}>
          <p>尚未登录或Cookie已过期</p>
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
            loading={checking}
            onClick={() => {
              stopPolling();
              generateQR();
            }}
            style={{ marginTop: 16 }}
          >
            {checking ? '检测登录状态中...' : '刷新二维码'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default CookieAuth;
