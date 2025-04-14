# mongo.py
from typing import Any, Union
from .mongo_record import BodyRecord, Comment1Record, Comment2Record, RecordFrom, PyObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import MongoClient
import logging



class MongoDBManager:
    def __init__(self, sync_uri: str, async_uri: str, db_name: str):
        # 同步客户端
        self.sync_client = MongoClient(sync_uri)
        self.sync_db = self.sync_client[db_name]
        
        # 异步客户端
        self.async_client = AsyncIOMotorClient(async_uri)
        self.async_db = self.async_client[db_name]

    # 同步操作
    def get_sync_collection(self, collection_name: str):
        """同步获取集合"""
        return self.sync_db[collection_name]

    def sync_get_collection_names(self) -> list[str]:
        """同步获取所有集合名称（过滤系统集合）"""
        names = self.sync_db.list_collection_names()
        return [name for name in names if not name.startswith("system.")]

    def sync_add_records(self, collection_name: str, records: list[dict]) -> list[PyObjectId]:
        collection = self.get_sync_collection(collection_name)
        result = collection.insert_many(records)
        return result.inserted_ids

    def sync_get_records_by_ids(self, collection_name: str, ids: list[PyObjectId]) -> list[dict]:
        collection = self.get_sync_collection(collection_name)
        return list(collection.find({"_id": {"$in": ids}}))


    def sync_update_record(self, model: str, record_id: PyObjectId, update_data: dict) -> int:
        collection = getattr(self, f"{model}_collection")
        result = collection.update_one({"_id": record_id}, {"$set": update_data})
        return result.modified_count

    def sync_delete_record(self, model: str, record_id: PyObjectId) -> int:
        collection = getattr(self, f"{model}_collection")
        result = collection.delete_one({"_id": record_id})
        return result.deleted_count

    # 异步操作
    def get_async_collection(self, collection_name: str):
        """异步获取集合"""
        return self.async_db[collection_name]
    

    async def async_get_collection_names(self) -> list[str]:
        """异步获取所有集合名称（过滤系统集合）"""
        names = await self.async_db.list_collection_names()
        return [name for name in names if not name.startswith("system.")]
    

    async def async_add_records(self, collection_name: str, records: list[dict]) -> list[PyObjectId]:
        collection = self.get_async_collection(collection_name)
        result = await collection.insert_many(records)
        return result.inserted_ids

    async def async_get_records_by_ids(self, collection_name: str, ids: list[PyObjectId]) -> list[dict]:
        collection = self.get_async_collection(collection_name)
        return await collection.find({"_id": {"$in": ids}}).to_list(None)

    async def async_update_record(self, model: str, record_id: PyObjectId, update_data: dict) -> int:
        collection = getattr(self, f"async_{model}_collection")
        result = await collection.update_one({"_id": record_id}, {"$set": update_data})
        return result.modified_count

    async def async_delete_record(self, model: str, record_id: PyObjectId) -> int:
        collection = getattr(self, f"async_{model}_collection")
        result = await collection.delete_one({"_id": record_id})
        return result.deleted_count

    # 关联关系操作示例
    async def async_link_comments(self, body_id: PyObjectId, comment_ids: list[PyObjectId], comment_type: str):
        """关联评论到主记录"""
        update_field = f"{comment_type}_ids"
        await self.async_body_collection.update_one(
            {"_id": body_id},
            {"$addToSet": {update_field: {"$each": comment_ids}}}
        )

    async def async_get_related_comments(self, body_id: PyObjectId, comment_type: str):
        """获取关联评论"""
        body = await self.async_body_collection.find_one({"_id": body_id})
        if not body:
            return []
        
        comment_ids = body.get(f"{comment_type}_ids", [])
        collection = getattr(self, f"async_{comment_type}_collection")
        return await collection.find({"_id": {"$in": comment_ids}}).to_list(None)

__all__ = [BodyRecord, Comment1Record, Comment2Record, RecordFrom, MongoDBManager]
