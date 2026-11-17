# auto_build_final.py
import os
import sys
import shutil
import subprocess
from pathlib import Path
import tempfile
import zipfile

def check_pyinstaller():
    """检查并安装PyInstaller"""
    try:
        import PyInstaller
        print("✅ PyInstaller 已安装")
        return True
    except ImportError:
        print("⚠️  PyInstaller 未安装，正在安装...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
            print("✅ PyInstaller 安装成功")
            return True
        except Exception as e:
            print(f"❌ PyInstaller 安装失败: {e}")
            return False

def get_system_encoding():
    """获取系统默认编码，处理中文路径问题"""
    if sys.platform == "win32":
        return 'gbk'  # 强制使用GBK编码处理Windows路径
    return 'utf-8'

def check_requirements():
    """检查并安装依赖包"""
    requirements = [
        "opencv-python",
        "numpy",
        "pillow",
        "pyqt5",
        "pywin32"
    ]
    
    print("📦 检查依赖包...")
    system_encoding = get_system_encoding()
    
    for req in requirements:
        try:
            __import__(req.replace("-", "_"))
            print(f"  ✅ {req}")
        except ImportError:
            print(f"  ⚠️  {req} 未安装，正在安装...")
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", req],
                                    encoding=system_encoding)
                print(f"  ✅ {req} 安装成功")
            except Exception as e:
                print(f"  ❌ {req} 安装失败: {e}")
                return False
    return True

def collect_project_files():
    """收集项目所需文件"""
    project_files = {
        "main.py": "主程序",
        "yolov3-tiny.cfg": "YOLO配置文件",
        "yolov3-tiny.weights": "YOLO权重文件",
        "coco.names": "类别名称文件",
        "TJ.ico": "程序图标文件"
    }
    
    print("📁 检查项目文件...")
    missing_files = []
    
    for file, desc in project_files.items():
        if os.path.exists(file):
            print(f"  ✅ {file} ({desc})")
            # 复制图标文件到build目录，避免路径问题
            if file.endswith('.ico') and not os.path.exists(f"build/{file}"):
                os.makedirs("build", exist_ok=True)
                shutil.copy2(file, f"build/{file}")
                print(f"  📄 已复制图标文件到build目录: build/{file}")
        else:
            print(f"  ❌ {file} ({desc}) - 文件缺失!")
            missing_files.append(file)
    
    if missing_files:
        print("\n⚠️  以下文件缺失，请确保它们位于当前目录:")
        for file in missing_files:
            print(f"  - {file}")
        return False
    
    # 检查模型文件大小
    weight_files = ["yolov3-tiny.weights"]
    for weight_file in weight_files:
        if os.path.exists(weight_file):
            size_mb = os.path.getsize(weight_file) / (1024 * 1024)
            print(f"  📏 {weight_file}: {size_mb:.1f} MB")
    
    return True

