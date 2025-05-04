import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import ListSearch from './components/ListSearch';
import CookieAuth from './components/CookieAuth';
import SentimentAnalysis from './components/SentimentAnalysis';


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<ListSearch />} />
          <Route path="list-search" element={<ListSearch />} />
          <Route path="settings" element={<CookieAuth />} />
          <Route path="sentiment" element={<SentimentAnalysis />} />
          
          {/* 预留路由示例 */}
          {/* <Route path="detail-search" element={<DetailSearch />} /> */}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
