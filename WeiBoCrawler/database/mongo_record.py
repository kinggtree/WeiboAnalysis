# mongo_record.py（更新版）
from datetime import datetime
from enum import Enum
from typing import List, Optional, Annotated
from pydantic import BaseModel, Field, ConfigDict, GetJsonSchemaHandler, BeforeValidator
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema
from bson import ObjectId

# 修复 PyObjectId 的类型定义
PyObjectId = Annotated[
    str,
    BeforeValidator(lambda x: str(ObjectId(x)) if ObjectId.is_valid(x) else x),
    Field(..., pattern=r"^[0-9a-fA-F]{24}$")  # 确保符合 ObjectId 格式
]

class RecordFrom(str, Enum):
    Html = "html"
    Api = "api"

class AbstractBase(BaseModel):
    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        populate_by_name=True
    )
    
    mid: int
    uid: int
    search_for: str
    create_time: datetime = Field(default_factory=datetime.now)
    json_data: dict

class BodyRecord(AbstractBase):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    record_from: RecordFrom
    comment1_ids: List[PyObjectId] = Field(default_factory=list)
    comment2_ids: List[PyObjectId] = Field(default_factory=list)

class Comment1Record(AbstractBase):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    f_mid: int
    f_uid: int
    comment2_ids: List[PyObjectId] = Field(default_factory=list)

class Comment2Record(AbstractBase):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    f_mid: int
    f_uid: int
