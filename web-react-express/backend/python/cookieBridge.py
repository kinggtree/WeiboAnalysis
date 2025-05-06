# -*- coding: utf-8 -*-
import sys
import json
import base64
import toml
from datetime import datetime
from io import BytesIO
from filelock import FileLock
from util import (
    cookies_config, config_path,
    get_qr_Info, get_qr_status
)
import requests
import traceback
import io

# 强制标准输出和错误输出使用UTF-8编码
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def serialize_client(client) -> str:
    """安全序列化客户端对象（兼容自定义Client类）"""
    session_state = {
        'cookies': dict(client.cookies),
        'headers': dict(client.headers),
        # 仅保留实际存在的属性
    }
    
    # 可选：动态检查其他属性是否存在
    for attr in ['proxies', 'auth', 'cert', 'verify']:
        if hasattr(client, attr):
            session_state[attr] = getattr(client, attr)
    
    return base64.b64encode(json.dumps(session_state).encode('utf-8')).decode('utf-8')


def reconstruct_client(serialized: str) -> requests.Session:
    """反序列化requests session对象"""
    try:
        session_state = json.loads(base64.b64decode(serialized).decode('utf-8'))
        client = requests.Session()
        
        # 还原cookies
        client.cookies.update(session_state.get('cookies', {}))
        
        # 还原其他属性
        client.headers.update(session_state.get('headers', {}))
        client.auth = session_state.get('auth')
        client.proxies = session_state.get('proxies', {})
        client.verify = session_state.get('verify', True)
        client.cert = session_state.get('cert')
        
        return client
    except Exception as e:
        raise ValueError(f"客户端会话重建失败: {str(e)}")

def generate_qr():
    """生成登录二维码"""
    try:
        image, client, login_signin_url, qrid = get_qr_Info()
        
        # 将PIL图像转换为字节流
        img_byte_arr = BytesIO()
        image.save(img_byte_arr, format='PNG', quality=100)
        img_data = img_byte_arr.getvalue()
        img_byte_arr.close()
        
        # 确保Base64编码正确
        base64_image = base64.b64encode(img_data).decode('ascii')  # 注意这里使用ascii
        
        # 修改 generate_qr() 的返回结构，去掉多余的data层级
        return {
            "status": "success",
            "image": base64_image,
            "client": serialize_client(client),
            "login_signin_url": login_signin_url,
            "qrid": qrid
        }

    except Exception as e:
        traceback.print_exc()
        return {
            "status": "error",
            "message": f"二维码生成失败: {str(e)}"
        }


def check_login(params):
    """检查登录状态"""
    client = None
    try:
        # 参数验证
        required_fields = ['client', 'login_signin_url', 'qrid']
        if not all(field in params for field in required_fields):
            return {"status": "error", "message": "缺少必要参数"}

        # 反序列化客户端会话
        client = reconstruct_client(params['client'])
        
        # 获取登录状态
        cookies = get_qr_status(
            client,
            params['login_signin_url'],
            params['qrid']
        )
        
        if not cookies:
            return {"status": "pending"}
            
        # 更新cookies
        update_cookies(cookies)
        
        return {
            "status": "success",
            "cookies": cookies,
            "update_time": datetime.now().isoformat()
        }
        
    except requests.RequestException as e:
        return {"status": "error", "message": f"网络请求异常: {str(e)}"}
    except ValueError as e:
        return {"status": "error", "message": f"会话无效: {str(e)}"}
    except Exception as e:
        traceback.print_exc()
        return {"status": "error", "message": f"系统异常: {str(e)}"}
    finally:
        if client:
            client.close()

def update_cookies(cookies):
    """安全更新配置文件"""
    try:
        # 将WindowsPath转换为字符串后再拼接
        lock_path = str(config_path) + ".lock"
        with FileLock(lock_path):
            # 读取当前配置
            with open(config_path, "r", encoding="utf-8") as f:
                config_data = toml.load(f)
            
            # 更新数据
            cookies_config.cookies.update(cookies)
            cookies_config.cookies_info["update_time"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            config_data["cookies"].update(cookies_config.cookies)
            config_data["cookies_info"].update(cookies_config.cookies_info)
            
            # 写入文件
            with open(config_path, "w", encoding="utf-8") as f:
                toml.dump(config_data, f)
                
    except Exception as e:
        traceback.print_exc()
        raise RuntimeError(f"配置文件更新失败: {str(e)}")  # 确保错误信息是UTF-8编码


if __name__ == "__main__":
    try:
        # 从stdin读取完整请求数据
        input_data = json.load(sys.stdin)
        action = input_data["action"]
        params = input_data.get("params", {})
        
        if action == "generate_qr":
            result = generate_qr()
        elif action == "check_login":
            result = check_login(params)
        else:
            result = {"status": "error", "message": "无效操作"}
            
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        traceback.print_exc()
        print(json.dumps({
            "status": "error",
            "message": f"主程序异常: {str(e)}"
        }))