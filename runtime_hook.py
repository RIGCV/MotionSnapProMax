# runtime_hook.py
import sys
import os
import tempfile
import locale

# 强制设置中文编码
if sys.platform == "win32":
    try:
        locale.setlocale(locale.LC_ALL, 'Chinese_Simplified China.936')
        os.environ['PYTHONIOENCODING'] = 'gbk'
    except:
        pass

# 资源路径获取函数
def resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)

# 注入到全局
import builtins
builtins.resource_path = resource_path

# 设置临时目录
if getattr(sys, 'frozen', False):
    base_path = sys._MEIPASS
    os.environ['BASE_PATH'] = base_path
    temp_dir = tempfile.gettempdir()
    os.makedirs(temp_dir, exist_ok=True)
