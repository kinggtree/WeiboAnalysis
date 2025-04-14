# util/database_config.py（更新后）
import toml
from pathlib import Path
from pydantic import BaseModel, field_validator, Field
from .path import module_path, config_path

class DatabaseConfig(BaseModel):
    # 旧版 SQLite 配置（可选）
    path: str | None = Field(default=None)  
    
    # 新增 MongoDB 配置字段
    mongo_uri: str
    db_name: str

    @field_validator('path')
    def modify_module_path(cls, value):
        if value is None:  # 允许 path 为 None
            return None
        if Path(value).is_absolute():
            return str(value)
        else:
            return str(module_path / value)

# 加载配置（确保 TOML 文件结构正确）
database_config = DatabaseConfig.model_validate(toml.load(config_path)["database"])
