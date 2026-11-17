# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules
from PyInstaller import __main__ as pyi_main

# 添加图标（可选）
icon_path = 'TJ.ico'

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[
        # 添加YOLO模型文件
        ('yolov3-tiny.cfg', '.'),
        ('yolov3-tiny.weights', '.'),
        ('coco.names', '.'),
        # 添加备选模型文件
        ('yolov3.cfg', '.'),
        ('yolov3.weights', '.'),
    ],
    hiddenimports=[
        'cv2',
        'numpy',
        'PIL',
        'PyQt5',
        'PyQt5.QtCore',
        'PyQt5.QtGui',
        'PyQt5.QtWidgets',
        'PyQt5.sip',
        'win32ctypes',
        'win32ctypes.core',
        'win32ctypes.pywin32',
        'packaging',
        'packaging.version',
        'packaging.specifiers',
        'packaging.requirements',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=1,
    upx=False,  # 如果安装了UPX可以设置为True
)

# 添加Qt插件和资源
pyqt5_dir = os.path.dirname(sys.modules['PyQt5'].__file__)

# 添加Qt插件
a.binaries.extend([
    # Qt插件
    (os.path.join(pyqt5_dir, 'Qt5', 'bin', 'Qt5Core.dll'), '.'),
    (os.path.join(pyqt5_dir, 'Qt5', 'bin', 'Qt5Gui.dll'), '.'),
    (os.path.join(pyqt5_dir, 'Qt5', 'bin', 'Qt5Widgets.dll'), '.'),
])

# 添加必要的Qt插件文件夹
qt_plugins = [
    'platforms',
    'imageformats',
    'styles',
]

for plugin in qt_plugins:
    plugin_path = os.path.join(pyqt5_dir, 'Qt5', 'plugins', plugin)
    if os.path.exists(plugin_path):
        for file in os.listdir(plugin_path):
            if file.endswith('.dll'):
                a.datas.append((os.path.join(plugin_path, file), os.path.join('PyQt5', 'Qt5', 'plugins', plugin)))

# 主程序配置
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='智能动态监控系统',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # 不显示控制台窗口
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # icon=icon_path if os.path.exists(icon_path) else None,
    version='1.0.0.0',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='智能动态监控系统',
)
