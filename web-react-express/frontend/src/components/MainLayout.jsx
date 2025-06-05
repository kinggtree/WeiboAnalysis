import React from 'react';
import { Layout, Menu } from 'antd';
import { 
  SearchOutlined, 
  BarChartOutlined,
  SettingOutlined 
} from '@ant-design/icons';
import { Link, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';


const { Sider, Content } = Layout;

const MainLayout = () => {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="light"
        width={220}
        style={{ 
          boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0
        }}
      >
        <div style={{ padding: '16px 24px', fontSize: 18, fontWeight: 'bold' }}>
          微博分析系统
        </div>
        <Menu
          mode="inline"
          defaultSelectedKeys={['list-search']}
          items={[
            {
              key: 'search-group',
              label: '搜索功能',
              type: 'group',
              children: [
                {
                  key: 'list-search',
                  icon: <SearchOutlined />,
                  label: <Link to="/list-search">列表搜索</Link>,
                }
              ]
            },
            {
              key: 'analysis-group',
              label: '数据分析',
              type: 'group',
              children: [
                {
                  key: 'sentiment-analysis',
                  icon: <BarChartOutlined />,
                  label: <Link to="/sentiment">情感分析</Link>,
                  disabled: false
                }
              ]
            },
            {
              key: 'system-group',
              label: '系统设置',
              type: 'group',
              children: [
                {
                  key: 'settings',
                  icon: <SettingOutlined />,
                  label: <Link to="/settings">配置管理</Link>,
                  disabled: false
                }
              ]
            }
          ]}
        />
      </Sider>

      <Content 
        style={{ 
          marginLeft: 220,
          padding: '24px',
          background: '#f0f2f5',
          minHeight: '100vh'
        }}
      >
        <div style={{ 
          background: 'white', 
          padding: 24, 
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
};

export default MainLayout;
