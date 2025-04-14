import asyncio
from abc import ABC, abstractmethod
from typing import Any

import httpx
from pydantic import BaseModel
from ..database import db, BodyRecord, Comment1Record, Comment2Record, RecordFrom
from ..util import CustomProgress, cookies_config, log_function_params, logging


logger = logging.getLogger(__name__)

class CommentID(BaseModel):
    uid: str
    mid: str


class BaseDownloader(ABC):
    def __init__(self, *, table_name: str, concurrency: int = 100):
        self.table_name = table_name
        self.semaphore = asyncio.Semaphore(concurrency)
        self.db = db
        self.res_ids = []

    @abstractmethod
    def _get_request_description(self) -> str:
        """获取进度条描述

        Returns:
            str: 进度条描述
        """
        ...

    @abstractmethod
    def _get_request_params(self) -> list:
        """获取请求参数列表

        Returns:
            list: 请求参数列表
        """
        ...

    @abstractmethod
    def _process_response(self, response: httpx.Response, *, param: Any) -> None:
        """处理请求并存储数据

        Args:
            response (httpx.Response): 需要处理的请求
            param (Any): 请求参数
        """
        ...

    @abstractmethod
    async def _process_response_asyncio(self, response: httpx.Response, *, param: Any) -> None:
        """处理请求并存储数据

        Args:
            response (httpx.Response): 需要处理的请求
            param (Any): 请求参数
        """
        ...

    @abstractmethod
    async def _download_single_asyncio(self, *, param:Any, client:httpx.Response, progress:CustomProgress, overall_task:int):
        """下载单个请求(异步)

        Args:
            param (Any): 请求参数
            client (httpx.Response): 请求客户端
            progress (CustomProgress): 进度条
            overall_task (int): 进度条任务ID
        """
        ...

    @abstractmethod
    def _download_single_sync(self, *, param: Any, client:httpx.Response, progress:CustomProgress, overall_task:int):
        """下载单个请求(同步)

        Args:
            param (Any): 请求参数
            client (httpx.Response): 请求客户端
            progress (CustomProgress): 进度条
            overall_task (int): 进度条任务ID
        """
        ...

    # 适应mongodb的修改部分
    def _save_to_database(self, items: list[BodyRecord | Comment1Record | Comment2Record]) -> None:
        """同步保存"""
        docs = [item.model_dump(by_alias=True, exclude={'id'}) for item in items]
        res_ids = self.db.sync_add_records(
            collection_name=self.table_name,  # 直接传递集合名称
            records=docs
        )
        self.res_ids.extend(res_ids)

    async def _save_to_database_asyncio(self, items: list[BodyRecord | Comment1Record | Comment2Record]) -> None:
        """异步保存"""
        if not items:
            logger.warning("保存时发现空items列表")
            return
        
        # 转换并过滤无效文档
        docs = []
        for item in items:
            doc = item.model_dump(by_alias=True, exclude={'id'})
            if doc and isinstance(doc, dict):
                docs.append(doc)
        
        if not docs:
            logger.warning("转换后的文档列表为空")
            return
        
        try:
            res_ids = await self.db.async_add_records(
                collection_name=self.table_name,
                records=docs
            )
            self.res_ids.extend(res_ids)
        except Exception as e:
            logger.error(f"数据库插入失败: {str(e)}")

    @log_function_params(logger=logger)
    def _check_response(self, response: httpx.Response) -> bool:
        """响应检查逻辑"""
        if response.status_code != 200:
            logger.warning(f"响应状态码异常: {response.status_code}")
            return False
        
        try:
            data = response.json()
            if data.get("ok") != 1:  # 假设接口返回 ok=1 表示成功
                logger.warning(f"接口返回错误: {data.get('msg')}")
                return False
        except:
            pass
        
        return True


    async def _download_asyncio(self):
        """异步下载数据

        """
        with CustomProgress() as progress:
            overall_task = progress.add_task(
                description=self._get_request_description(), total=len(self._get_request_params())
            )
            async with httpx.AsyncClient(cookies=cookies_config.cookies) as client:
                tasks = []
                for param in self._get_request_params():
                    async with self.semaphore:
                        task = asyncio.create_task(
                            self._download_single_asyncio(
                                param=param,
                                client=client,
                                progress=progress,
                                overall_task=overall_task,
                            )
                        )
                        tasks.append(task)
                await asyncio.gather(*tasks)

    def _download_sync(self):
        """同步下载数据

        """
        with CustomProgress() as progress:
            overall_task = progress.add_task(
                description=self._get_request_description(), total=len(self._get_request_params())
            )
            with httpx.Client(cookies=cookies_config.cookies) as client:
                for params in self._get_request_params():
                    self._download_single_sync(params, client, progress, overall_task)

    def download(self, asynchrony: bool = True) -> None:
        """整合异步下载和同步下载

        asynchrony = True 异步下载
        asynchrony = False 普通下载

        Args:
            asynchrony (bool, optional): 异步下载或者普通下载. Defaults to True.
        """
        if asynchrony:
            try:
                loop = asyncio.get_running_loop()
                loop.run_until_complete(self._download_asyncio())
            except RuntimeError:
                asyncio.run(self._download_asyncio())
        else:
            self._download_sync()


__all__ = [BaseDownloader, BodyRecord, Comment1Record, Comment2Record, RecordFrom]