def build_standalone_executable():
    """构建单文件可执行程序 - 修复中文名称和图标问题"""
    print("🚀 开始构建单文件可执行程序...")
    
    # 清理之前的构建文件
    for dir_name in ['build', 'dist', '__pycache__']:
        if os.path.exists(dir_name):
            if os.path.isdir(dir_name):
                shutil.rmtree(dir_name)
            else:
                os.remove(dir_name)
            print(f"🗑️  清理旧的{dir_name}文件夹")
    
    # 确保build目录存在
    os.makedirs("build", exist_ok=True)
    
    # 备份并修改main.py
    modify_main_file_for_standalone()
    
    # 获取系统编码
    system_encoding = get_system_encoding()
    print(f"🔤 使用系统编码: {system_encoding}")
    
    # 关键修改：使用英文程序名避免中文编码问题
    exe_name = "MotionMonitor"  # 改用英文名称
    print(f"🏷️  使用英文程序名: {exe_name} (避免中文路径问题)")
    
    # 复制图标文件到build目录（双重保险）
    icon_file = "TJ.ico"
    icon_params = []
    if os.path.exists(icon_file):
        # 复制到build目录
        build_icon_path = os.path.join("build", icon_file)
        shutil.copy2(icon_file, build_icon_path)
        # 使用绝对路径
        abs_icon_path = os.path.abspath(build_icon_path)
        icon_params = ["--icon=" + abs_icon_path]
        print(f"✅ 使用图标文件: {abs_icon_path}")
    else:
        print("⚠️  未找到图标文件，将使用默认图标")
    
    # 构建PyInstaller命令 - 使用英文名称，避免中文问题
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",                # 单文件打包
        "--windowed",               # 无控制台窗口
        f"--name={exe_name}",       # 使用英文名称
        "--clean",                  # 清理缓存
        "--noupx",                  # 禁用UPX压缩
        "--distpath=.",             # 直接输出到当前目录
        "--workpath=build",         # 工作目录
        "--specpath=build",         # spec文件目录
        "--hidden-import=cv2",
        "--hidden-import=numpy",
        "--hidden-import=PIL",
        "--hidden-import=PyQt5",
        "--hidden-import=PyQt5.QtCore",
        "--hidden-import=PyQt5.QtGui",
        "--hidden-import=PyQt5.QtWidgets",
        "--hidden-import=win32api",
        "--hidden-import=win32con",
        "--hidden-import=win32gui",
        "--hidden-import=win32ui",
        "--hidden-import=ctypes",
        "--hidden-import=ctypes.wintypes",
        "--runtime-hook=runtime_hook.py",
    ]
    
    # 添加图标参数
    cmd.extend(icon_params)
    
    # 添加所有必要的资源文件
    current_dir = os.path.abspath(".")
    data_files = [
        "yolov3-tiny.cfg",
        "yolov3-tiny.weights",
        "coco.names",
        "TJ.ico"  # 也把图标文件嵌入
    ]
    
    # 添加数据文件参数（使用绝对路径）
    for data_file in data_files:
        if os.path.exists(data_file):
            src_path = os.path.abspath(data_file)
            # Windows使用分号，处理路径中的空格
            cmd.append(f"--add-data={src_path};.")
            print(f"📦 添加嵌入文件: {data_file}")
    
    # 创建运行时钩子文件
    create_runtime_hook()
    
    # 最后指定主程序
    cmd.append("main.py")
    
    # 执行打包命令
    print(f"\n📝 执行打包命令: {' '.join(cmd)}")
    try:
        # 使用GBK编码处理输出
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='gbk',
            errors='replace',
            bufsize=1
        )
        
        # 实时打印输出
        print("\n📜 打包过程输出:")
        print("-" * 60)
        while True:
            try:
                line = process.stdout.readline()
                if not line and process.poll() is not None:
                    break
                if line:
                    print(line.strip())
            except Exception as e:
                print(f"⚠️  读取输出时出错: {e}")
                continue
        
        return_code = process.wait()
        
        # 检查是否生成了exe文件
        exe_path = f"{exe_name}.exe"
        if return_code == 0 and os.path.exists(exe_path):
            print("-" * 60)
            print("✅ 单文件程序构建成功!")
            
            # 可选：重命名为中文（如果需要）
            chinese_exe_name = "智能动态监控系统.exe"
            try:
                if os.path.exists(chinese_exe_name):
                    os.remove(chinese_exe_name)
                os.rename(exe_path, chinese_exe_name)
                exe_path = chinese_exe_name
                print(f"🔄 已将程序重命名为: {chinese_exe_name}")
            except:
                print(f"⚠️  无法重命名为中文，保留原名称: {exe_name}.exe")
            
            # 检查生成的文件
            exe_size = os.path.getsize(exe_path) / (1024 * 1024)
            print(f"📁 生成的文件: {os.path.abspath(exe_path)}")
            print(f"📏 文件大小: {exe_size:.1f} MB")
            print(f"⚡ 该文件包含了所有依赖，可独立运行")
            
            # 创建测试脚本
            create_ultimate_test_script(exe_path)
            
            return True
        else:
            print("❌ 单文件程序构建失败!")
            print(f"⚠️  返回码: {return_code}")
            return False
            
    except Exception as e:
        print(f"❌ 打包过程出错: {str(e)}")
        print(f"⚠️  错误类型: {type(e).__name__}")
        return False

def create_runtime_hook():
    """创建运行时钩子"""
    hook_content = '''# runtime_hook.py
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
'''
    
    with open("runtime_hook.py", "w", encoding="utf-8") as f:
        f.write(hook_content)
    
    print("✅ 创建运行时钩子文件: runtime_hook.py")

