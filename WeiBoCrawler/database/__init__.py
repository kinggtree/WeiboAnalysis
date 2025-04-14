from .mongo import MongoDBManager, BodyRecord, Comment1Record, Comment2Record, RecordFrom
from ..util import database_config

# MongoDB 配置（需要确保 database_config 中包含以下配置）
# 示例配置格式：
# mongodb://username:password@host:port/database?authSource=admin
mongo_uri = database_config.mongo_uri  # 同步/异步共用URI（如：mongodb://localhost:27017）
db_name = database_config.db_name      # 数据库名称（如：my_database）

# 初始化 MongoDB 客户端
db = MongoDBManager(
    sync_uri=mongo_uri,     # 同步连接字符串
    async_uri=mongo_uri,    # 异步连接字符串（与同步相同）
    db_name=db_name         # 数据库名称
)

__all__ = ["db", "BodyRecord", "Comment1Record", "Comment2Record", "RecordFrom"]
