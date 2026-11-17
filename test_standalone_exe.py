#!/usr/bin/env python3
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

exe_name = "智能动态监控系统.exe"

# 检查exe文件是否存在
if not os.path.exists(exe_name):
    print(f"❌ 错误：未找到 {exe_name} 文件")
    sys.exit(1)

# 显示文件信息
exe_size = os.path.getsize(exe_name) / (1024 * 1024)
print(f"✅ 找到单文件程序: {os.path.abspath(exe_name)}")
print(f"📏 文件大小: {exe_size:.1f} MB")
print(f"🔍 文件类型: {'64位' if sys.maxsize > 2**32 else '32位'} Windows可执行文件")

# 测试运行
print("\n🚀 测试程序启动（5秒后自动关闭）...")
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
        print(f"   等待中... {i+1}/5秒")
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
        
        print(f"❌ 程序异常退出，退出码: {exit_code}")
        if stderr:
            print("\n错误信息:")
            print(stderr)
        if stdout:
            print("\n输出信息:")
            print(stdout)
            
except Exception as e:
    print(f"❌ 测试失败: {str(e)}")

print("\n" + "=" * 60)
print("📋 测试完成！")
print("\n💡 使用说明:")
print("1. 直接双击 '{exe_path}' 即可运行")
print("2. 无需任何其他文件，程序已包含所有依赖")
print("3. 首次启动可能需要10-20秒（解压权重文件）")
print("4. 程序运行时会在后台自动处理临时文件")
print("5. 关闭程序后，临时文件会自动清理")
print("\n⚠️  重要提示:")
print("- 首次运行请耐心等待，不要重复点击")
print("- 程序需要摄像头权限，请确保摄像头可用")
print("- 如被杀毒软件拦截，请添加信任")