def modify_main_file_for_standalone():
    """修改main.py以支持单文件运行"""
    print("🔧 优化main.py以支持单文件运行...")
    
    # 备份原文件
    if not os.path.exists("main.py.original"):
        shutil.copy2("main.py", "main.py.original")
        print("📄 已备份原始main.py为main.py.original")
    
    # 读取main.py内容
    with open("main.py", "r", encoding="utf-8") as f:
        content = f.read()
    
    # 检查是否已添加路径处理
    if "resource_path(" in content:
        print("✅ main.py已包含路径处理代码，无需重复修改")
        return
    
    # 添加路径处理代码
    path_handler_code = '''# ========== 单文件运行支持 ==========
import sys
import os
import locale

# 中文编码支持
if sys.platform == "win32":
    try:
        locale.setlocale(locale.LC_ALL, 'Chinese_Simplified China.936')
    except:
        pass

def resource_path(relative_path):
    """获取资源文件路径，支持开发/打包模式"""
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)

# 全局路径变量
BASE_PATH = getattr(sys, '_MEIPASS', os.path.abspath("."))
# ========== 单文件运行支持结束 ==========

'''
    
    # 插入到文件开头
    modified_content = path_handler_code + content
    
    # 替换文件路径
    path_replacements = {
        '"yolov3-tiny.cfg"': 'resource_path("yolov3-tiny.cfg")',
        '"yolov3-tiny.weights"': 'resource_path("yolov3-tiny.weights")',
        '"coco.names"': 'resource_path("coco.names")',
        "'yolov3-tiny.cfg'": 'resource_path("yolov3-tiny.cfg")',
        "'yolov3-tiny.weights'": 'resource_path("yolov3-tiny.weights")',
        "'coco.names'": 'resource_path("coco.names")'
    }
    
    for old_str, new_str in path_replacements.items():
        modified_content = modified_content.replace(old_str, new_str)
    
    # 写入修改后的文件
    with open("main.py", "w", encoding="utf-8") as f:
        f.write(modified_content)
    
    print("✅ main.py已优化完成，支持单文件运行")

def create_ultimate_test_script(exe_path):
    """创建测试脚本"""
    test_script = f'''#!/usr/bin/env python3
# test_standalone_exe.py - 测试单文件可执行程序
import os
import subprocess
import time
import sys
import locale

# 设置中文编码
if sys.platform == "win32":
    try:
        locale.setlocale(locale.LC_ALL, 'Chinese_Simplified China.936')
    except:
        pass

print("🧪 测试智能动态监控系统单文件程序")
print("=" * 60)

exe_name = "{exe_path}"

# 检查exe文件是否存在
if not os.path.exists(exe_name):
    print(f"❌ 错误：未找到 {{exe_name}} 文件")
    sys.exit(1)

# 显示文件信息
exe_size = os.path.getsize(exe_name) / (1024 * 1024)
print(f"✅ 找到单文件程序: {{os.path.abspath(exe_name)}}")
print(f"📏 文件大小: {{exe_size:.1f}} MB")
print(f"🔍 文件类型: {{'64位' if sys.maxsize > 2**32 else '32位'}} Windows可执行文件")

# 测试运行
print("\\n🚀 测试程序启动（5秒后自动关闭）...")
print("   首次启动可能需要10-20秒解压文件，请耐心等待...")

try:
    # 启动程序
    process = subprocess.Popen(
        [exe_name],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
    )
    
    # 等待程序加载
    for i in range(5):
        print(f"   等待中... {{i+1}}/5秒")
        time.sleep(1)
    
    # 检查程序状态
    if process.poll() is None:
        print("✅ 程序成功启动并运行")
        try:
            process.terminate()
            process.wait(timeout=3)
            print("✅ 程序已正常关闭")
        except:
            process.kill()
            print("⚠️  强制关闭程序")
    else:
        exit_code = process.poll()
        stderr = process.stderr.read().decode('gbk', errors='ignore')
        stdout = process.stdout.read().decode('gbk', errors='ignore')
        
        print(f"❌ 程序异常退出，退出码: {{exit_code}}")
        if stderr:
            print("\\n错误信息:")
            print(stderr)
        if stdout:
            print("\\n输出信息:")
            print(stdout)
            
except Exception as e:
    print(f"❌ 测试失败: {{str(e)}}")

print("\\n" + "=" * 60)
print("📋 测试完成！")
print("\\n💡 使用说明:")
print("1. 直接双击 '{{exe_path}}' 即可运行")
print("2. 无需任何其他文件，程序已包含所有依赖")
print("3. 首次启动可能需要10-20秒（解压权重文件）")
print("4. 程序运行时会在后台自动处理临时文件")
print("5. 关闭程序后，临时文件会自动清理")
print("\\n⚠️  重要提示:")
print("- 首次运行请耐心等待，不要重复点击")
print("- 程序需要摄像头权限，请确保摄像头可用")
print("- 如被杀毒软件拦截，请添加信任")
'''
    
    with open("test_standalone_exe.py", "w", encoding="utf-8") as f:
        f.write(test_script)
    
    print("📄 已创建单文件测试脚本: test_standalone_exe.py")

def create_distribution_zip(exe_path):
    """创建分发压缩包"""
    if not os.path.exists(exe_path):
        print("❌ 请先成功构建单文件程序")
        return False
    
    print("📦 创建分发压缩包...")
    
    # 创建压缩包
    zip_name = "智能动态监控系统_单文件版.zip"
    
    # 删除旧的压缩包
    if os.path.exists(zip_name):
        os.remove(zip_name)
    
    # 创建新的压缩包
    with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED, compresslevel=5) as zipf:
        # 添加主程序
        zipf.write(exe_path, os.path.basename(exe_path))
        
        # 添加使用说明
        readme_content = """# 智能动态监控系统 - 单文件版使用说明

## 🚀 快速使用
1. 解压此压缩包到任意文件夹
2. 双击运行 "智能动态监控系统.exe"
3. 等待程序启动（首次启动约10-20秒）
4. 程序会自动打开摄像头并开始监控

## ⚠️ 重要提示
- 无需安装Python或任何依赖
- 无需放置其他文件，单个exe即可运行
- 首次启动较慢是正常现象（正在解压权重文件）
- 程序需要摄像头权限，请确保摄像头未被占用
- 如被杀毒软件拦截，请添加信任
- 支持Windows 7/8/10/11 64位系统

## 📋 功能说明
- 自动检测移动人物
- 智能过滤静态背景
- 检测到移动目标时自动截图
- 截图保存在桌面"screenshots"文件夹

## 🛠️ 故障排除
1. 程序无法启动：
   - 确保是64位Windows系统
   - 安装VC++运行库
   - 以管理员身份运行

2. 摄像头无法打开：
   - 确保摄像头未被其他程序占用
   - 检查摄像头驱动
   - 在设置中允许摄像头访问

3. 检测效果不佳：
   - 确保光线充足
   - 调整摄像头角度
   - 保持背景相对静止
"""
        zipf.writestr("使用说明.txt", readme_content, compress_type=zipfile.ZIP_DEFLATED)
    
    # 显示压缩包信息
    zip_size = os.path.getsize(zip_name) / (1024 * 1024)
    print(f"✅ 压缩包创建完成: {zip_name}")
    print(f"📏 压缩包大小: {zip_size:.1f} MB")
    print(f"📍 文件位置: {os.path.abspath(zip_name)}")
    
    return True

def main():
    """主函数"""
    # 设置控制台编码
    if sys.platform == "win32":
        try:
            os.system("chcp 936 > nul")  # 设置为GBK
        except:
            pass
    
    print("=" * 60)
    print("智能动态监控系统 - 单文件打包工具 v4.0 (最终修复版)")
    print("=" * 60)
    print("🎯 目标：生成单个EXE文件，无需任何其他依赖")
    print(f"📂 当前目录: {os.path.abspath('.')}")
    print("=" * 60)
    
    # 步骤1: 检查环境和依赖
    print("\n🔍 第一步：检查运行环境")
    if not check_pyinstaller():
        input("\n按Enter键退出...")
        return
    
    if not check_requirements():
        input("\n按Enter键退出...")
        return
    
    # 步骤2: 检查项目文件
    print("\n🔍 第二步：检查项目文件")
    if not collect_project_files():
        print("\n⚠️  请确保所有必要文件都在当前目录")
        input("按Enter键退出...")
        return
    
    # 步骤3: 构建单文件程序
    print("\n🔨 第三步：构建单文件可执行程序")
    build_success = build_standalone_executable()
    if not build_success:
        print("\n❌ 单文件程序构建失败")
        input("按Enter键退出...")
        return
    
    # 确定最终的exe路径
    exe_path = "智能动态监控系统.exe"
    if not os.path.exists(exe_path):
        exe_path = "MotionMonitor.exe"
    
    # 步骤4: 创建分发压缩包
    print("\n📦 第四步：创建分发压缩包")
    create_distribution_zip(exe_path)
    
    # 完成提示
    print("\n" + "=" * 60)
    print("🎉 单文件程序构建完成！")
    print("\n📋 最终文件:")
    print(f"   • 主程序: {os.path.abspath(exe_path)}")
    print(f"   • 分发包: {os.path.abspath('智能动态监控系统_单文件版.zip')}")
    print("\n💡 给用户的使用方法:")
    print("   1. 将ZIP文件发送给用户")
    print("   2. 用户解压后双击EXE即可运行")
    print("   3. 无需安装任何东西，无需其他文件")
    print("   4. 首次启动请耐心等待10-20秒")
    
    input("\n按Enter键退出...")

if __name__ == "__main__":
    main()